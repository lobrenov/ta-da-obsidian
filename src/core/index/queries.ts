import type { Item } from "../model/item";
import { later, LocalDate, type ISOWeek } from "../model/localDate";
import { nextDates, ruleDates } from "../model/repeatRuleNext";
import { isClosed } from "../model/status";
import { linkTitle } from "../model/wikiLink";
import { nextForCompleted } from "../writing/recurrence";
import { dailyNote, type DailyNoteNames, defaultDailyNoteNames, openCheckboxCount } from "./dailyNotes";
import { byDate, byTitle, type VaultIndex } from "./vaultIndex";

/** One dated entry in Upcoming. An item gets one entry on its `dueDate` and another on its `deadline`. */
export interface AgendaEntry {
	item: Item;
	date: LocalDate;
	kind: "due" | "deadline";
}

/** A sidebar project: done/total of its linked tasks, Cancelled tasks left out of the total. */
export interface ProjectProgress {
	project: Item;
	done: number;
	total: number;
}

/** Tasks shown under one project or area heading, or under no heading for tasks without a parent. */
export interface TaskGroup {
	parent: Item | null;
	tasks: Item[];
}

/** A sidebar area and its active projects. */
export interface AreaProjects {
	area: Item;
	projects: ProjectProgress[];
}

/** A coming date of a repeating task, not yet in its file. `estimated` when a `when done` rule's date assumes each task is done on its day. */
export interface Occurrence {
	item: Item;
	date: LocalDate;
	kind: "due" | "deadline";
	estimated: boolean;
}

/** What a date shows in the Agenda's strip, month and week rows. */
export interface DayMarks {
	/** An open task is due or at its deadline that day. */
	hasOpenTasks: boolean;
	/** That day's daily note has unchecked boxes. */
	hasOpenBoxes: boolean;
}

// The saved queries behind the sidebar domains. `today` is always passed in. Today, Upcoming and Loose list tasks;
// projects show their dates on their own page. Each list applies a per-item test to every task, and the tests answer
// for one file too.

/** The progress of `project` over `tasks`, leaving the Cancelled ones out of the total. */
export function projectProgress(project: Item, tasks: Item[]): ProjectProgress {
	const counted = tasks.filter((task) => task.properties.status !== "Cancelled");
	return { project, done: counted.filter((task) => task.properties.status === "Done").length, total: counted.length };
}

/**
 * Open tasks due or at their deadline today or earlier, plus tasks completed (Done or Cancelled) today.
 * Sorted by their earliest date, then title.
 */
export function todayTasks(index: VaultIndex, today: LocalDate): Item[] {
	return index.tasks.filter((task) => isInToday(task, today)).sort(byDate);
}

/**
 * The tasks an Agenda day lists. Today's list for `today`; for any other day, tasks due or at their deadline that day
 * that are open or Done, sorted by their earliest date, then title.
 */
export function agendaDay(index: VaultIndex, date: LocalDate, today: LocalDate): Item[] {
	if (date.equals(today)) return todayTasks(index, today);
	return index.tasks.filter((task) => agendaEntries(task, [date]).length > 0).sort(byDate);
}

/** The entries an Agenda week lists: open or Done tasks' due dates and deadlines within the week, in Upcoming's order. */
export function agendaWeek(index: VaultIndex, week: ISOWeek): AgendaEntry[] {
	const days = week.days;
	return index.tasks.flatMap((task) => agendaEntries(task, days)).sort(byAgendaOrder);
}

/**
 * For each date from `from` through `through` that has either mark. An occurrence marks its day like an open task, except
 * those of `every day` and `every weekday` rules. The daily note is looked up by `names`.
 */
