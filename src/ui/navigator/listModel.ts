import { type Grouping, listSections, type ListSection, TagFilter } from "../../core/index/grouping";
import type { TaskGroup } from "../../core/index/queries";
import { dailyNote, openCheckboxCount, pathForDate, pathForWeek, weekNote } from "../../core/index/dailyNotes";
import { agendaDay, agendaWeek, dayMarks, grouped, looseTasks, progress } from "../../core/index/queries";
import { search as searchIndex } from "../../core/index/queries";
import { tagBrowser } from "../../core/index/tagQueries";
import type { VaultIndex } from "../../core/index/vaultIndex";
import { type Item, subtasks as subtasksOf } from "../../core/model/item";
import type { ISOWeek, LocalDate } from "../../core/model/localDate";
import { isClosed } from "../../core/model/status";
import type { Tag } from "../../core/model/tag";
import { tagLeaf } from "../../core/model/tag";
import { type TrashedItem, contentsOf } from "../../core/storage/trash";
import { linkTitle } from "../../core/model/wikiLink";
import { type AgendaSelection, type AgendaState, buildStrip, type NoteSettings, type StripModel, weekOf } from "./agenda";
import { dayMonth, fullDate, shortWeekday } from "./dates";
import { type Domain, domainKey, type GroupedList, groupingOf, type Groupings } from "./domain";
import { logbookGroups, logbookItems, logbookRow } from "./logbook";
import {
	type ArchiveRowModel,
	cardRow,
	dateOf,
	type IconSpec,
	lineRow,
	type ListRow,
	linkedArea,
	type PeriodNoteRowModel,
	noteRow,
	projectIcon,
	type TaskRowOptions,
	taskRow,
} from "./rows";

export interface ListContext {
	index: VaultIndex;
	today: LocalDate;
	/** `.trash/`'s Ta Da files and notes, as `readTrash` lists them. */
	trash: readonly TrashedItem[];
	/** The Agenda's day or week, and whether its strip shows the month. */
	agenda: AgendaState;
	/** Where daily and week notes live, and whether week notes show. */
	notes: NoteSettings;
}

export interface ListOptions {
	groupings: Groupings;
	/** The tag paths picked in this list's filter. */
	picked: ReadonlySet<string>;
	/** The sections the reader flipped from how they start: closed ones start folded, the rest open. */
	folds: ReadonlySet<string>;
}

/** What opens above a group of rows. */
export type SectionHeader =
	| { style: "count"; title: string; count: number; quiet: boolean }
	| { style: "area"; title: string; path: string; count: number }
	| { style: "project"; title: string; path: string; icon: IconSpec; count: number; area: string | null; sub: boolean }
	| { style: "loose" }
	| { style: "archive"; title: string; note: string | null }
	/** A day's full date and relative name. */
	| { style: "dayTitle"; title: string; relative: string | null }
	/** "Scheduled", with the Group menu and the tag filter. */
	| { style: "scheduled" }
	| { style: "weekTitle"; title: string; range: string; thisWeek: boolean };

export interface SectionModel {
	id: string;
	header: SectionHeader | null;
	rows: ListRow[];
	foldable: boolean;
	folded: boolean;
	/** Text in place of rows, such as `No open tasks carry this tag.` */
	message: string | null;
}

export interface ListHeader {
	title: string;
	icon: IconSpec;
	/** Muted text on the title's right, such as today's date. */
	detail: string | null;
	/** Muted lines under the title. */
	lines: string[];
	/** The page's own file, opened by an icon button. */
	file: { path: string; label: string } | null;
	/** Child tags, each opening its page. */
	chips: { label: string; count: number; domain: Domain; icon: IconSpec }[];
}

export interface FilterModel {
	/** The tags in the list's files, with how many files carry each (or a child of it). */
	tags: { path: string; name: string; count: number; picked: boolean }[];
	shown: number;
	total: number;
}

