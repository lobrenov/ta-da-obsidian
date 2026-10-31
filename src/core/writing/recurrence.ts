import type { Item } from "../model/item";
import type { LocalDate } from "../model/localDate";
import { nextDates, type NextDates } from "../model/repeatRuleNext";
import { isClosed } from "../model/status";
import { parseItem } from "../parsing/parseItem";
import { setMarker } from "./checklistEditor";
import { setStatus } from "./completion";
import { setProperty } from "./frontmatterEditor";

/**
 * The dates a completed task moves to on `today`: null unless it's a Done or Cancelled task whose `repeat` reads as a
 * rule with a next date, and whose project (`projectClosed`: it resolves and is Done or Cancelled) hasn't ended the series.
 */
export function nextForCompleted(item: Item, today: LocalDate, projectClosed: boolean): NextDates | null {
	const p = item.properties;
	const rule = p.repeatRule?.rule;
	if (p.kind !== "task" || !isClosed(p.status) || projectClosed || !rule) return null;
	return nextDates(rule, p.dueDate, p.deadline, p.completedDate, today);
}

/**
 * `text` with the task moved forward in one splice: `status: Not Started`, `completedDate` emptied, `dueDate` and
 * `deadline` set to the next dates (a key is added when missing), and subtasks `[x]`, `[X]`, `[/]` and `[-]` reset to
 * `[ ]`. Unchanged when the task doesn't move forward.
 */
export function moveForward(text: string, path: string, today: LocalDate, projectClosed: boolean): string {
	const item = parseItem(text, path);
	const next = item && nextForCompleted(item, today, projectClosed);
	if (!item || !next) return text;
	let result = text;
	for (const box of item.checkboxes) {
		if ("xX/-".includes(box.marker)) result = setMarker(" ", box, result) ?? result;
	}
	result = setStatus("Not Started", result, today);
	if (next.dueDate) result = setProperty("dueDate", { kind: "date", value: next.dueDate }, result);
	if (next.deadline) result = setProperty("deadline", { kind: "date", value: next.deadline }, result);
	return result;
}
