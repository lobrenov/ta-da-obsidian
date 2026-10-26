import { characters, isWhitespaceCharacter, lowercased } from "../writing/characters";
import { daysIn, LocalDate } from "./localDate";

export type Frequency = "day" | "weekday" | "week" | "month" | "year";

/** The day a month rule falls on. */
export type MonthDay =
	| { case: "day"; day: number }
	| { case: "lastDay" }
	/** The nth (1 to 5) weekday of the month. */
	| { case: "nth"; n: number; weekday: number }
	| { case: "lastWeekday"; weekday: number };

export interface YearDate {
	month: number;
	day: number;
}

export interface RepeatRuleFields {
	frequency: Frequency;
	/** 1 to 999; always 1 for `weekday`. */
	interval?: number;
	weekdays?: number[];
	monthDay?: MonthDay | null;
	yearDate?: YearDate | null;
	until?: LocalDate | null;
	whenDone?: boolean;
}

const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const fullDayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const fullMonthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const inRange = (value: number, low: number, high: number): boolean => Number.isInteger(value) && value >= low && value <= high;

/**
 * A repeating task's schedule, read from and written as an English phrase (Repeating tasks in `docs/file-format.md`).
 * Weekdays are 1 = Sunday to 7 = Saturday.
 */
export class RepeatRule {
	readonly frequency: Frequency;
	readonly interval: number;
	/** Week rules, ascending; empty takes the weekday from `dueDate`. */
	readonly weekdays: number[];
	/** Month rules; null takes the day from `dueDate`. */
	readonly monthDay: MonthDay | null;
	/** Year rules; null takes the date from `dueDate`. */
	readonly yearDate: YearDate | null;
	readonly until: LocalDate | null;
	readonly whenDone: boolean;

	private constructor(fields: Required<RepeatRuleFields>) {
		this.frequency = fields.frequency;
		this.interval = fields.interval;
		this.weekdays = fields.frequency === "week" ? [...new Set(fields.weekdays)].sort((a, b) => a - b) : [];
		this.monthDay = fields.frequency === "month" ? fields.monthDay : null;
		this.yearDate = fields.frequency === "year" ? fields.yearDate : null;
		this.until = fields.until;
		this.whenDone = fields.whenDone;
	}

	/** Null when a value is out of range. Fields that don't belong to the frequency are dropped. */
	static create(fields: RepeatRuleFields): RepeatRule | null {
		const all = { interval: 1, weekdays: [], monthDay: null, yearDate: null, until: null, whenDone: false, ...fields };
		if (!inRange(all.interval, 1, 999) || (all.frequency === "weekday" && all.interval !== 1)) return null;
		if (!all.weekdays.every((weekday) => inRange(weekday, 1, 7))) return null;
		const monthDay = all.monthDay;
		if (monthDay?.case === "day" && !inRange(monthDay.day, 1, 31)) return null;
		if (monthDay?.case === "nth" && !(inRange(monthDay.n, 1, 5) && inRange(monthDay.weekday, 1, 7))) return null;
		if (monthDay?.case === "lastWeekday" && !inRange(monthDay.weekday, 1, 7)) return null;
		const yearDate = all.yearDate;
		if (yearDate && !(inRange(yearDate.month, 1, 12) && inRange(yearDate.day, 1, daysIn(yearDate.month, 2000)))) return null;
		return new RepeatRule(all);
	}

