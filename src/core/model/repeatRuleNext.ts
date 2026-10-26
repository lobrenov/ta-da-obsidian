import { daysIn, later, LocalDate } from "./localDate";
import type { RepeatRule } from "./repeatRule";

/** The dates a repeating task moves to. */
export interface NextDates {
	dueDate: LocalDate | null;
	deadline: LocalDate | null;
}

const withinUntil = (rule: RepeatRule, date: LocalDate): boolean => rule.until === null || date.compare(rule.until) <= 0;
const monthIndex = (date: LocalDate): number => date.year * 12 + date.month - 1;
const checked = (date: LocalDate | null, days: number): LocalDate | null => (date === null ? null : date.checkedAddingDays(days));

/**
 * The task's next dates (Next date and End in `docs/file-format.md`), or null when `until` ends the series or the date
 * is past year 9999. `rolloverDay` is the day the task moves forward. A `when done` rule without a `completedDate` counts
 * from the task's date, else from the day before `rolloverDay`; its result is never moved up to `rolloverDay`.
 */
export function nextDates(
	rule: RepeatRule,
	dueDate: LocalDate | null,
	deadline: LocalDate | null,
	completedDate: LocalDate | null,
	rolloverDay: LocalDate,
): NextDates | null {
	const before = rolloverDay.addingDays(-1);
	const date = rule.whenDone
		? afterDone(rule, completedDate ?? dueDate ?? deadline ?? before)
		: regular(rule, dueDate ?? deadline ?? completedDate ?? before, rolloverDay);
	if (date === null || !withinUntil(rule, date)) return null;
	if (dueDate === null) return deadline === null ? { dueDate: date, deadline: null } : { dueDate: null, deadline: date };
	if (deadline === null) return { dueDate: date, deadline: null };
	const moved = date.checkedAddingDays(dueDate.daysTo(deadline));
	return moved === null ? null : { dueDate: date, deadline: moved };
}

/**
 * The first date a task with no dates would be due: the first day of a rule that names its days (weekdays, a day of the
 * month, a date) on or after `today`, else `today`. Null when `until` has passed.
 */
export function firstDate(rule: RepeatRule, today: LocalDate): LocalDate | null {
	const namesDay =
		rule.frequency === "weekday" ||
		(rule.frequency === "week" && rule.weekdays.length > 0) ||
		(rule.frequency === "month" && rule.monthDay !== null) ||
		(rule.frequency === "year" && rule.yearDate !== null);
	const date = namesDay ? first(rule, today, today, 1) : today;
	return date && withinUntil(rule, date) ? date : null;
}

/**
 * The dates of a regular rule after `anchor`, on or after `from` and through `through`, each counted from `anchor`
 * rather than from the one before; stops at `until`.
 */
export function ruleDates(rule: RepeatRule, anchor: LocalDate, from: LocalDate, through: LocalDate): LocalDate[] {
	const result: LocalDate[] = [];
	let start = from;
	for (let date = regular(rule, anchor, start); date !== null && date.compare(through) <= 0 && withinUntil(rule, date); ) {
		result.push(date);
		const following = date.checkedAddingDays(1);
		if (following === null) break;
		start = following;
		date = regular(rule, anchor, start);
	}
	return result;
}

function regular(rule: RepeatRule, anchor: LocalDate, from: LocalDate): LocalDate | null {
	const day = anchor.checkedAddingDays(1);
	return day === null ? null : first(rule, later(day, from), anchor, rule.interval);
}

function afterDone(rule: RepeatRule, done: LocalDate): LocalDate | null {
	const tomorrow = done.checkedAddingDays(1);
	switch (rule.frequency) {
		case "day":
			return done.checkedAddingDays(rule.interval);
		case "weekday":
			return tomorrow && first(rule, tomorrow, done, 1);
		case "week": {
			if (rule.weekdays.length === 0) return done.checkedAddingDays(7 * rule.interval);
			return checked(tomorrow && first(rule, tomorrow, done, 1), 7 * (rule.interval - 1));
		}
		case "month":
			return rule.monthDay === null ? done.addingMonthsKeepingDay(rule.interval) : namedDayAfterDone(rule, done);
		case "year":
			return rule.yearDate === null ? done.addingMonthsKeepingDay(12 * rule.interval) : namedDayAfterDone(rule, done);
	}
}

