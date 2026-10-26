import { describe, expect, it } from "vitest";
import { VaultIndex } from "../../src/core/index/vaultIndex";
import { LocalDate } from "../../src/core/model/localDate";
import { buildHeaderModel, dateLabel, hasHeader, modelFromText, statusChoices, statusLabel } from "../../src/ui/header/headerModel";
import { makeItem } from "../support";

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const today = date("2026-10-02");

const area = makeItem("Ta Da/areas/Personal.md", "type: area");
const project = makeItem("Ta Da/projects/Ta Da MVP.md", 'type: project\nstatus: Doing\narea: "[[Personal]]"');
const index = new VaultIndex([area, project]);

describe("dateLabel", () => {
	it("says Today, else the weekday, day and month", () => {
		expect(dateLabel(today, today)).toBe("Today");
		expect(dateLabel(date("2026-10-06"), today)).toBe("Tue 6 Oct");
	});

	it("adds the year when it isn't this year", () => {
		expect(dateLabel(date("2027-01-04"), today)).toBe("Mon 4 Jan 2027");
	});
});

describe("buildHeaderModel", () => {
	it("draws a task's chips: status, project, dates", () => {
		const task = makeItem(
			"Ta Da/tasks/Write.md",
			'type: task\nstatus: Doing\nproject: "[[Ta Da MVP]]"\ndueDate: 2026-10-02\ndeadline: 2026-10-06\ncreatedDate: 2026-09-28\ntags: [dev]',
			"- [x] one\n- [ ] two\n",
		);
		const model = buildHeaderModel(task, index, today);
		expect(model?.chips).toEqual([
			{ kind: "status", status: "Doing", label: "Doing" },
			{ kind: "parent", label: "Ta Da MVP", icon: "ring", missing: false, unresolved: false },
			{ kind: "dueDate", label: "Due Today", missing: false, tone: "due" },
			{ kind: "deadline", label: "Deadline Tue 6 Oct", missing: false, tone: "deadline" },
		]);
		expect(model?.tags).toEqual([{ name: "dev", inFrontmatter: true }]);
		expect(model?.summary).toBe("1/2 subtasks · Created Mon 28 Sep");
		expect(model?.parent).toEqual({ kind: "project", title: "Ta Da MVP" });
	});

	it("shows missing keys as missing chips", () => {
		const model = buildHeaderModel(makeItem("Ta Da/tasks/Bare.md", "type: task"), index, today);
		expect(model?.chips).toEqual([
			{ kind: "status", status: "Not Started", label: "Not started" },
			{ kind: "parent", label: "Project", icon: "ring", missing: true, unresolved: false },
			{ kind: "dueDate", label: "Due", missing: true, tone: "muted" },
			{ kind: "deadline", label: "Deadline", missing: true, tone: "muted" },
		]);
	});

	it("marks a parent no file has as unresolved, and a task under an area with its cube", () => {
		const lost = buildHeaderModel(makeItem("Ta Da/tasks/Lost.md", 'type: task\nproject: "[[Nowhere]]"'), index, today);
		expect(lost?.chips[1]).toMatchObject({ label: "Nowhere", unresolved: true });
		const filed = buildHeaderModel(makeItem("Ta Da/tasks/Filed.md", 'type: task\narea: "[[Personal]]"'), index, today);
		expect(filed?.chips[1]).toMatchObject({ label: "Personal", icon: "cube", unresolved: false });
		expect(filed?.parent).toEqual({ kind: "area", title: "Personal" });
	});

	it("colours a passed date as a deadline and a closed file's dates as muted", () => {
		const late = buildHeaderModel(makeItem("Ta Da/tasks/Late.md", "type: task\nstatus: Doing\ndueDate: 2026-09-30"), index, today);
		expect(late?.chips[2]).toMatchObject({ kind: "dueDate", tone: "deadline" });
		const done = buildHeaderModel(makeItem("Ta Da/tasks/Done.md", "type: task\nstatus: Done\ndueDate: 2026-09-30"), index, today);
		expect(done?.chips[2]).toMatchObject({ tone: "muted" });
	});

	it("gives a project an area chip, and an area only its tags", () => {
		const model = buildHeaderModel(project, index, today);
		expect(model?.chips[1]).toMatchObject({ kind: "parent", label: "Personal", icon: "cube", unresolved: false });
		const bare = buildHeaderModel(makeItem("Ta Da/projects/Bare.md", "type: project"), index, today);
		expect(bare?.chips[1]).toMatchObject({ label: "Area", missing: true });
		const areaModel = buildHeaderModel(makeItem("Ta Da/areas/Home.md", "type: area\ntags: [home]"), index, today);
		expect(areaModel?.chips).toEqual([]);
		expect(areaModel?.tags).toEqual([{ name: "home", inFrontmatter: true }]);
	});

	it("lists tags written only in the text as not removable", () => {
		const model = buildHeaderModel(makeItem("Ta Da/tasks/T.md", "type: task\ntags: [a]", "About #b and #a\n"), index, today);
		expect(model?.tags).toEqual([
			{ name: "a", inFrontmatter: true },
			{ name: "b", inFrontmatter: false },
		]);
	});
});

