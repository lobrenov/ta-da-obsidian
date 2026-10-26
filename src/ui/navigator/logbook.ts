import { repeatMove } from "../../core/index/repeatMove";
import type { VaultIndex } from "../../core/index/vaultIndex";
import { byTitle } from "../../core/index/vaultIndex";
import { type Item, isLogged, subtasks } from "../../core/model/item";
import type { LocalDate } from "../../core/model/localDate";
import { isClosed } from "../../core/model/status";
import { monthTitle } from "../dates";
import { dayMonth, wideWeekdayDayMonth } from "./dates";
import type { ArchiveRowModel } from "./rows";

export type LogbookGroupKind = "logsTonight" | "waitsForOpenTasks" | "logged";

/** The Logbook's groups: files not logged yet (logging tonight, or waiting for a project's open tasks), then logged ones. */
export interface LogbookGroup {
	/** `Completed today`, `Waiting for open tasks`, `Thursday 1 Oct`, `September` or `September 2025`. */
	title: string;
	kind: LogbookGroupKind;
	items: Item[];
}

/** Tasks and projects that are logged or completed, by title. */
export function logbookItems(index: VaultIndex): Item[] {
	return [...index.items.values()]
		.filter((item) => item.properties.kind !== "area" && item.properties.kind !== "note" && (isLogged(item) || isClosed(item.properties.status)))
		.sort(byTitle);
}

/** Whether a file waits to be logged: a live Done or Cancelled project that still has open tasks, or one of its tasks. */
export function waitsForOpenTasks(index: VaultIndex, item: Item): boolean {
	const project = item.properties.kind === "project" ? item : index.projectOf(item);
	if (!project || isLogged(project) || !isClosed(project.properties.status)) return false;
	return index.openTasksIn(project).length > 0;
}

/**
 * Newest first, then by title. Files not logged yet come first: those that log tonight, then those held back for a
 * project's open tasks. A file without a `completedDate` goes in `today`'s group. A repeating task that logging moves
 * forward isn't logged, so it's left out; one whose series ends stays.
 */
export function logbookGroups(index: VaultIndex, items: Item[], today: LocalDate): LogbookGroup[] {
	const completed = (item: Item): LocalDate => item.properties.completedDate ?? today;
	const sorted = [...items].sort((a, b) => completed(b).compare(completed(a)) || byTitle(a, b));
	const live = sorted.filter((item) => !isLogged(item));
	const held = live.filter((item) => waitsForOpenTasks(index, item));
	const tonight = live.filter((item) => repeatMove(index, item, today)?.case !== "moves" && !waitsForOpenTasks(index, item));
	const groups: LogbookGroup[] = [];
	if (tonight.length > 0) groups.push({ title: "Completed today", kind: "logsTonight", items: tonight });
	if (held.length > 0) groups.push({ title: "Waiting for open tasks", kind: "waitsForOpenTasks", items: held });
	for (const item of sorted.filter(isLogged)) {
		const title = groupTitle(completed(item), today);
		const last = groups[groups.length - 1];
		if (last?.kind === "logged" && last.title === title) last.items.push(item);
		else groups.push({ title, kind: "logged", items: [item] });
	}
	return groups;
}

/** `Today`, `Thursday 1 Oct` in the last week, then the month, with its year when it isn't this year's. */
function groupTitle(date: LocalDate, today: LocalDate): string {
	if (date.equals(today)) return "Today";
	if (date.compare(today.addingDays(-7)) > 0) return wideWeekdayDayMonth(date);
	return monthTitle(date, today);
}

/** A task's project or area, or `Loose task`; `Project · 4 tasks · Personal` for a project. */
function meta(index: VaultIndex, item: Item): string {
	if (item.properties.kind !== "project") return index.parentOf(item)?.title ?? "Loose task";
	const count = index.tasksIn(item, true).length;
	const area = index.areaOf(item)?.title;
	return ["Project", count === 1 ? "1 task" : `${count} tasks`, ...(area ? [area] : [])].join(" · ");
}

/** A Logbook row. */
export function logbookRow(index: VaultIndex, item: Item, today: LocalDate): ArchiveRowModel {
	const done = subtasks(item);
	const date = item.properties.completedDate ?? today;
	return {
		type: "logged",
		id: item.path,
		path: item.path,
		title: item.title,
		kind: item.properties.kind,
		status: item.properties.status,
		meta: meta(index, item),
		subtasks: done.total > 0 ? done : null,
		date: date.equals(today) ? "Today" : dayMonth(date, today),
	};
}
