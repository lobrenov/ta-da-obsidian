import { describe, expect, it, vi } from "vitest";
import { repeatMove } from "../src/core/index/repeatMove";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { logbookGroups, logbookItems } from "../src/ui/navigator/logbook";
import { moveNote, rowNext, statusContext, statusTitle } from "../src/ui/repeatWording";
import { makeItem } from "./support";

const menu = vi.hoisted(() => ({ items: [] as string[] }));
vi.mock("obsidian", () => ({
	Menu: class {
		addSeparator(): void {}
		addItem(add: (item: unknown) => void): void {
			const at = menu.items.length;
			menu.items.push("");
			const item = {
				setTitle: (title: string) => ((menu.items[at] = title), item),
				setIcon: () => item,
				setChecked: () => item,
				onClick: () => item,
			};
			add(item);
		}
		onHide(): void {}
		showAtPosition(): void {}
	},
	Modal: class {},
	SuggestModal: class {},
	ToggleComponent: class {},
	Platform: {},
}));
const { openStatusMenu } = await import("../src/ui/header/pickers");

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const today = date("2026-10-02");
const task = (name: string, frontmatter: string) => makeItem(`Ta Da/tasks/${name}.md`, `type: task\n${frontmatter}`);

describe("repeatMove", () => {
	const index = new VaultIndex([makeItem("Ta Da/projects/Done.md", "type: project\nstatus: Done")]);

	it("is null unless the task repeats and is closed", () => {
		expect(repeatMove(index, task("A", "status: Done\ncompletedDate: 2026-10-01"), today)).toBeNull();
		expect(repeatMove(index, task("B", "status: Doing\nrepeat: every day"), today)).toBeNull();
		expect(repeatMove(index, task("C", "status: Done\nrepeat: nonsense"), today)).toBeNull();
		expect(repeatMove(index, makeItem("Ta Da/projects/P.md", "type: project\nstatus: Done\nrepeat: every day"), today)).toBeNull();
	});

	it("moves a completed task to its next date, from tomorrow when it was completed today", () => {
		const weekly = "dueDate: 2026-10-05\nrepeat: every week on Mon";
		expect(repeatMove(index, task("D", `status: Done\ncompletedDate: 2026-10-01\n${weekly}`), today)).toEqual({ case: "moves", to: date("2026-10-12") });
		expect(repeatMove(index, task("E", "status: Done\ncompletedDate: 2026-10-02\ndueDate: 2026-10-02\nrepeat: every day"), today)).toEqual({ case: "moves", to: date("2026-10-03") });
	});

	it("counts an open task as completed today with `completing`, and Cancelled as skipped", () => {
		const open = task("F", "status: Doing\ndueDate: 2026-10-05\nrepeat: every week on Mon");
		expect(repeatMove(index, open, today, true)).toEqual({ case: "moves", to: date("2026-10-12") });
		expect(repeatMove(index, task("G", "status: Cancelled\ndueDate: 2026-10-05\nrepeat: every week on Mon"), today, true)).toEqual({ case: "moves", to: date("2026-10-12") });
	});

	it("ends when until ends it, or its project is closed", () => {
		expect(repeatMove(index, task("H", "status: Done\ndueDate: 2026-10-05\nrepeat: every week until 2026-10-06"), today)).toEqual({ case: "ends" });
		expect(repeatMove(index, task("I", 'status: Done\ndueDate: 2026-10-05\nproject: "[[Done]]"\nrepeat: every week'), today)).toEqual({ case: "ends" });
	});
});

describe("repeat wording", () => {
	it("words the moves", () => {
		expect(moveNote({ case: "moves", to: date("2026-10-03") }, today)).toBe("moves to tomorrow");
		expect(moveNote({ case: "moves", to: date("2026-10-09") }, today)).toBe("moves to Fri 9 Oct");
		expect(moveNote({ case: "ends" }, today)).toBe("ends the repeat");
		expect(rowNext({ case: "moves", to: date("2026-10-03") }, today)).toBe("Tomorrow");
		expect(rowNext({ case: "ends" }, today)).toBe("Ended");
	});

	it("renames Cancelled to Skip this time on a repeating task only", () => {
		expect(statusTitle("Cancelled", true, "Cancelled")).toBe("Skip this time");
		expect(statusTitle("Cancelled", false, "Cancelled")).toBe("Cancelled");
		expect(statusTitle("Done", true, "Done")).toBe("Done");
	});

	it("is repeating only for a task whose rule reads", () => {
		const index = new VaultIndex([]);
		expect(statusContext(task("J", "repeat: every day"), index, today).repeating).toBe(true);
		expect(statusContext(task("K", "repeat: nonsense"), index, today)).toEqual({ repeating: false, move: null });
		expect(statusContext(task("L", "status: Doing"), index, today).move).toBeNull();
	});
});

describe("the Logbook's groups", () => {
	const index = new VaultIndex([
		task("Plain", "status: Done\ncompletedDate: 2026-10-02"),
		task("Moves", "status: Done\ncompletedDate: 2026-10-02\ndueDate: 2026-10-02\nrepeat: every day"),
		task("Skipped", "status: Cancelled\ncompletedDate: 2026-10-01\ndueDate: 2026-10-01\nrepeat: every week"),
		task("Ends", "status: Done\ncompletedDate: 2026-10-02\ndueDate: 2026-10-01\nrepeat: every day until 2026-10-02"),
		task("Unreadable", "status: Done\ncompletedDate: 2026-10-02\nrepeat: nonsense"),
	]);

	it("leaves out repeating tasks that move forward, and keeps those that end or can't be read", () => {
		const groups = logbookGroups(index, logbookItems(index), today);
		expect(groups.map((group) => [group.title, group.items.map((item) => item.title)])).toEqual([["Completed today", ["Ends", "Plain", "Unreadable"]]]);
	});
});

describe("the header's status menu", () => {
	const anchor = { classList: { add() {}, remove() {} }, getBoundingClientRect: () => ({ left: 0, bottom: 0 }), ownerDocument: {} } as never;

	it("titles a repeating task's items", () => {
		menu.items.length = 0;
		openStatusMenu(anchor, "task", "Doing", () => undefined, { move: { case: "moves", to: date("2026-10-09") }, today });
		expect(menu.items).toEqual(["Not started", "Doing", "Blocked", "Done · moves to Fri 9 Oct", "Skip this time · moves to Fri 9 Oct"]);
	});

	it("leaves another task's as they were", () => {
		menu.items.length = 0;
		openStatusMenu(anchor, "task", "Doing", () => undefined);
		expect(menu.items).toEqual(["Not started", "Doing", "Blocked", "Done", "Cancelled"]);
	});
});