describe("modelFromText", () => {
	it("reads the text as typed", () => {
		const text = "---\ntype: task\nstatus: Blocked\n---\n";
		expect(modelFromText(text, "Ta Da/tasks/X.md", index, today)?.status).toBe("Blocked");
	});

	it("has no header for a note", () => {
		expect(modelFromText("---\ntags: [a]\n---\n", "Notes/Idea.md", index, today)).toBeNull();
		expect(modelFromText("Just text", "Notes/Idea.md", index, today)).toBeNull();
	});
});

describe("statusChoices", () => {
	it("offers Ongoing on projects only", () => {
		expect(statusChoices("task")).toEqual(["Not Started", "Doing", "Blocked", "Done", "Cancelled"]);
		expect(statusChoices("project")).toContain("Ongoing");
	});
});

describe("statusLabel", () => {
	it("writes a status in sentence case", () => {
		expect(statusLabel("Not Started")).toBe("Not started");
		expect(statusLabel("Doing")).toBe("Doing");
		expect(statusLabel("Cancelled")).toBe("Cancelled");
	});
});

describe("hasHeader", () => {
	it("is true for typed files from the frontmatter alone, and false for notes", () => {
		expect(hasHeader("---\ntype: Project\n---\n")).toBe(true);
		expect(hasHeader("---\ntype: area\n---\n")).toBe(true);
		expect(hasHeader("---\ntags: [a]\n---\nBody")).toBe(false);
		expect(hasHeader("Body only")).toBe(false);
		expect(hasHeader("---\ntype: meeting\n---\n")).toBe(false);
	});

	it("doesn't read the body: a note with a long body is turned away", () => {
		const note = `---\ntags: [a]\n---\n${"- [ ] box\n".repeat(5000)}`;
		expect(modelFromText(note, "Notes/Big.md", index, today)).toBeNull();
	});
});

describe("a repeating task's chips", () => {
	const chips = (frontmatter: string) => (buildHeaderModel(makeItem("Ta Da/tasks/R.md", `type: task\n${frontmatter}`), index, today)?.chips ?? []).filter((chip) => chip.kind === "dueDate" || chip.kind === "deadline");

	it("puts the frequency and tooltip on the due chip", () => {
		const [due, deadline] = chips("status: Doing\ndueDate: 2026-10-05\nrepeat: every week on Mon");
		expect(due).toMatchObject({ label: "Due Mon 5 Oct", repeat: { label: "Weekly", readable: true, tooltip: "Repeats every week on Monday · next Mon 12 Oct" } });
		expect(deadline).not.toHaveProperty("repeat");
	});

	it("labels a when done rule and a longer interval", () => {
		expect(chips("dueDate: 2026-10-05\nrepeat: every 2 weeks when done")[0]).toMatchObject({ repeat: { label: "Every 2 weeks when done" } });
		expect(chips("dueDate: 2026-10-05\nrepeat: every weekday")[0]).toMatchObject({ repeat: { label: "Weekdays" } });
	});

	it("goes on the deadline chip when there is no due date", () => {
		const [due, deadline] = chips("deadline: 2026-10-09\nrepeat: every month");
		expect(due).not.toHaveProperty("repeat");
		expect(deadline).toMatchObject({ repeat: { label: "Monthly", readable: true } });
	});

	it("goes on the dashed due chip when there is no date", () => {
		const [due, deadline] = chips("repeat: every day");
		expect(due).toMatchObject({ label: "Due", missing: true, repeat: { label: "Daily" } });
		expect(deadline).not.toHaveProperty("repeat");
	});

	it("shows an unreadable rule as written, as a warning", () => {
		expect(chips("dueDate: 2026-10-05\nrepeat: Weekly - Fri")[0]).toMatchObject({
			repeat: { label: "Weekly - Fri", readable: false, tooltip: "Ta Da can't read this rule, so the task doesn't repeat" },
		});
	});

	it("has no suffix without a repeat", () => {
		expect(chips("dueDate: 2026-10-05")[0]).not.toHaveProperty("repeat");
	});
});

