import { describe, expect, it } from "vitest";
import { LocalDate } from "../../src/core/model/localDate";
import { RepeatRule } from "../../src/core/model/repeatRule";
import { addTagEdit, dateEdit, parentEdit, removeTagEdit, repeatEdit, statusEdit } from "../../src/ui/header/edits";

const today = LocalDate.parse("2026-10-02") as LocalDate;
const path = "Ta Da/tasks/X.md";
const task = '---\ntype: task\nstatus: Doing\nproject: "[[Old]]"\ndueDate: 2026-10-05\ntags: [dev]\n---\nBody\n';

describe("header edits, text in and text out", () => {
	it("sets a status and completedDate", () => {
		expect(statusEdit("Done", path, today)(task)).toBe(
			'---\ntype: task\nstatus: Done\nproject: "[[Old]]"\ndueDate: 2026-10-05\ntags: [dev]\ncompletedDate: 2026-10-02\n---\nBody\n',
		);
	});

	it("does nothing for the status the text already has", () => {
		expect(statusEdit("Doing", path, today)(task)).toBeNull();
	});

	it("finds the status in the text it's given, not the text it was made for", () => {
		const edit = statusEdit("Blocked", path, today);
		expect(edit(task.replace("Doing", "Blocked"))).toBeNull();
		expect(edit(task)).toContain("status: Blocked");
	});

	it("moves to a project, an area, or none", () => {
		expect(parentEdit({ kind: "project", title: "New" })(task)).toContain('project: "[[New]]"');
		const area = parentEdit({ kind: "area", title: "Home" })(task);
		expect(area).toContain('area: "[[Home]]"');
		expect(area).toContain("project:\n");
		expect(parentEdit(null)(task)).toContain("project:\n");
	});

	it("sets and clears a date by one line", () => {
		expect(dateEdit("dueDate", LocalDate.parse("2026-12-25"))(task)).toBe(task.replace("2026-10-05", "2026-12-25"));
		expect(dateEdit("dueDate", null)(task)).toBe(task.replace("dueDate: 2026-10-05", "dueDate:"));
		expect(dateEdit("deadline", LocalDate.parse("2026-11-01"))(task)).toContain("deadline: 2026-11-01\n---");
	});

	it("adds and removes a tag, keeping the list's style", () => {
		expect(addTagEdit("home/garden")(task)).toContain("tags: [dev, home/garden]");
		expect(addTagEdit("#Dev")(task)).toBe(task);
		expect(removeTagEdit("dev")(task)).toContain("tags:\n---");
		expect(addTagEdit("#")(task)).toBeNull();
	});

	describe("repeat", () => {
		const rule = (text: string): RepeatRule => RepeatRule.parse(text) as RepeatRule;

		it("writes the canonical rule as one line, leaving the due date", () => {
			expect(repeatEdit(rule("Every  Monday"), path, today)(task)).toBe(task.replace("tags: [dev]\n", "tags: [dev]\nrepeat: every week on Mon\n"));
		});

		it("sets the due date to the first occurrence when the task has no date", () => {
			const bare = "---\ntype: task\nstatus: Not Started\n---\nBody\n";
			expect(repeatEdit(rule("every mon"), path, today)(bare)).toBe("---\ntype: task\nstatus: Not Started\nrepeat: every week on Mon\ndueDate: 2026-10-05\n---\nBody\n");
			expect(repeatEdit(rule("every day"), path, today)(bare)).toContain("dueDate: 2026-10-02\n");
		});

		it("leaves the dates of a task that has a deadline or a rule already", () => {
			const deadline = "---\ntype: task\nstatus: Not Started\ndeadline: 2026-10-09\n---\n";
			expect(repeatEdit(rule("every week"), path, today)(deadline)).toBe("---\ntype: task\nstatus: Not Started\ndeadline: 2026-10-09\nrepeat: every week\n---\n");
			const ruled = "---\ntype: task\nstatus: Not Started\nrepeat: every day\n---\n";
			expect(repeatEdit(rule("every week"), path, today)(ruled)).toBe("---\ntype: task\nstatus: Not Started\nrepeat: every week\n---\n");
		});

		it("writes a month or year rule with the day it starts on", () => {
			const monthly = "---\ntype: task\nstatus: Not Started\ndueDate: 2026-10-15\n---\n";
			expect(repeatEdit(rule("every month"), path, today)(monthly)).toContain("repeat: every month on the 15th\n");
			expect(repeatEdit(rule("every year until 2030-01-01 when done"), path, today)(monthly)).toContain("repeat: every year on Oct 15 until 2030-01-01 when done\n");
		});

		it("does nothing when the file already says it, or for a file that isn't a task", () => {
			const done = repeatEdit(rule("every mon"), path, today)(task) as string;
			expect(repeatEdit(rule("every mon"), path, today)(done)).toBeNull();
			expect(repeatEdit(rule("every mon"), path, today)("---\ntype: project\n---\n")).toBeNull();
			expect(repeatEdit(null, path, today)(task)).toBeNull();
		});

		it("empties the key to stop", () => {
			const repeating = task.replace("tags:", "repeat: every week\ntags:");
			expect(repeatEdit(null, path, today)(repeating)).toBe(repeating.replace("repeat: every week", "repeat:"));
		});
	});
});
