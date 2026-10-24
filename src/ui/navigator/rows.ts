import { folderOf } from "../../core/storage/vault";
import type { AgendaEntry } from "../../core/index/queries";
import { progress as progressOf } from "../../core/index/queries";
import type { VaultIndex } from "../../core/index/vaultIndex";
import { type Item, subtasks as subtasksOf } from "../../core/model/item";
import type { LocalDate } from "../../core/model/localDate";
import { isClosed, type Status } from "../../core/model/status";
import { linkTitle } from "../../core/model/wikiLink";
import { capitalised, relativeLabel } from "./dates";

/** The colour a glyph takes, named as the design's tokens. The DOM layer maps them to Obsidian's variables. */
export type Tint = "due" | "deadline" | "done" | "doing" | "blocked" | "accent" | "muted" | "link";

/** What a row, header or navigation item draws as its icon. */
export type IconSpec =
	| { type: "icon"; name: string; tint: Tint; filled?: boolean }
	| { type: "ring"; fraction: number; ongoing: boolean }
	| { type: "area" };

/** A task row's one date. */
export interface RowDate {
	kind: "due" | "deadline";
	text: string;
	overdue: boolean;
}

export interface TaskRowModel {
	type: "task";
	/** Unique in the list: Upcoming lists a task once for each date. */
	id: string;
	path: string;
	title: string;
	status: Status;
	closed: boolean;
	/** The task's project or area, where the list's groups don't name it. */
	place: string | null;
	subtasks: { done: number; total: number } | null;
	date: RowDate | null;
	tags: number;
}

/** A project or area as a row: on an area's page (`line`) or a tag's page (`card`). */
export interface ParentRowModel {
	type: "project" | "area";
	id: string;
	path: string;
	title: string;
	variant: "line" | "card";
	icon: IconSpec;
	/** The `card`'s second line. */
	meta: string | null;
	deadline: RowDate | null;
	/** Open tasks, for the `line`; null for none. */
	open: number | null;
	tags: number;
}

export interface NoteRowModel {
	type: "note";
	id: string;
	path: string;
	title: string;
	subtasks: { done: number; total: number } | null;
	tags: number;
	/** The note's folder, where the list mixes folders; `Loose` for the top level. */
	folder: string | null;
}

/** A Logbook or Trash row. Neither writes. `path` is null for a file the vault can't open (in `.trash/`). */
export interface ArchiveRowModel {
	type: "logged" | "trashed";
	id: string;
	path: string | null;
	title: string;
	kind: "task" | "project" | "area" | "note";
	status: Status;
	meta: string;
	subtasks: { done: number; total: number } | null;
	/** The day it was completed. */
	date: string | null;
}

export type ListRow = TaskRowModel | ParentRowModel | NoteRowModel | ArchiveRowModel;

/** Which date a list shows. Today and Upcoming show a due date only when overdue; other lists show the date itself. */
export type DateRule = "agenda" | "elsewhere";

export interface TaskRowOptions {
	dates: DateRule;
	/** Name the task's project or area on the row. */
	place: boolean;
	/** Upcoming's entry: the row shows its kind, as the day's header gives the date. */
	entry?: AgendaEntry;
}

/** A task's row. */
export function taskRow(index: VaultIndex, task: Item, today: LocalDate, options: TaskRowOptions): TaskRowModel {
	const p = task.properties;
	const subtasks = subtasksOf(task);
	return {
		type: "task",
		id: options.entry ? `${task.path}#${options.entry.kind}` : task.path,
		path: task.path,
		title: task.title,
		status: p.status,
		closed: isClosed(p.status),
		place: options.place ? (index.parentOf(task)?.title ?? null) : null,
		subtasks: subtasks.total > 0 ? subtasks : null,
		date: rowDate(task, today, options),
		tags: task.tags.length,
	};
}

/**
 * A task's one date: the deadline when set, else the due date; closed tasks show none. Today and Upcoming show a due
 * date only when it's overdue. An Upcoming entry shows its kind alone for a deadline and nothing for a due date.
 */
export function rowDate(task: Item, today: LocalDate, options: Pick<TaskRowOptions, "dates" | "entry">): RowDate | null {
	const p = task.properties;
	if (isClosed(p.status)) return null;
	if (options.entry) {
		return options.entry.kind === "deadline" ? { kind: "deadline", text: "Deadline", overdue: false } : null;
	}
	if (p.deadline) return dateOf("deadline", p.deadline, today);
	if (p.dueDate && (options.dates === "elsewhere" || p.dueDate.compare(today) < 0)) return dateOf("due", p.dueDate, today);
	return null;
}

/** A date as a row shows it: a deadline reads `Deadline Tue 6 Oct`, a due date `Tue 6 Oct`. */
export function dateOf(kind: "due" | "deadline", date: LocalDate, today: LocalDate): RowDate {
	const label = capitalised(relativeLabel(date, today));
	return {
		kind,
		text: kind === "deadline" ? `Deadline ${label}` : label,
		overdue: date.compare(today) < 0 || (kind === "deadline" && date.equals(today)),
	};
}

/** A project's ring: full for a closed one, a pie of the done tasks, or a checklist for an Ongoing one. */
export function projectIcon(index: VaultIndex, project: Item): IconSpec {
	const { done, total } = progressOf(index, project);
	return { type: "ring", fraction: total === 0 ? 0 : done / total, ongoing: project.properties.status === "Ongoing" };
}

/** A project or area as a row on an area's page: its ring or cube, name, deadline and open-task count. */
export function lineRow(index: VaultIndex, project: Item, today: LocalDate): ParentRowModel {
	const p = project.properties;
	const { done, total } = progressOf(index, project);
	return {
		type: "project",
		id: project.path,
		path: project.path,
		title: project.title,
		variant: "line",
		icon: projectIcon(index, project),
		meta: null,
		deadline: p.deadline && !isClosed(p.status) ? dateOf("deadline", p.deadline, today) : null,
		open: total - done > 0 ? total - done : null,
		tags: project.tags.length,
	};
}

/** An area or project as a row on a tag's page: its name over its progress and area, or its project count. */
export function cardRow(index: VaultIndex, item: Item): ParentRowModel {
	const isArea = item.properties.kind === "area";
	let meta: string;
	if (isArea) {
		const count = index.projectsIn(item).length;
		meta = count === 1 ? "1 project" : `${count} projects`;
	} else {
		const { done, total } = progressOf(index, item);
		const state = item.properties.status === "Ongoing" ? "Ongoing" : `${done} of ${total} done`;
		meta = `${state} · ${index.areaOf(item)?.title ?? "No area"}`;
	}
	return {
		type: isArea ? "area" : "project",
		id: item.path,
		path: item.path,
		title: item.title,
		variant: "card",
		icon: isArea ? { type: "area" } : projectIcon(index, item),
		meta,
		deadline: null,
		open: null,
		tags: item.tags.length,
	};
}

/** A note's row. `showFolder` names its folder, where a list mixes folders. */
export function noteRow(note: Item, showFolder: boolean): NoteRowModel {
	const subtasks = subtasksOf(note);
	const folder = folderOf(note.path);
	return {
		type: "note",
		id: note.path,
		path: note.path,
		title: note.title,
		subtasks: subtasks.total > 0 ? subtasks : null,
		tags: note.tags.length,
		folder: showFolder ? (folder === "" ? "Loose" : folder) : null,
	};
}

/** The title an `area` or `project` link names, for a project whose area no file answers to. */
export function linkedArea(project: Item): string | null {
	return project.properties.area ? linkTitle(project.properties.area) : null;
}