export function dayMarks(
	index: VaultIndex,
	from: LocalDate,
	through: LocalDate,
	today: LocalDate,
	names: DailyNoteNames = defaultDailyNoteNames,
): Map<string, DayMarks> {
	const marks = new Map<string, DayMarks>();
	if (from.compare(through) > 0) return marks;
	const marksFor = (date: LocalDate): DayMarks => {
		let entry = marks.get(date.toString());
		if (!entry) {
			entry = { hasOpenTasks: false, hasOpenBoxes: false };
			marks.set(date.toString(), entry);
		}
		return entry;
	};
	for (const task of index.tasks) {
		if (isClosed(task.properties.status)) continue;
		for (const date of [task.properties.dueDate, task.properties.deadline]) {
			if (date && date.compare(from) >= 0 && date.compare(through) <= 0) marksFor(date).hasOpenTasks = true;
		}
	}
	for (const task of index.tasks) {
		const rule = task.properties.repeatRule?.rule;
		if (!rule || rule.frequency === "weekday" || (rule.frequency === "day" && rule.interval === 1)) continue;
		for (const occurrence of occurrences(index, task, from, through, today)) marksFor(occurrence.date).hasOpenTasks = true;
	}
	const days = from.daysTo(through);
	for (let offset = 0; offset <= days; offset++) {
		const date = from.addingDays(offset);
		const note = dailyNote(index, date, names);
		if (note && openCheckboxCount(note) > 0) marksFor(date).hasOpenBoxes = true;
	}
	return marks;
}

/**
 * A repeating task's coming dates from `from` through `through`, by date, due before deadline, each assumed done on its
 * day. An open task's are the rule's dates after its current date that are after `today`. A completed task not yet moved
 * forward lists its next date too, as the logging run would set it: on `today`, or the day after for a task completed
 * today. A deadline-only task has deadline occurrences; a task with both has a due occurrence on each date and a deadline
 * one at the same offset. A `when done` rule's are estimates, except a completed task's first. A month or year rule
 * without `on …` steps date by date, as logging does. Empty without a rule that reads, or past `until`.
 */
export function occurrences(index: VaultIndex, item: Item, from: LocalDate, through: LocalDate, today: LocalDate): Occurrence[] {
	const p = item.properties;
	const rule = p.repeatRule?.rule;
	if (p.kind !== "task" || !rule || from.compare(through) > 0) return [];
	const checkedRule = rule;
	let dates: LocalDate[] = [];
	let anchor: LocalDate;
	let known: LocalDate | null = null;
	let hasDue = p.dueDate !== null;
	let hasDeadline = p.deadline !== null;
	let offset = p.dueDate && p.deadline ? p.dueDate.daysTo(p.deadline) : 0;
	let earliest = from;
	if (isClosed(p.status)) {
		const rollover = p.completedDate === null || p.completedDate.compare(today) < 0 ? today : today.addingDays(1);
		const closed = isClosed(index.projectOf(item)?.properties.status ?? "Not Started");
		const next = nextForCompleted(item, rollover, closed);
		const date = next && (next.dueDate ?? next.deadline);
		if (!next || !date) return [];
		hasDue = next.dueDate !== null;
		hasDeadline = next.deadline !== null;
		offset = next.dueDate && next.deadline ? next.dueDate.daysTo(next.deadline) : 0;
		dates = [date];
		anchor = date;
		if (rule.whenDone) known = date;
	} else {
		const date = p.dueDate ?? p.deadline;
		if (!date) return [];
		anchor = rule.whenDone ? later(date, today) : date;
		earliest = later(from, today.addingDays(1));
	}
	const low = earlier(earliest, earliest.addingDays(-offset));
	const high = later(through, through.addingDays(-offset));
	const drifts = (rule.frequency === "month" && rule.monthDay === null) || (rule.frequency === "year" && rule.yearDate === null);
	if (rule.whenDone || drifts) {
		for (let date = stepped(); date && date.compare(high) <= 0; date = stepped()) {
			dates.push(date);
			anchor = date;
		}
	} else {
		dates.push(...ruleDates(rule, anchor, low, high));
	}
	function stepped(): LocalDate | null | undefined {
		return nextDates(checkedRule, anchor, null, anchor, later(anchor, today).addingDays(1))?.dueDate;
	}
	const found = dates
		.filter((date) => date.compare(low) >= 0 && date.compare(high) <= 0 && (isClosed(p.status) || date.compare(today) > 0))
		.flatMap((date): Occurrence[] => {
			const estimated = rule.whenDone && !(known && date.equals(known));
			const entries: Occurrence[] = [];
			if (hasDue) entries.push({ item, date, kind: "due", estimated });
			const moved = hasDeadline ? date.checkedAddingDays(offset) : null;
			if (moved) entries.push({ item, date: moved, kind: "deadline", estimated });
			return entries;
		});
	return found
		.filter((entry) => entry.date.compare(from) >= 0 && entry.date.compare(through) <= 0)
		.sort((a, b) => a.date.compare(b.date) || (a.kind === b.kind ? 0 : a.kind === "due" ? -1 : 1));
}

