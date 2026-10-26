import type { Item } from "../model/item";
import type { LocalDate } from "../model/localDate";
import { isClosed } from "../model/status";
import { nextForCompleted } from "../writing/recurrence";

/** Where a repeating task goes when logging moves it forward. */
export type RepeatMove =
	/** The task reopens on this date (its due date, else its deadline). */
	| { case: "moves"; to: LocalDate }
	/** The series ends: `until` or the task's project ends it, so the task logs. */
	| { case: "ends" };

/** The day logging moves a task completed on `completedDate` forward on: `today`, or the day after for a task completed today. */
export function rolloverDay(completedDate: LocalDate | null, today: LocalDate): LocalDate {
	return completedDate === null || completedDate.compare(today) < 0 ? today : today.addingDays(1);
}

/**
 * What logging does to a repeating task: null unless it's a task whose rule reads and that is Done or Cancelled. With
 * `completing`, the task counts as completed today, so this is where it would move. Uses the same decision as the
 * logging run, including a closed project ending the series.
 */
export function repeatMove(index: { projectOf(item: Item): Item | null }, item: Item, today: LocalDate, completing = false): RepeatMove | null {
	if (item.properties.kind !== "task" || !item.properties.repeatRule?.rule) return null;
	const properties = { ...item.properties };
	if (completing) {
		if (!isClosed(properties.status)) properties.status = "Done";
		properties.completedDate = today;
	}
	if (!isClosed(properties.status)) return null;
	const closed = isClosed(index.projectOf(item)?.properties.status ?? "Not Started");
	const next = nextForCompleted({ ...item, properties }, rolloverDay(properties.completedDate, today), closed);
	const date = next && (next.dueDate ?? next.deadline);
	return date ? { case: "moves", to: date } : { case: "ends" };
}
