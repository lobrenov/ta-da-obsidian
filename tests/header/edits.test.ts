import { describe, expect, it } from "vitest";
import { LocalDate } from "../../src/core/model/localDate";
import { addTagEdit, dateEdit, parentEdit, removeTagEdit, statusEdit } from "../../src/ui/header/edits";

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
});