const earlier = (a: LocalDate, b: LocalDate): LocalDate => (a.compare(b) <= 0 ? a : b);

/** Whether a task is in Today: open and due or at its deadline today or earlier, or completed (Done or Cancelled) today. */
export function isInToday(item: Item, today: LocalDate): boolean {
	const p = item.properties;
	if (p.kind !== "task") return false;
	if (isClosed(p.status)) return p.completedDate?.equals(today) === true;
	return [p.dueDate, p.deadline].some((date) => date !== null && date.compare(today) <= 0);
}

/** An open item whose due date or deadline has passed. */
export function isOverdue(item: Item, today: LocalDate): boolean {
	const p = item.properties;
	return !isClosed(p.status) && [p.dueDate, p.deadline].some((date) => date !== null && date.compare(today) < 0);
}

/** Entries for open tasks dated after today, by date, due before deadline, then title. */
export function upcoming(index: VaultIndex, today: LocalDate): AgendaEntry[] {
	return index.tasks.flatMap((task) => upcomingEntries(task, today)).sort(byAgendaOrder);
}

/** A task's entries in Upcoming: one on its due date and one on its deadline, when the task is open and they're after today. */
export function upcomingEntries(item: Item, today: LocalDate): AgendaEntry[] {
	const p = item.properties;
	if (p.kind !== "task" || isClosed(p.status)) return [];
	return entriesOf(item).filter((entry) => entry.date.compare(today) > 0).sort(byAgendaOrder);
}

/** Open tasks without a parent that resolves, sorted by their earliest date, then title. */
export function looseTasks(index: VaultIndex): Item[] {
	return index.tasks.filter((task) => isLoose(index, task)).sort(byDate);
}

/** Whether a task is in Loose tasks: open, with no project or area that resolves. */
export function isLoose(index: VaultIndex, item: Item): boolean {
	return item.properties.kind === "task" && !isClosed(item.properties.status) && index.parentOf(item) === null;
}

/** Projects that aren't Done or Cancelled, with progress over all their linked tasks, sorted by title. */
export function activeProjects(index: VaultIndex): ProjectProgress[] {
	return index.projects
		.filter((project) => !isClosed(project.properties.status))
		.sort(byTitle)
		.map((project) => progress(index, project));
}

/** Active projects without an area that resolves, sorted by title. */
export function looseProjects(index: VaultIndex): ProjectProgress[] {
	return activeProjects(index).filter((entry) => index.areaOf(entry.project) === null);
}

/** Every area by title, each with its active projects by title. */
export function areaProjects(index: VaultIndex): AreaProjects[] {
	return index.areas.sort(byTitle).map((area) => ({
		area,
		projects: index
			.projectsIn(area)
			.filter((project) => !isClosed(project.properties.status))
			.map((project) => progress(index, project)),
	}));
}