export interface ListModel {
	domain: Domain;
	header: ListHeader;
	/** The list whose Group choice this is, or null for a list with none. */
	groupList: GroupedList | null;
	grouping: Grouping | null;
	filter: FilterModel | null;
	/** The Agenda's header, in place of the title row. */
	strip?: StripModel;
	sections: SectionModel[];
	/** The empty state's title, when there is nothing to list. */
	empty: string | null;
}

const noHeader: Omit<ListHeader, "title" | "icon"> = { detail: null, lines: [], file: null, chips: [] };

/** The list a domain shows, or null when its project or area no longer exists. */
export function buildList(domain: Domain, ctx: ListContext, options: ListOptions): ListModel | null {
	switch (domain.kind) {
		case "agenda":
			return agendaList(ctx, options);
		case "loose":
			return looseList(ctx, options);
		case "logbook":
			return logbookList(ctx);
		case "trash":
			return trashList(ctx);
		case "project": {
			const project = ctx.index.get(domain.path);
			return project?.properties.kind === "project" ? projectList(project, ctx, options) : null;
		}
		case "area": {
			const area = ctx.index.get(domain.path);
			return area?.properties.kind === "area" ? areaList(area, ctx, options) : null;
		}
		case "tag":
			return tagList(domain, ctx, options);
		case "search":
			return searchList(domain, ctx);
	}
}

/** The rows a reader can select, top to bottom: those with a file to open, in sections that aren't folded. */
export function visibleRows(list: ListModel): ListRow[] {
	return list.sections.filter((section) => !section.folded).flatMap((section) => section.rows).filter((row) => row.path !== null);
}

/** The paths of `visibleRows`, each once. */
export function visiblePaths(list: ListModel): string[] {
	const paths: string[] = [];
	for (const row of visibleRows(list)) {
		if (row.path !== null && !paths.includes(row.path)) paths.push(row.path);
	}
	return paths;
}

// Task lists

/** The Agenda: a day's tasks, or a week's days and what's due in it, under the strip. */
function agendaList(ctx: ListContext, options: ListOptions): ListModel {
	const { selection } = ctx.agenda;
	const strip = buildStrip(ctx.index, ctx.agenda, ctx.today, ctx.notes);
	const base = { domain: { kind: "agenda" } as Domain, header: { ...noHeader, title: "Agenda", icon: { type: "icon", name: "calendar", tint: "due" } as IconSpec }, strip, empty: null };
	if (selection.kind === "week") {
		return { ...base, groupList: null, grouping: null, filter: null, sections: weekSections(ctx, selection.week) };
	}
	const { index, today } = ctx;
	const all = agendaDay(index, selection.date, today);
	const filter = new TagFilter(options.picked);
	const tasks = filter.apply(all);
	const grouping = groupingOf("agenda", options.groupings);
	const relative = ["Today", "Tomorrow", "Yesterday"][[0, 1, -1].indexOf(today.daysTo(selection.date))] ?? null;
	const title = plain("agenda:day", [periodNoteRow(ctx, selection)], { style: "dayTitle", title: fullDate(selection.date, today), relative });
	const sections = [title];
	if (all.length === 0) {
		title.message = "Nothing scheduled";
	} else {
		const scheduled = plain("agenda:scheduled", [], { style: "scheduled" });
		if (tasks.length === 0) scheduled.message = "Nothing here carries the picked tags.";
		sections.push(scheduled, ...taskSections(ctx, tasks, grouping, { dates: "agenda", place: grouping !== "Project" }, "agenda", options));
	}
	return { ...base, groupList: "agenda", grouping, filter: filterModel(all, options.picked, tasks.length), sections };
}