/** A month or year rule's next named day after `done`, then `interval - 1` further periods. */
function namedDayAfterDone(rule: RepeatRule, done: LocalDate): LocalDate | null {
	const from = done.checkedAddingDays(1);
	const start = from && first(rule, from, done, 1);
	if (start === null) return null;
	if (rule.interval <= 1) return start;
	const following = start.checkedAddingDays(1);
	return following && first(rule, following, start, rule.interval - 1);
}

/** The first date of the rule on or after `t`, in periods of `n` days, weeks, months or years counted from `anchor`. */
function first(rule: RepeatRule, t: LocalDate, anchor: LocalDate, n: number): LocalDate | null {
	let periods: number;
	switch (rule.frequency) {
		case "weekday":
			for (let offset = 0; offset <= 2; offset++) {
				const date = t.checkedAddingDays(offset);
				if (date && date.weekday >= 2 && date.weekday <= 6) return date;
			}
			return null;
		case "day":
			periods = anchor.daysTo(t);
			break;
		case "week":
			periods = anchor.mondayOfWeek().daysTo(t.mondayOfWeek()) / 7;
			break;
		case "month":
			periods = monthIndex(t) - monthIndex(anchor);
			break;
		case "year":
			periods = t.year - anchor.year;
			break;
	}
	const start = Math.max(0, Math.trunc(periods / n));
	// A rule such as the 5th Monday skips months; 500 periods reach any month that has one.
	for (let k = start; k < start + 500; k++) {
		const date = datesInPeriod(rule, k * n, anchor).find((candidate) => candidate.compare(t) >= 0);
		if (date) return date;
	}
	return null;
}

/** The rule's dates in the period `k` days, weeks, months or years after `anchor`'s, in order. */
function datesInPeriod(rule: RepeatRule, k: number, anchor: LocalDate): LocalDate[] {
	switch (rule.frequency) {
		case "weekday":
			return [];
		case "day":
			return one(anchor.checkedAddingDays(k));
		case "week": {
			const monday = anchor.mondayOfWeek();
			const days = rule.weekdays.length === 0 ? [anchor.weekday] : rule.weekdays;
			return days
				.flatMap((weekday) => one(monday.checkedAddingDays(7 * k + ((weekday + 5) % 7))))
				.sort((a, b) => a.compare(b));
		}
		case "month": {
			const index = monthIndex(anchor) + k;
			const [year, month] = [Math.floor(index / 12), (index % 12) + 1];
			const firstOfMonth = LocalDate.of(year, month, 1);
			if (firstOfMonth === null) return [];
			const length = daysIn(month, year);
			const lastWeekday = ((firstOfMonth.weekday + length - 2) % 7) + 1;
			const monthDay = rule.monthDay ?? { case: "day", day: anchor.day };
			let day: number;
			switch (monthDay.case) {
				case "day":
					day = Math.min(monthDay.day, length);
					break;
				case "lastDay":
					day = length;
					break;
				case "nth":
					day = 1 + ((monthDay.weekday - firstOfMonth.weekday + 7) % 7) + 7 * (monthDay.n - 1);
					break;
				case "lastWeekday":
					day = length - ((lastWeekday - monthDay.weekday + 7) % 7);
					break;
			}
			return one(LocalDate.of(year, month, day));
		}
		case "year": {
			const year = anchor.year + k;
			const { month, day } = rule.yearDate ?? { month: anchor.month, day: anchor.day };
			return year > 9999 ? [] : one(LocalDate.of(year, month, Math.min(day, daysIn(month, year))));
		}
	}
}

const one = (date: LocalDate | null): LocalDate[] => (date === null ? [] : [date]);
