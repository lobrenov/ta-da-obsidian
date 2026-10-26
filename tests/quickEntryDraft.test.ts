import { describe, expect, it } from "vitest";
import type { Kind } from "../src/core/model/item";
import { LocalDate } from "../src/core/model/localDate";
import { linkTitle } from "../src/core/model/wikiLink";
import type { Status } from "../src/core/model/status";
import { readTag } from "../src/core/model/tag";
import { parseItem } from "../src/core/parsing/parseItem";
import { areaFolder, projectFolder, taskFolder } from "../src/core/storage/vault";
import { newTask } from "../src/core/writing/newFile";
import type { Parent } from "../src/core/writing/parent";
import { changingKind, draftFolder, draftText, emptyDraft, type QuickEntryDraft } from "../src/core/writing/quickEntryDraft";

const today = LocalDate.parse("2026-10-12") as LocalDate;
const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;

function full(kind: Kind, parent: Parent | null): QuickEntryDraft {
	return {
		kind,
		title: "Call Bea",
		status: "Doing",
		parent,
		dueDate: date("2026-10-14"),
		deadline: date("2026-10-20"),
		repeatText: null,
		tags: [readTag("people/bea") as never],
	};
}

const titleOf = (link: Parameters<typeof linkTitle>[0] | null): string | null => (link ? linkTitle(link) : null);

function parsed(text: string, path: string) {
	const item = parseItem(text, path);
	if (!item) throw new Error("Not a Ta Da file");
	return item;
}

describe("QuickEntryDraft", () => {
	it("starts as a loose, Not Started task", () => {
		const draft = emptyDraft();
		expect([draft.kind, draft.title, draft.status, draft.parent]).toEqual(["task", "", "Not Started", null]);
		expect(draftFolder(draft)).toBe(taskFolder);
		expect(draftText(draft, today)).toBe(newTask({ today }));
	});

	it("writes every field of a task", () => {
		const text = draftText(full("task", { kind: "project", title: "Game Jam" }), today);
		expect(text).toBe(
			'---\ntype: task\nstatus: Doing\nproject: "[[Game Jam]]"\ncreatedDate: 2026-10-12\ntags: [people/bea]\ndueDate: 2026-10-14\ndeadline: 2026-10-20\n---\n',
		);
		const item = parsed(text, "Ta Da/tasks/Call Bea.md");
		expect([item.properties.kind, item.properties.status, item.warnings]).toEqual(["task", "Doing", []]);
		expect(titleOf(item.properties.project)).toBe("Game Jam");
		expect(item.properties.area).toBeNull();
		expect(item.properties.dueDate?.toString()).toBe("2026-10-14");
		expect(item.properties.deadline?.toString()).toBe("2026-10-20");
		expect(item.properties.tags.map((tag) => tag.name)).toEqual(["people/bea"]);
	});

	it("writes a task's repeat, and a project doesn't keep it", () => {
		const task = { ...full("task", null), repeatText: "every week on Mon" };
		const text = draftText(task, today);
		expect(text).toContain("deadline: 2026-10-20\nrepeat: every week on Mon\n---\n");
		expect(parsed(text, "t.md").properties.repeatRule?.rule?.phrase).toBe("every week on Mon");
		expect(changingKind(task, "project").repeatText).toBeNull();
		expect(draftText({ ...task, kind: "project" }, today)).not.toContain("repeat");
		expect(changingKind(changingKind(task, "task"), "task").repeatText).toBe("every week on Mon");
	});

	it("lets a task name an area", () => {
		const item = parsed(draftText(full("task", { kind: "area", title: "Personal" }), today), "t.md");
		expect(titleOf(item.properties.area)).toBe("Personal");
		expect(item.properties.project).toBeNull();
	});

	it("writes every field of a project", () => {
		const draft = full("project", { kind: "area", title: "Personal" });
		expect(draftFolder(draft)).toBe(projectFolder);
		const text = draftText(draft, today);
		expect(text).toBe(
			'---\ntype: project\nstatus: Doing\narea: "[[Personal]]"\ncreatedDate: 2026-10-12\ntags: [people/bea]\ndueDate: 2026-10-14\ndeadline: 2026-10-20\n---\n',
		);
		const item = parsed(text, "Ta Da/projects/Call Bea.md");
		expect([item.properties.kind, item.properties.status, item.warnings]).toEqual(["project", "Doing", []]);
		expect(titleOf(item.properties.area)).toBe("Personal");
		expect(item.properties.tags.map((tag) => tag.name)).toEqual(["people/bea"]);
	});

	it("writes only tags for an area", () => {
		const draft = full("area", { kind: "area", title: "Personal" });
		expect(draftFolder(draft)).toBe(areaFolder);
		expect(draftText(draft, today)).toBe("---\ntype: area\ncreatedDate: 2026-10-12\ntags: [people/bea]\n---\n");
	});

	it.each<[Kind, Status]>([
		["task", "Done"],
		["task", "Cancelled"],
		["project", "Done"],
	])("sets completedDate for a closed %s (%s)", (kind, status) => {
		const item = parsed(draftText({ ...emptyDraft(), kind, status }, today), "f.md");
		expect([item.properties.status, item.properties.completedDate?.toString()]).toEqual([status, "2026-10-12"]);
	});

	it("keeps what the new kind has when the kind changes", () => {
		const task = full("task", { kind: "project", title: "Game Jam" });
		const project = changingKind(task, "project");
		expect([project.kind, project.title, project.tags, project.status]).toEqual(["project", task.title, task.tags, "Doing"]);
		expect([project.dueDate, project.deadline, project.parent]).toEqual([task.dueDate, task.deadline, null]);
		expect(changingKind(full("task", { kind: "area", title: "Personal" }), "project").parent).toEqual({ kind: "area", title: "Personal" });
		expect(changingKind(full("project", { kind: "area", title: "Personal" }), "task")).toEqual(full("task", { kind: "area", title: "Personal" }));
		expect(changingKind({ ...full("project", null), status: "Ongoing" }, "task").status).toBe("Not Started");

		const area = changingKind(task, "area");
		expect(area).toEqual({ ...emptyDraft(), kind: "area", title: task.title, tags: task.tags });
		const back = changingKind(area, "task");
		expect([back.status, back.parent, back.dueDate]).toEqual(["Not Started", null, null]);
		expect(back.tags).toEqual(task.tags);
	});

	it("writes a note at the top level", () => {
		const draft = changingKind(full("task", { kind: "project", title: "Ta Da MVP" }), "note");
		expect([draft.parent, draft.status, draft.dueDate, draftFolder(draft)]).toEqual([null, "Not Started", null, ""]);
		expect(draftText(draft, today)).toBe("---\ncreatedDate: 2026-10-12\ntags: [people/bea]\n---\n");
	});
});
