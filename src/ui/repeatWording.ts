import { type RepeatMove, repeatMove } from "../core/index/repeatMove";
import type { Item, Properties, Repeat } from "../core/model/item";
import type { LocalDate } from "../core/model/localDate";
import type { Status } from "../core/model/status";
import { relativeLabel, weekdayDayMonth } from "./navigator/dates";

/** What the chips, rows and status menus say about a repeating task. */

/** `tomorrow`, `today`, or `Mon 9 Nov` (with the year when it isn't this year's). */
export function day(date: LocalDate, today: LocalDate): string {
	switch (today.daysTo(date)) {
		case 0:
			return "today";
		case 1:
			return "tomorrow";
		default:
			return relativeLabel(date, today);
	}
}

/** A status row's name, `label` unless it's Cancelled on a repeating task: `Skip this time`. */
export function statusTitle(status: Status, repeating: boolean, label: string): string {
	return repeating && status === "Cancelled" ? "Skip this time" : label;
}

/** What Done or Skip does to a repeating task: `moves to Mon 9 Nov`, or `ends the repeat`. */
export function moveNote(move: RepeatMove, today: LocalDate): string {
	return move.case === "moves" ? `moves to ${day(move.to, today)}` : "ends the repeat";
}

/** How a file's status menu words itself: `repeating` for a task whose rule reads, and the `move` completing it would make. */
export function statusContext(
	item: Item,
	index: { projectOf(item: Item): Item | null },
	today: LocalDate,
): { repeating: boolean; move: RepeatMove | null } {
	const repeating = item.properties.kind === "task" && item.properties.repeatRule?.rule != null;
	return { repeating, move: repeating ? repeatMove(index, item, today, true) : null };
}

/** A row's text after the repeat glyph for a done or skipped task waiting to move: `Tomorrow` or `Ended`. */
export function rowNext(move: RepeatMove, today: LocalDate): string {
	if (move.case === "ends") return "Ended";
	const text = day(move.to, today);
	return text.slice(0, 1).toUpperCase() + text.slice(1);
}

/** `Repeats every week on Monday until Sun 20 Dec`. */
function ruleText(rule: NonNullable<Repeat["rule"]>, today: LocalDate): string {
	const text = rule.description((date) => (date.year === today.year ? weekdayDayMonth(date) : `${weekdayDayMonth(date)} ${date.year}`));
	return `Repeats ${text.slice(0, 1).toLowerCase()}${text.slice(1)}`;
}

/** A row glyph's tooltip: `Repeats every week on Monday`, with where a done task moves. */
export function rowHelp(repeat: Repeat, move: RepeatMove | null, today: LocalDate): string {
	if (!repeat.rule) return `Repeats ${repeat.text}`;
	const spelled = ruleText(repeat.rule, today);
	if (move?.case === "moves") return `${spelled} · moves to ${day(move.to, today)} when the day changes`;
	return move?.case === "ends" ? `${spelled} · the repeat ends` : spelled;
}

/** The chip that carries a task's rule: the due chip, or the deadline chip when there's a deadline and no due date. */
export function chipKind(properties: Properties): "dueDate" | "deadline" | null {
	if (properties.kind !== "task" || !properties.repeatRule) return null;
	return properties.dueDate === null && properties.deadline !== null ? "deadline" : "dueDate";
}

/** A due or deadline chip's tooltip: the rule spelled out and, for a rule that reads, the next date. */
export function chipHelp(repeat: Repeat, next: RepeatMove | null, today: LocalDate): string {
	if (!repeat.rule) return "Ta Da can't read this rule, so the task doesn't repeat";
	const spelled = ruleText(repeat.rule, today);
	return next?.case === "moves" ? `${spelled} · next ${day(next.to, today)}` : spelled;
}