/** The row for a day's or week's note: the note when there is one, else the row that creates it. */
function periodNoteRow(ctx: ListContext, selection: AgendaSelection): PeriodNoteRowModel {
	const { index, today, notes } = ctx;
	const day = selection.kind === "day";
	const target = selection.kind === "day" ? pathForDate(notes.names, selection.date) : pathForWeek(notes.names, selection.week);
	const note = selection.kind === "day" ? dailyNote(index, selection.date, notes.names) : weekNote(index, selection.week, notes.names);
	const open = note ? openCheckboxCount(note) : 0;
	const boxes = note ? subtasksOf(note) : null;
	return {
		type: "periodNote",
		id: `note:${target}`,
		path: note?.path ?? null,
		name: day ? "Daily note" : "Week note",
		file: target.split("/").pop() ?? target,
		target,
		period: day ? "day" : "week",
		selection,
		summary: note?.summary ?? null,
		open: selection.kind === "day" && selection.date.compare(today) < 0 ? open : 0,
		subtasks: boxes && boxes.total > 0 ? boxes : null,
	};
}

/** A week: a row for each day, then the entries due or at their deadline in it. */
function weekSections(ctx: ListContext, week: ISOWeek): SectionModel[] {
	const { index, today } = ctx;
	const entries = agendaWeek(index, week);
	const marks = dayMarks(index, week.firstDay, week.days[6] ?? week.firstDay, ctx.notes.names);
	const days = week.days.map((date): ListRow => {
		const due = new Set(entries.filter((entry) => entry.date.equals(date) && !isClosed(entry.item.properties.status)).map((entry) => entry.item.path)).size;
		const note = dailyNote(index, date, ctx.notes.names);
		return {
			type: "day",
			id: `day:${date.toString()}`,
			path: null,
			date,
			label: `${shortWeekday(date)} ${date.day}`,
			summary: due > 0 ? `${due} due` : "",
			today: date.equals(today),
			hasOpenTasks: marks.get(date.toString())?.hasOpenTasks === true,
			hasOpenBoxes: marks.get(date.toString())?.hasOpenBoxes === true,
			note: note ? (note.summary ?? "") : "No note",
			hasNote: note !== null,
		};
	});
	const selection: AgendaSelection = { kind: "week", week };
	const sections = [
		plain("agenda:week", ctx.notes.weekNotes ? [periodNoteRow(ctx, selection)] : [], { style: "weekTitle", title: `Week ${week.week}`, range: `${dayMonth(week.firstDay, today)} – ${dayMonth(week.days[6] ?? week.firstDay, today)}`, thisWeek: week.equals(today.isoWeek) }),
		plain("agenda:days", days),
	];
	if (entries.length > 0) {
		sections.push(plain("agenda:due", entries.map((entry) => taskRow(index, entry.item, today, { dates: "agenda", place: true, entry })), { style: "archive", title: "Due this week", note: null }));
	}
	return sections;
}

function looseList(ctx: ListContext, options: ListOptions): ListModel {
	const all = looseTasks(ctx.index);
	const filter = new TagFilter(options.picked);
	const tasks = filter.apply(all);
	const grouping = groupingOf("loose", options.groupings);
	return {
		domain: { kind: "loose" },
		header: { ...noHeader, title: "Loose tasks", icon: { type: "icon", name: "inbox", tint: "accent" } },
		groupList: "loose",
		grouping,
		filter: filterModel(all, options.picked, tasks.length),
		sections: taskSections(ctx, tasks, grouping, { dates: "elsewhere", place: false }, "loose", options),
		empty: emptyOf(all.length, tasks.length, "No loose tasks"),
	};
}

function projectList(project: Item, ctx: ListContext, options: ListOptions): ListModel {
	const { index, today } = ctx;
	const all = index.tasksIn(project);
	const filter = new TagFilter(options.picked);
	const tasks = filter.apply(all);
	const grouping = groupingOf("project", options.groupings);
	const p = project.properties;
	const { done, total } = progress(index, project);
	const own = subtasksOf(project);
	const line = [
		p.status,
		...(p.deadline ? [dateOf("deadline", p.deadline, today).text] : []),
		...(p.dueDate ? [`Due ${dateOf("due", p.dueDate, today).text}`] : []),
		...(own.total > 0 ? [`${own.done}/${own.total}`] : []),
		...(p.status === "Ongoing" ? [] : [`${done} of ${total} done`]),
	].join(" · ");
	return {
		domain: { kind: "project", path: project.path },
		header: { ...noHeader, title: project.title, icon: projectIcon(index, project), lines: [line], file: { path: project.path, label: "Open project file" } },
		groupList: "project",
		grouping,
		filter: filterModel(all, options.picked, tasks.length),
		sections: taskSections(ctx, tasks, grouping, { dates: "elsewhere", place: false }, project.path, options),
		empty: emptyOf(all.length, tasks.length, "No tasks"),
	};
}