	/** Reads a phrase; null when it isn't a rule. */
	static parse(text: string): RepeatRule | null {
		const tokens = words(text);
		if (tokens.shift() !== "every") return null;
		let unit = tokens.shift();
		if (unit === undefined) return null;
		let interval = 1;
		let number: string | null = null;
		if (/^[+-]?[0-9]+$/.test(unit)) {
			const next = tokens.shift();
			if (next === undefined) return null;
			interval = Number(unit);
			number = unit;
			unit = next;
		}
		let weekdays: number[] = [];
		let monthDay: MonthDay | null = null;
		let yearDate: YearDate | null = null;
		let frequency = frequencies.get(unit);
		if (frequency === undefined) {
			// A day or date alone: `every mon, thu`, `every 15th`, `every 2nd tue`, `every oct 26`, `every 26 oct`.
			const clause = [unit];
			while (tokens[0] !== undefined && !["until", "when"].includes(tokens[0])) clause.push(tokens.shift() as string);
			const days = clause.map(weekday);
			if (number !== null) {
				yearDate = readYearDate([number, ...clause]);
				if (yearDate === null) return null;
				interval = 1;
				frequency = "year";
			} else if (days.every((day) => day !== null)) {
				frequency = "week";
				weekdays = days as number[];
			} else if ((monthDay = readMonthDay(["the", ...clause])) !== null) {
				frequency = "month";
			} else if ((yearDate = readYearDate(clause)) !== null) {
				frequency = "year";
			} else {
				return null;
			}
		}
		let until: LocalDate | null = null;
		let whenDone = false;

		if (tokens[0] === "on") {
			tokens.shift();
			const clause: string[] = [];
			while (tokens[0] !== undefined && !["until", "when"].includes(tokens[0])) clause.push(tokens.shift() as string);
			if (frequency === "week") {
				if (clause.length === 0) return null;
				for (const name of clause) {
					const found = weekday(name);
					if (found === null) return null;
					weekdays.push(found);
				}
			} else if (frequency === "month") {
				monthDay = readMonthDay(clause);
				if (monthDay === null) return null;
			} else if (frequency === "year") {
				yearDate = readYearDate(clause);
				if (yearDate === null) return null;
			} else {
				return null;
			}
		}

		let sawUntil = false;
		let sawWhenDone = false;
		for (let token = tokens.shift(); token !== undefined; token = tokens.shift()) {
			if (token === "until" && !sawUntil) {
				const date = LocalDate.parse(tokens.shift() ?? "");
				if (date === null) return null;
				until = date;
				sawUntil = true;
			} else if (token === "when" && !sawWhenDone) {
				if (tokens.shift() !== "done") return null;
				whenDone = true;
				sawWhenDone = true;
			} else {
				return null;
			}
		}
		return RepeatRule.create({ frequency, interval, weekdays, monthDay, yearDate, until, whenDone });
	}

	/** The canonical form: `until` before `when done`, three-letter days and months, `1st` to `5th`. */
	get phrase(): string {
		return this.words("every", (weekday) => capitalized(dayNames[weekday - 1] as string), (month) => capitalized(monthNames[month - 1] as string), (names) => names.join(", "), (date) => date.toString());
	}

	/** The rule with a month or year rule's day taken from `date` when it names none, as Ta Da writes it. */
	anchored(date: LocalDate): RepeatRule {
		if (this.frequency === "month" && this.monthDay === null) return this.changing({ monthDay: { case: "day", day: date.day } });
		if (this.frequency === "year" && this.yearDate === null) return this.changing({ yearDate: { month: date.month, day: date.day } });
		return this;
	}

	/** The rule ending on `until`, or never for null. */
	ending(until: LocalDate | null): RepeatRule {
		return this.changing({ until });
	}

	/** The rule counting from completion, or on its schedule. */
	withWhenDone(whenDone: boolean): RepeatRule {
		return this.changing({ whenDone });
	}