/** Done/total of the tasks whose `project` resolves to this project, logged ones included. Cancelled tasks are left out of the total. */
export function progress(index: VaultIndex, project: Item): ProjectProgress {
	return projectProgress(project, index.tasksIn(project, true));
}

/**
 * Splits tasks into groups: tasks without a parent first, then loose projects' groups by title, then each area by
 * title with its own tasks followed by its projects' groups. Order within a group is kept.
 */
export function grouped(index: VaultIndex, tasks: Item[]): TaskGroup[] {
	const loose: Item[] = [];
	const byParent = new Map<string, Item[]>();
	for (const task of tasks) {
		const parent = index.parentOf(task);
		if (parent) byParent.set(parent.path, (byParent.get(parent.path) ?? []).concat(task));
		else loose.push(task);
	}
	const items = (path: string): Item | undefined => index.get(path);
	const projects = [...byParent.keys()].flatMap((path) => items(path) ?? []).filter((item) => item.properties.kind === "project");
	const looseProjects = projects.filter((project) => index.areaOf(project) === null).sort(byTitle);
	const areaPaths = new Set([...byParent.keys()].filter((path) => items(path)?.properties.kind === "area"));
	for (const project of projects) {
		const area = index.areaOf(project);
		if (area) areaPaths.add(area.path);
	}

	const groups: TaskGroup[] = loose.length === 0 ? [] : [{ parent: null, tasks: loose }];
	for (const project of looseProjects) groups.push({ parent: project, tasks: byParent.get(project.path) ?? [] });
	for (const area of [...areaPaths].flatMap((path) => items(path) ?? []).sort(byTitle)) {
		groups.push({ parent: area, tasks: byParent.get(area.path) ?? [] });
		for (const project of projects.filter((p) => index.areaOf(p)?.path === area.path).sort(byTitle)) {
			groups.push({ parent: project, tasks: byParent.get(project.path) ?? [] });
		}
	}
	return groups;
}

/**
 * Items that aren't logged whose title, summary or area (a task's through its project) contain every word of the
 * query, ignoring case and diacritics. Titles that match rank first.
 */
export function search(index: VaultIndex, query: string): Item[] {
	const words = query.split(/[\s\u0085]+/).filter((word) => word !== "").map(fold);
	if (words.length === 0) return [];
	const matches = (text: string): boolean => {
		const folded = fold(text);
		return words.every((word) => folded.includes(word));
	};
	const hits = index.liveItems.filter((item) => {
		const area = index.areaOf(item)?.title ?? (item.properties.area ? linkTitle(item.properties.area) : "");
		return matches([item.title, item.summary ?? "", area].join("\n"));
	});
	return hits.sort((a, b) => {
		const [ta, tb] = [matches(a.title), matches(b.title)];
		return ta !== tb ? (ta ? -1 : 1) : byTitle(a, b);
	});
}

function fold(text: string): string {
	return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** A task's entries on `dates`, when it's open or Done. */
function agendaEntries(item: Item, dates: LocalDate[]): AgendaEntry[] {
	const p = item.properties;
	if (p.kind !== "task" || p.status === "Cancelled") return [];
	return entriesOf(item).filter((entry) => dates.some((date) => date.equals(entry.date)));
}

function entriesOf(item: Item): AgendaEntry[] {
	const entries: AgendaEntry[] = [];
	if (item.properties.dueDate) entries.push({ item, date: item.properties.dueDate, kind: "due" });
	if (item.properties.deadline) entries.push({ item, date: item.properties.deadline, kind: "deadline" });
	return entries;
}

/** Upcoming's order: by date, due before deadline, then title. */
function byAgendaOrder(a: AgendaEntry, b: AgendaEntry): number {
	const byDay = a.date.compare(b.date);
	if (byDay !== 0) return byDay;
	if (a.kind !== b.kind) return a.kind === "due" ? -1 : 1;
	return byTitle(a.item, b.item);
}