function areaList(area: Item, ctx: ListContext, options: ListOptions): ListModel {
	const { index, today } = ctx;
	const allProjects = index.projectsIn(area);
	const allTasks = index.tasksIn(area);
	const filter = new TagFilter(options.picked);
	const projects = filter.apply(allProjects);
	const tasks = filter.apply(allTasks);
	const open = tasks.filter((task) => !isClosed(task.properties.status));
	const closed = tasks.filter((task) => isClosed(task.properties.status));
	const rowOptions: TaskRowOptions = { dates: "elsewhere", place: false };
	const key = domainKey({ kind: "area", path: area.path });
	const sections: SectionModel[] = [];
	if (projects.length > 0) sections.push(plain("projects", projects.map((project) => lineRow(index, project, today))));
	if (open.length > 0) sections.push(plain("tasks", open.map((task) => taskRow(index, task, today, rowOptions))));
	if (closed.length > 0) {
		sections.push(foldable(`${key}|Completed`, { style: "count", title: "Completed", count: closed.length, quiet: true }, closed.map((task) => taskRow(index, task, today, rowOptions)), true, options));
	}
	const files = [...allProjects, ...allTasks];
	const openCount = allTasks.filter((task) => !isClosed(task.properties.status)).length;
	return {
		domain: { kind: "area", path: area.path },
		header: {
			...noHeader,
			title: area.title,
			icon: { type: "area" },
			lines: [`${plural(allProjects.length, "project")} · ${plural(openCount, "task")}`],
			file: { path: area.path, label: "Open area file" },
		},
		groupList: null,
		grouping: null,
		filter: filterModel(files, options.picked, projects.length + tasks.length),
		sections,
		empty: files.length === 0 ? "No tasks" : sections.length === 0 ? noMatches : null,
	};
}

/** The sections of a task list by its grouping. */
function taskSections(ctx: ListContext, tasks: Item[], grouping: Grouping, rowOptions: TaskRowOptions, foldKey: string, options: ListOptions): SectionModel[] {
	const { index, today } = ctx;
	if (grouping === "Project") return groupSections(ctx, grouped(index, tasks), rowOptions, false);
	return listSections(tasks, grouping, today).map((section) =>
		foldable(
			`${foldKey}|${foldName(section, grouping)}`,
			{ style: "count", title: section.title, count: section.tasks.length, quiet: isClosedSection(section) },
			section.tasks.map((task) => taskRow(index, task, today, rowOptions)),
			startsFolded(section, grouping),
			options,
		),
	);
}

/** Task groups under their project's or area's heading, which opens its page. A group without a parent has no heading, or Loose's. */
function groupSections(ctx: ListContext, groups: TaskGroup[], rowOptions: TaskRowOptions, looseHeading: boolean): SectionModel[] {
	const { index, today } = ctx;
	return groups.map((group) => {
		const rows = group.tasks.map((task) => taskRow(index, task, today, rowOptions));
		const parent = group.parent;
		if (!parent) return plain("loose", rows, looseHeading ? { style: "loose" } : null);
		if (parent.properties.kind === "area") {
			return plain(`parent:${parent.path}`, rows, { style: "area", title: parent.title, path: parent.path, count: rows.length });
		}
		const area = index.areaOf(parent);
		return plain(`parent:${parent.path}`, rows, {
			style: "project",
			title: parent.title,
			path: parent.path,
			icon: projectIcon(index, parent),
			count: rows.length,
			area: area ? null : linkedArea(parent),
			sub: area !== null,
		});
	});
}

// Tag pages

