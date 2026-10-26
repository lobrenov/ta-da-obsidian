import type { LocalDate } from "../core/model/localDate";
import { RepeatRule, type RepeatRuleFields } from "../core/model/repeatRule";
import { ruleDates } from "../core/model/repeatRuleNext";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const fieldsOf = (rule: RepeatRule): RepeatRuleFields => ({
	frequency: rule.frequency,
	interval: rule.interval,
	weekdays: rule.weekdays,
	monthDay: rule.monthDay,
	yearDate: rule.yearDate,
	until: rule.until,
	whenDone: rule.whenDone,
});

/** The rule with `changes`; the same fields were valid before, so it always builds. */
const changed = (rule: RepeatRule, changes: RepeatRuleFields | Partial<RepeatRuleFields>): RepeatRule =>
	RepeatRule.create({ ...fieldsOf(rule), ...changes }) as RepeatRule;

/** The rule ending on `until`, or never for null. */
export function ending(rule: RepeatRule, until: LocalDate | null): RepeatRule {
	return changed(rule, { until });
}

/** The rule counting from completion, or on its schedule. */
export function withWhenDone(rule: RepeatRule, whenDone: boolean): RepeatRule {
	return changed(rule, { whenDone });
}

/** The rule with a month or year rule's day taken from `date` when it names none, as Ta Da writes it. */
export function anchored(rule: RepeatRule, date: LocalDate): RepeatRule {
	if (rule.frequency === "month" && rule.monthDay === null) return changed(rule, { monthDay: { case: "day", day: date.day } });
	if (rule.frequency === "year" && rule.yearDate === null) return changed(rule, { yearDate: { month: date.month, day: date.day } });
	return rule;
}

/** Where a rule starts when its task has no date: the first day it names on or after `today`, else `today`; null past its end. */
export function firstDate(rule: RepeatRule, today: LocalDate): LocalDate | null {
	const namesDay =
		rule.frequency === "weekday" ||
		(rule.frequency === "week" && rule.weekdays.length > 0) ||
		(rule.frequency === "month" && rule.monthDay !== null) ||
		(rule.frequency === "year" && rule.yearDate !== null);
	const date = namesDay ? ruleDates(changed(rule, { interval: 1, until: null }), today.addingDays(-1), today, today.addingDays(3000))[0] : today;
	return date && (rule.until === null || date.compare(rule.until) <= 0) ? date : null;
}

/** What setting `rule` writes on a task: the rule's text, and the due date it starts on when the task has no date and no rule yet. */
export function repeatStart(
	rule: RepeatRule,
	task: { dueDate: LocalDate | null; deadline: LocalDate | null; hasRule: boolean },
	today: LocalDate,
): { text: string; dueDate: LocalDate | null } {
	const start = task.dueDate ?? task.deadline ?? firstDate(rule, today);
	return { text: anchored(rule, start ?? today).phrase, dueDate: !task.dueDate && !task.deadline && !task.hasRule ? start : null };
}

/** The rule spelled out, with `format` writing its end date: "Every week on Monday", "Every month on the 2nd Tuesday until Sun 20 Dec when done". */
export function spelledRule(rule: RepeatRule, format: (date: LocalDate) => string): string {
	let words = rule.frequency === "weekday" || rule.interval === 1 ? `Every ${rule.frequency}` : `Every ${rule.interval} ${rule.frequency}s`;
	const day = (weekday: number): string => dayNames[weekday - 1] as string;
	if (rule.frequency === "week" && rule.weekdays.length > 0) {
		const names = [2, 3, 4, 5, 6, 7, 1].filter((weekday) => rule.weekdays.includes(weekday)).map(day);
		words += ` on ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`}`;
	} else if (rule.frequency === "month" && rule.monthDay) {
		const monthDay = rule.monthDay;
		if (monthDay.case === "day") words += ` on the ${ordinal(monthDay.day)}`;
		else if (monthDay.case === "lastDay") words += " on the last day";
		else if (monthDay.case === "nth") words += ` on the ${ordinal(monthDay.n)} ${day(monthDay.weekday)}`;
		else words += ` on the last ${day(monthDay.weekday)}`;
	} else if (rule.frequency === "year" && rule.yearDate) {
		words += ` on ${monthNames[rule.yearDate.month - 1]} ${rule.yearDate.day}`;
	}
	if (rule.until) words += ` until ${format(rule.until)}`;
	if (rule.whenDone) words += " when done";
	return words;
}

function ordinal(n: number): string {
	if (n >= 11 && n <= 13) return `${n}th`;
	return `${n}${["th", "st", "nd", "rd"][n % 10 < 4 ? n % 10 : 0]}`;
}
