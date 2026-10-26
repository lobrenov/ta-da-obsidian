import type { Item } from "../model/item";
import type { LocalDate } from "../model/localDate";
import { nextDates, type NextDates } from "../model/repeatRuleNext";
import { isClosed } from "../model/status";

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