function tagList(domain: Extract<Domain, { kind: "tag" }>, ctx: ListContext, options: ListOptions): ListModel {
	const { index, today } = ctx;
	const tag: Tag | null = domain.path === null ? null : (index.carriedTags.find((t) => t.path === domain.path) ?? { name: domain.path, path: domain.path });
	const page = tagBrowser(index, tag);
	const open = page.groups.flatMap((group) => group.tasks);
	const untagged = tag === null;
	const key = domainKey(domain);
	const rowOptions: TaskRowOptions = { dates: "elsewhere", place: false };
	const sections: SectionModel[] = [];
	const parentsTitle = untagged ? "Areas and projects" : "Tagged areas and projects";
	if (page.areasAndProjects.length > 0) {
		sections.push(foldable(`${key}|${parentsTitle}`, countHeader(parentsTitle, page.areasAndProjects.length), page.areasAndProjects.map((item) => cardRow(index, item)), false, options));
	}
	const taskSection = groupSections(ctx, page.groups, rowOptions, true);
	const tasks = foldable(`${key}|Tasks`, countHeader("Tasks", open.length), [], false, options);
	tasks.message = open.length === 0 ? (untagged ? "Every open task has a tag." : "No open tasks carry this tag.") : null;
	sections.push(tasks);
	// Each group is a section of its own that folds with Tasks.
	for (const section of taskSection) sections.push({ ...section, folded: tasks.folded });
	if (page.completed.length > 0) {
		sections.push(foldable(`${key}|Completed`, { style: "count", title: "Completed", count: page.completed.length, quiet: true }, page.completed.map((task) => taskRow(index, task, today, rowOptions)), true, options));
	}
	if (page.notes.length > 0) {
		sections.push(foldable(`${key}|Notes`, countHeader("Notes", page.notes.length), page.notes.map((note) => noteRow(note, true)), false, options));
	}
	const areas = page.areasAndProjects.filter((item) => item.properties.kind === "area").length;
	const projects = page.areasAndProjects.length - areas;
	const lines = [
		...(areas > 0 ? [plural(areas, "area")] : []),
		...(projects > 0 ? [plural(projects, "project")] : []),
		plural(open.length, "open task"),
		...(page.notes.length > 0 ? [plural(page.notes.length, "note")] : []),
	].join(" · ");
	return {
		domain,
		header: {
			...noHeader,
			title: tag ? tag.name : "Untagged",
			icon: { type: "icon", name: "tag", tint: tag ? "accent" : "muted" },
			lines: [lines],
			chips: page.children.map((child) => ({ label: tagLeaf(child.tag), count: child.count, domain: { kind: "tag", path: child.tag.path }, icon: { type: "icon", name: "tag", tint: "accent" } })),
		},
		groupList: null,
		grouping: null,
		filter: null,
		sections,
		empty: null,
	};
}

// Archives and search

function logbookList(ctx: ListContext): ListModel {
	const { index, today } = ctx;
	const groups = logbookGroups(index, logbookItems(index), today);
	const waiting = groups.filter((group) => group.kind !== "logged").reduce((sum, group) => sum + group.items.length, 0);
	return {
		domain: { kind: "logbook" },
		header: { ...noHeader, title: "Logbook", icon: { type: "icon", name: "book-check", tint: "done" }, lines: waiting > 0 ? [`${waiting} completed, still in place`] : [] },
		groupList: null,
		grouping: null,
		filter: null,
		sections: groups.map((group) =>
			plain(`logbook:${group.title}`, group.items.map((item) => logbookRow(index, item, today)), {
				style: "archive",
				title: group.title,
				note: group.kind === "logsTonight" ? "Still in place · logs tonight" : null,
			}),
		),
		empty: groups.length === 0 ? "Nothing logged yet" : null,
	};
}

