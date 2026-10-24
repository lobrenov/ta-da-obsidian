import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { deadlineLabel, rowLabel } from "../src/ui/navigator/dates";
import { taskRow, type TaskRowOptions } from "../src/ui/navigator/rows";
import { makeItem } from "./support";

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const today = date("2026-10-02");

function row(frontmatter: string, options: Partial<TaskRowOptions> = {}, body = "", extra: string[] = []) {
	const task = makeItem("Ta Da/tasks/T.md", `type: task\n${frontmatter}`, body);
	const index = new VaultIndex([task, ...extra.map((text, at) => makeItem(`Ta Da/projects/P${at}.md`, text))]);
	return taskRow(index, task, today, { dates: "elsewhere", place: false, ...options });
}

describe("a task row's date pill", () => {
	it("is the deadline when set, else the due date, and none for a task without either", () => {
		expect(row("status: Doing\ndueDate: 2026-10-10\ndeadline: 2026-10-20").date).toMatchObject({ kind: "deadline", text: "20 Oct" });
		expect(row("status: Doing\ndueDate: 2026-10-10").date).toMatchObject({ kind: "due", text: "10 Oct" });
		expect(row("status: Doing").date).toBeNull();
	});

	it("reads short elsewhere: Today, the weekday for the next six days, else the day and month, with the year in another", () => {
		expect(rowLabel(date("2026-10-02"), today)).toBe("Today");
		expect(rowLabel(date("2026-10-03"), today)).toBe("Sat");
		expect(rowLabel(date("2026-10-08"), today)).toBe("Thu");
		expect(rowLabel(date("2026-10-09"), today)).toBe("9 Oct");
		expect(rowLabel(date("2026-10-01"), today)).toBe("1 Oct");
		expect(rowLabel(date("2027-01-04"), today)).toBe("4 Jan 2027");
	});

	it("is overdue for a past date, and for a deadline today but not a due date today", () => {
		expect(row("status: Doing\ndueDate: 2026-10-01").date?.overdue).toBe(true);
		expect(row("status: Doing\ndeadline: 2026-10-02").date?.overdue).toBe(true);
		expect(row("status: Doing\ndueDate: 2026-10-02").date).toMatchObject({ text: "Today", overdue: false });
		expect(row("status: Doing\ndeadline: 2026-10-05").date?.overdue).toBe(false);
	});

	it("shows none for a done or cancelled task", () => {
		expect(row("status: Done\ncompletedDate: 2026-10-02\ndeadline: 2026-10-01").date).toBeNull();
		expect(row("status: Cancelled\ncompletedDate: 2026-10-02\ndueDate: 2026-10-01").date).toBeNull();
	});

	it("names the kind and full date in its tooltip", () => {
		expect(row("status: Doing\ndeadline: 2026-10-06").date?.tooltip).toBe("Deadline Tue 6 Oct");
		expect(row("status: Doing\ndueDate: 2026-10-01").date?.tooltip).toBe("Due Thu 1 Oct, overdue");
		expect(row("status: Doing\ndueDate: 2026-10-02").date?.tooltip).toBe("Due today");
	});
});

describe("the Agenda's rules for the pill", () => {
	const agenda = { dates: "agenda" } as const;

	it("reads a deadline as Today, days left or days late", () => {
		expect(deadlineLabel(date("2026-10-02"), today)).toBe("Today");
		expect(deadlineLabel(date("2026-10-05"), today)).toBe("3 days left");
		expect(deadlineLabel(date("2026-10-03"), today)).toBe("1 day left");
		expect(deadlineLabel(date("2026-10-01"), today)).toBe("1 day late");
		expect(deadlineLabel(date("2026-09-29"), today)).toBe("3 days late");
		expect(row("status: Doing\ndeadline: 2026-10-05", agenda).date?.text).toBe("3 days left");
	});

	it("shows a due date only when it's overdue, as the short date", () => {
		expect(row("status: Doing\ndueDate: 2026-10-02", agenda).date).toBeNull();
		expect(row("status: Doing\ndueDate: 2026-10-05", agenda).date).toBeNull();
		expect(row("status: Doing\ndueDate: 2026-09-20", agenda).date).toMatchObject({ kind: "due", text: "20 Sep", overdue: true });
	});

	it("shows a deadline with an overdue due date behind it as the deadline", () => {
		expect(row("status: Doing\ndueDate: 2026-09-20\ndeadline: 2026-10-04", agenda).date).toMatchObject({ kind: "deadline", text: "2 days left" });
	});

	it("shows a week's entry as the date it's listed for", () => {
		const task = makeItem("Ta Da/tasks/T.md", "type: task\nstatus: Doing\ndueDate: 2026-10-05\ndeadline: 2026-10-07");
		const index = new VaultIndex([task]);
		const entries = [
			{ item: task, date: date("2026-10-05"), kind: "due" as const },
			{ item: task, date: date("2026-10-07"), kind: "deadline" as const },
		];
		const rows = entries.map((entry) => taskRow(index, task, today, { dates: "agenda", place: true, entry }));
		expect(rows.map((r) => [r.id, r.date?.kind, r.date?.text])).toEqual([
			["Ta Da/tasks/T.md#due", "due", "Mon"],
			["Ta Da/tasks/T.md#deadline", "deadline", "5 days left"],
		]);
	});
});

describe("a task row's place and glyphs", () => {
	const project = "type: project\nstatus: Doing";

	it("names the project where the list's groups don't", () => {
		expect(row('status: Doing\nproject: "[[P0]]"', { place: true }, "", [project]).place).toBe("P0");
		expect(row('status: Doing\nproject: "[[P0]]"', { place: false }, "", [project]).place).toBeNull();
	});

	it("has no place for a loose task", () => {
		expect(row("status: Doing", { place: true }).place).toBeNull();
	});

	it("shows a glyph for a note, subtasks and tags, and none for a bare task", () => {
		const bare = row("status: Doing");
		expect([bare.note, bare.subtasks, bare.tags]).toEqual([false, null, 0]);
		const full = row("status: Doing\ntags: [a, b]", {}, "Some words.\n\n- [x] one\n- [ ] two\n");
		expect([full.note, full.subtasks, full.tags]).toEqual([true, { done: 1, total: 2 }, 2]);
		expect(row("status: Doing", {}, "- [ ] only a box\n").note).toBe(false);
	});

	it("has no repeat field", () => {
		expect("repeat" in row("status: Doing\nrepeat: weekly")).toBe(false);
	});
});
