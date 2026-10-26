import type { Kind } from "../model/item";
import type { LocalDate } from "../model/localDate";
import { type Status, statusChoices } from "../model/status";
import type { Tag } from "../model/tag";
import { areaFolder, projectFolder, taskFolder } from "../storage/vault";
import { setStatus } from "./completion";
import { setProperty } from "./frontmatterEditor";
import { newArea, newNote, newProject, newTask } from "./newFile";
import type { Parent } from "./parent";

/** What the New task modal holds for a new file before it's written. The title becomes the filename. */
export interface QuickEntryDraft {
	kind: Kind;
	title: string;
	status: Status;
	/** A task's project or area, or a project's area. */
	parent: Parent | null;
	dueDate: LocalDate | null;
	deadline: LocalDate | null;
	/** A task's `repeat` phrase, as it's written. */
	repeatText: string | null;
	tags: Tag[];
}

/** A loose, Not Started task with no title. */
export function emptyDraft(): QuickEntryDraft {
	return { kind: "task", title: "", status: "Not Started", parent: null, dueDate: null, deadline: null, repeatText: null, tags: [] };
}

/** The folder the file goes in; `""` is the top level of the vault. */
export function draftFolder(draft: QuickEntryDraft): string {
	switch (draft.kind) {
		case "task":
			return taskFolder;
		case "project":
			return projectFolder;
		case "area":
			return areaFolder;
		case "note":
			return "";
	}
}

/** The file's text: `newFile`'s for the kind, with the status, due date, deadline and a task's repeat set. */
export function draftText(draft: QuickEntryDraft, today: LocalDate): string {
	const { parent, tags } = draft;
	const project = parent?.kind === "project" ? parent.title : null;
	const area = parent?.kind === "area" ? parent.title : null;
	let text: string;
	switch (draft.kind) {
		case "task":
			text = newTask({ project, area, tags, today });
			break;
		case "project":
			text = newProject({ area, tags, today });
			break;
		case "area":
			return newArea({ tags, today });
		case "note":
			return newNote({ tags, today });
	}
	if (draft.status !== "Not Started") text = setStatus(draft.status, text, today);
	if (draft.dueDate) text = setProperty("dueDate", { kind: "date", value: draft.dueDate }, text);
	if (draft.deadline) text = setProperty("deadline", { kind: "date", value: draft.deadline }, text);
	if (draft.kind === "task" && draft.repeatText) text = setProperty("repeat", { kind: "text", value: draft.repeatText }, text);
	return text;
}

/** The draft as `kind`, keeping the title and tags. A project keeps only an area parent; an area or note keeps nothing else. */
export function changingKind(draft: QuickEntryDraft, kind: Kind): QuickEntryDraft {
	const next: QuickEntryDraft = { ...emptyDraft(), kind, title: draft.title, tags: draft.tags };
	if (kind === "area" || kind === "note") return next;
	next.status = statusChoices(kind).includes(draft.status) ? draft.status : "Not Started";
	next.dueDate = draft.dueDate;
	next.deadline = draft.deadline;
	next.repeatText = kind === "task" ? draft.repeatText : null;
	next.parent = kind === "project" && draft.parent?.kind !== "area" ? null : draft.parent;
	return next;
}