	/** The rule spelled out, with `format` writing the end date: "Every week on Monday", "Every month on the 2nd Tuesday until Sun 20 Dec when done". */
	description(format: (date: LocalDate) => string): string {
		return this.words(
			"Every",
			(weekday) => capitalized(fullDayNames[weekday - 1] as string),
			(month) => capitalized(fullMonthNames[month - 1] as string),
			(names) => (names.length === 1 ? (names[0] as string) : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`),
			format,
		);
	}

	/** A short label for a chip: "Weekly", "Every 2 weeks when done". */
	get frequencyLabel(): string {
		const n = this.interval;
		const label = {
			weekday: "Weekdays",
			day: n === 1 ? "Daily" : `Every ${n} days`,
			week: n === 1 ? "Weekly" : `Every ${n} weeks`,
			month: n === 1 ? "Monthly" : `Every ${n} months`,
			year: n === 1 ? "Yearly" : `Every ${n} years`,
		}[this.frequency];
		return this.whenDone ? `${label} when done` : label;
	}

	private changing(changes: Partial<RepeatRuleFields>): RepeatRule {
		return new RepeatRule({ ...this, ...changes });
	}

	/** The rule spelled out, its names, day list and end date written as given. */
	private words(every: string, dayName: (weekday: number) => string, monthName: (month: number) => string, list: (names: string[]) => string, format: (date: LocalDate) => string): string {
		const unit = this.frequency;
		let words = unit === "weekday" ? `${every} weekday` : this.interval === 1 ? `${every} ${unit}` : `${every} ${this.interval} ${unit}s`;
		if (this.frequency === "week" && this.weekdays.length > 0) {
			words += ` on ${list([2, 3, 4, 5, 6, 7, 1].filter((weekday) => this.weekdays.includes(weekday)).map(dayName))}`;
		} else if (this.frequency === "month" && this.monthDay) {
			const day = this.monthDay;
			if (day.case === "day") words += ` on the ${ordinal(day.day)}`;
			else if (day.case === "lastDay") words += " on the last day";
			else if (day.case === "nth") words += ` on the ${ordinal(day.n)} ${dayName(day.weekday)}`;
			else words += ` on the last ${dayName(day.weekday)}`;
		} else if (this.frequency === "year" && this.yearDate) {
			words += ` on ${monthName(this.yearDate.month)} ${this.yearDate.day}`;
		}
		if (this.until) words += ` until ${format(this.until)}`;
		if (this.whenDone) words += " when done";
		return words;
	}
}

const frequencies = new Map<string, Frequency>([
	["day", "day"],
	["days", "day"],
	["weekday", "weekday"],
	["week", "week"],
	["weeks", "week"],
	["month", "month"],
	["months", "month"],
	["year", "year"],
	["years", "year"],
]);

/** The lowercased words, without commas. */
function words(text: string): string[] {
	const list: string[] = [];
	let word = "";
	for (const character of characters(lowercased(text).replaceAll(",", " "))) {
		if (isWhitespaceCharacter(character)) {
			if (word !== "") list.push(word);
			word = "";
		} else {
			word += character;
		}
	}
	if (word !== "") list.push(word);
	return list;
}

function weekday(name: string): number | null {
	const index = dayNames.includes(name) ? dayNames.indexOf(name) : fullDayNames.indexOf(name);
	return index < 0 ? null : index + 1;
}

/** `the 15th`, `the last day`, `the 2nd tuesday`, `the last friday`. */
function readMonthDay(clause: string[]): MonthDay | null {
	if (clause[0] !== "the") return null;
	const [first, second, ...extra] = clause.slice(1);
	if (first === undefined || extra.length > 0) return null;
	if (second === undefined) {
		const day = readNumber(first);
		return day !== null && day >= 1 && day <= 31 ? { case: "day", day } : null;
	}
	if (first === "last") {
		if (second === "day") return { case: "lastDay" };
		const found = weekday(second);
		return found === null ? null : { case: "lastWeekday", weekday: found };
	}
	const n = readNumber(first);
	const found = weekday(second);
	return n !== null && n >= 1 && n <= 5 && found !== null ? { case: "nth", n, weekday: found } : null;
}

/** `oct 26` or `26 oct`. */
function readYearDate(clause: string[]): YearDate | null {
	const [first, second] = clause;
	if (clause.length !== 2 || first === undefined || second === undefined) return null;
	const [name, dayText] = readNumber(first) === null ? [first, second] : [second, first];
	const index = monthNames.includes(name) ? monthNames.indexOf(name) : fullMonthNames.indexOf(name);
	const day = readNumber(dayText);
	if (index < 0 || day === null || day < 1 || day > (daysIn(index + 1, 2000))) return null;
	return { month: index + 1, day };
}

/** `15` or `15th`. */
function readNumber(token: string): number | null {
	const match = /^([0-9]+)(st|nd|rd|th)?$/.exec(token);
	return match ? Number(match[1]) : null;
}

const capitalized = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

function ordinal(n: number): string {
	if (n >= 11 && n <= 13) return `${n}th`;
	return `${n}${["th", "st", "nd", "rd"][n % 10 < 4 ? n % 10 : 0]}`;
}