function trashList(ctx: ListContext): ListModel {
	const rows = ctx.trash.map(({ item }): ArchiveRowModel => {
		const p = item.properties;
		let meta: string;
		switch (p.kind) {
			case "area": {
				const contents = contentsOf(item, [...ctx.trash]);
				meta = `Area · deleted with ${plural(contents.projects.length, "project")} and ${plural(contents.tasks.length, "task")}`;
				break;
			}
			case "project":
				meta = p.area ? linkTitle(p.area) : "Project";
				break;
			case "task":
				meta = (p.project ? linkTitle(p.project) : null) ?? (p.area ? linkTitle(p.area) : null) ?? "Loose task";
				break;
			case "note":
				meta = "Note";
				break;
		}
		const done = subtasksOf(item);
		return { type: "trashed", id: item.path, path: null, title: item.title, kind: p.kind, status: p.status, meta, subtasks: done.total > 0 ? done : null, date: null };
	});
	return {
		domain: { kind: "trash" },
		header: { ...noHeader, title: "Trash", icon: { type: "icon", name: "trash-2", tint: "muted" } },
		groupList: null,
		grouping: null,
		filter: null,
		sections: rows.length === 0 ? [] : [plain("trash", rows)],
		empty: rows.length === 0 ? "Trash is empty" : null,
	};
}

function searchList(domain: Extract<Domain, { kind: "search" }>, ctx: ListContext): ListModel {
	const { index, today } = ctx;
	const hits = searchIndex(index, domain.query).filter((item) => item.properties.kind !== "note");
	const rows: ListRow[] = hits.map((item) => {
		switch (item.properties.kind) {
			case "task":
				return taskRow(index, item, today, { dates: "elsewhere", place: false });
			default:
				return cardRow(index, item);
		}
	});
	return {
		domain,
		header: { ...noHeader, title: "Search", icon: { type: "icon", name: "search", tint: "muted" }, detail: hits.length === 0 ? null : plural(hits.length, "result") },
		groupList: null,
		grouping: null,
		filter: null,
		sections: rows.length === 0 ? [] : [plain("search", rows)],
		empty: rows.length === 0 ? "No results" : null,
	};
}

// Shared pieces

const noMatches = "No matches";

function emptyOf(total: number, shown: number, whenEmpty: string): string | null {
	if (total === 0) return whenEmpty;
	return shown === 0 ? noMatches : null;
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function countHeader(title: string, count: number): SectionHeader {
	return { style: "count", title, count, quiet: false };
}

function plain(id: string, rows: ListRow[], header: SectionHeader | null = null): SectionModel {
	return { id, header, rows, foldable: false, folded: false, message: null };
}

/** A section that folds: `startsFolded` is how it opens until the reader flips it (the id is in `options.folds`). */
function foldable(id: string, header: SectionHeader, rows: ListRow[], startsFolded: boolean, options: ListOptions): SectionModel {
	return { id, header, rows, foldable: true, folded: startsFolded !== options.folds.has(id), message: null };
}

/** The name a section's fold is kept under. Open's groups keep their title alone. */
function foldName(section: ListSection, grouping: Grouping): string {
	return grouping === "Open" ? section.title : `${grouping}: ${section.title}`;
}

/** Done, Cancelled and Date's Completed start folded. */
function startsFolded(section: ListSection, grouping: Grouping): boolean {
	const kind = section.kind;
	switch (kind.case) {
		case "status":
			return isClosed(kind.value);
		case "completed":
			return grouping === "Date";
		default:
			return false;
	}
}

/** A Completed, Done or Cancelled group. */
function isClosedSection(section: ListSection): boolean {
	const kind = section.kind;
	return kind.case === "completed" || (kind.case === "status" && isClosed(kind.value));
}

/** The filter's tags, picked ones kept when no file carries them any more. Null where no file carries a tag and none is picked. */
export function filterModel(items: Item[], picked: ReadonlySet<string>, shown: number): FilterModel | null {
	const tags = TagFilter.tags(items).map(({ tag, count }) => ({ path: tag.path, name: tag.name, count, picked: picked.has(tag.path) }));
	for (const path of picked) {
		if (!tags.some((tag) => tag.path === path)) tags.push({ path, name: path, count: 0, picked: true });
	}
	if (tags.length === 0) return null;
	return { tags, shown, total: items.length };
}
