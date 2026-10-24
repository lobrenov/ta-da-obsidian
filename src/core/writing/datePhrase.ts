import { LocalDate } from "../model/localDate";
import { characters, hasPrefixCharacters, isWhitespaceCharacter, lowercased } from "./characters";

/** Which a numeric date such as 5/12 gives first: the day (5 December) or the month (May 12). */
export type DayOrder = "dayMonth" | "monthDay";

/*
 * Reads a typed date such as "fri", "3d", "dec 25" or "25/12" as a day. A phrase without a year never gives a day
 * before today; a weekday is its soonest coming day, today included, with or without "next". Times ("3pm", "at 15:00",
 * "at 3", and "fri 3" and "15:" on the way) are ignored. A word's start counts as the word, so a phrase matches while
 * it's typed: "t" is today, "tu" Tuesday, "n" next week.
 */
export function parseDatePhrase(text: string, today: LocalDate, order: DayOrder, firstWeekday: number): LocalDate | null {
	const list = words(text);
	if (list.length === 0) return null;
	const phrase = list.join(" ");
	return (
		named(phrase, today, firstWeekday) ??
		relative(phrase, today) ??
		dayNumber(phrase, today) ??
		numeric(phrase, today, order) ??
		dayAndMonthName(phrase, today) ??
		namedWithHour(list, today, firstWeekday)
	);
}

const hourPattern = /^[0-9]{1,2}$/;

/** "fri 3", while "fri 3pm" is typed: a named day and an hour. */
function namedWithHour(list: string[], today: LocalDate, firstWeekday: number): LocalDate | null {
	if (list.length < 2 || !hourPattern.test(list[list.length - 1] as string)) return null;
	return named(list.slice(0, -1).join(" "), today, firstWeekday);
}

/**
 * The lowercased words, without commas, times, "at" and the hour after it, and "the", and without separators after the
 * last one.
 */
function words(text: string): string[] {
	const list: string[] = [];
	let afterAt = false;
	let word = "";
	const pieces: string[] = [];
	for (const character of characters(lowercased(text).replaceAll(",", " "))) {
		if (isWhitespaceCharacter(character)) {
			if (word !== "") pieces.push(word);
			word = "";
		} else {
			word += character;
		}
	}
	if (word !== "") pieces.push(word);
	for (const piece of pieces) {
		const wasAfterAt = afterAt;
		afterAt = piece === "at";
		if (wasAfterAt && hourPattern.test(piece)) continue;
		if (piece === "at" || piece === "the" || isTime(piece)) continue;
		// "fri 3 pm" drops the 3; "dec 3 pm" keeps it as the day.
		if (piece === "am" || piece === "pm") {
			const last = list[list.length - 1];
			if (last !== undefined && hourPattern.test(last) && (list.length < 2 || month(list[list.length - 2] as string) === null)) {
				list.pop();
			}
			continue;
		}
		list.push(piece);
	}
	const last = list.pop();
	if (last !== undefined) {
		const parts = characters(last);
		while (parts.length > 0 && ["/", ".", "-"].includes(parts[parts.length - 1] as string)) parts.pop();
		if (parts.length > 0) list.push(parts.join(""));
	}
	return list;
}

function isTime(word: string): boolean {
	return /^[0-9]{1,2}(:[0-9]{0,2})?(am|pm|a|p)$/.test(word) || /^[0-9]{1,2}:[0-9]{0,2}$/.test(word);
}

// Words

type Named =
	| { kind: "today" | "tomorrow" | "weekend" | "nextWeek" | "nextMonth" | "endOfMonth" }
	| { kind: "weekday"; number: number };

const weekday = (number: number): Named => ({ kind: "weekday", number });

/** Weekdays from Monday, with `Calendar`'s numbers (1 = Sunday). */
const weekdays: readonly (readonly [string, number])[] = [
	["monday", 2],
	["tuesday", 3],
	["wednesday", 4],
	["thursday", 5],
	["friday", 6],
	["saturday", 7],
	["sunday", 1],
];

const exact = new Map<string, Named>([
	["tod", { kind: "today" }],
	["tmr", { kind: "tomorrow" }],
	["tom", { kind: "tomorrow" }],
	["wknd", { kind: "weekend" }],
	["eom", { kind: "endOfMonth" }],
	["next wk", { kind: "nextWeek" }],
	["mon", weekday(2)],
	["tue", weekday(3)],
	["tues", weekday(3)],
	["wed", weekday(4)],
	["thu", weekday(5)],
	["thur", weekday(5)],
	["thurs", weekday(5)],
	["fri", weekday(6)],
	["sat", weekday(7)],
	["sun", weekday(1)],
]);

/** Whole phrases in the order a typed start picks them. */
const phrases: readonly { phrase: string; named: Named }[] = [
	{ phrase: "today", named: { kind: "today" } },
	{ phrase: "tomorrow", named: { kind: "tomorrow" } },
	...weekdays.map(([phrase, number]) => ({ phrase, named: weekday(number) })),
	{ phrase: "weekend", named: { kind: "weekend" } },
	{ phrase: "next week", named: { kind: "nextWeek" } },
	{ phrase: "next month", named: { kind: "nextMonth" } },
	{ phrase: "end of month", named: { kind: "endOfMonth" } },
];

function named(phrase: string, today: LocalDate, firstWeekday: number): LocalDate | null {
	const found = namedPhrase(phrase);
	return found === null ? null : dateOf(found, today, firstWeekday);
}

function namedPhrase(phrase: string): Named | null {
	const whole = exact.get(phrase) ?? phrases.find((entry) => entry.phrase === phrase)?.named;
	if (whole) return whole;
	// "on fri", "this weekend", "next tue": the lead word changes nothing.
	let rest: string | null = null;
	for (const lead of ["on ", "this ", "next "]) {
		if (hasPrefixCharacters(phrase, lead)) rest = phrase.slice(lead.length);
	}
	if (rest !== null) {
		const lead = exact.get(rest) ?? phrases.find((entry) => entry.phrase === rest)?.named;
		if (lead) return lead;
	}
	const started = phrases.find((entry) => entry.phrase.startsWith(phrase))?.named;
	if (started) return started;
	if (rest !== null && rest !== "") return phrases.find((entry) => entry.phrase.startsWith(rest as string))?.named ?? null;
	return null;
}

function dateOf(found: Named, today: LocalDate, firstWeekday: number): LocalDate {
	switch (found.kind) {
		case "today":
			return today;
		case "tomorrow":
			return today.addingDays(1);
		case "weekday":
			return today.addingDays((found.number - today.weekday + 7) % 7);
		case "weekend":
			return today.thisWeekend;
		case "nextWeek":
			return today.nextWeek(firstWeekday);
		case "nextMonth":
			return today.addingMonths(1);
		case "endOfMonth":
			return today.addingMonths(1).addingDays(-1);
	}
}

// Numbers

/** "3d", "2w", "1m", "1y", "+3", "in 3 days": today plus that many days, weeks, months or years. */
function relative(phrase: string, today: LocalDate): LocalDate | null {
	const match = /^(in )?(\+)?([0-9]{1,4}) ?([a-z]*)$/.exec(phrase);
	if (!match) return null;
	const count = Number(match[3]);
	const unit = match[4] as string;
	if (unit === "") return match[1] !== undefined || match[2] !== undefined ? today.addingDays(count) : null;
	if ("days".startsWith(unit)) return today.addingDays(count);
	if ("weeks".startsWith(unit) || unit === "wk" || unit === "wks") return today.addingDays(count * 7);
	if ("months".startsWith(unit) || unit === "mos") return today.addingMonthsKeepingDay(count);
	if ("years".startsWith(unit) || unit === "yr" || unit === "yrs") return today.addingMonthsKeepingDay(count * 12);
	return null;
}

/** "25", "25th": the soonest coming 25th. */
function dayNumber(phrase: string, today: LocalDate): LocalDate | null {
	const match = /^([0-9]{1,2})(st|nd|rd|th)?$/.exec(phrase);
	if (!match) return null;
	const day = Number(match[1]);
	for (let ahead = 0; ahead < 12; ahead++) {
		const first = today.addingMonths(ahead);
		const date = LocalDate.of(first.year, first.month, day);
		if (date && date.compare(today) >= 0) return date;
	}
	return null;
}

/** "25/12", "25.12", "25-12", "25/12/27", "2027-12-25": by `order`, or year first with four digits. */
function numeric(phrase: string, today: LocalDate, order: DayOrder): LocalDate | null {
	const match = /^([0-9]{1,4})[/.-]([0-9]{1,2})(?:[/.-]([0-9]{1,4}))?$/.exec(phrase);
	if (!match) return null;
	const first = Number(match[1]);
	const second = Number(match[2]);
	if ((match[1] as string).length === 4) {
		const third = match[3];
		if (third === undefined || third.length > 2) return null;
		return LocalDate.of(first, second, Number(third));
	}
	const [day, month] = order === "dayMonth" ? [first, second] : [second, first];
	return dateFor(day, month, match[3], today);
}

/** "25 dec", "dec 25", "25th of december 2027": a month's start that's no other month's start. */
function dayAndMonthName(phrase: string, today: LocalDate): LocalDate | null {
	const dayFirst = /^([0-9]{1,2})(?:st|nd|rd|th)? ?(?:of )?([a-z]+)\.?(?: ([0-9]{2}|[0-9]{4}))?$/.exec(phrase);
	if (dayFirst) {
		const found = month(dayFirst[2] as string);
		if (found !== null) return dateFor(Number(dayFirst[1]), found, dayFirst[3], today);
	}
	const monthFirst = /^([a-z]+)\.? ?([0-9]{1,2})(?:st|nd|rd|th)?(?: ([0-9]{2}|[0-9]{4}))?$/.exec(phrase);
	if (monthFirst) {
		const found = month(monthFirst[1] as string);
		if (found !== null) return dateFor(Number(monthFirst[2]), found, monthFirst[3], today);
	}
	return null;
}

const months = [
	"january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
];

/** The month a name starts, when it starts only one. */
function month(name: string): number | null {
	const matches = months.flatMap((full, index) => (full.startsWith(name) ? [index] : []));
	return matches.length === 1 ? (matches[0] as number) + 1 : null;
}

/**
 * The day in `year`, or with no year the soonest coming one, today included. Two digits are 20xx, and not before today,
 * so typing a four-digit year doesn't pass through 20.
 */
function dateFor(day: number, monthNumber: number, year: string | undefined, today: LocalDate): LocalDate | null {
	if (year !== undefined) {
		const number = Number(year);
		if (year.length === 2) {
			const date = LocalDate.of(2000 + number, monthNumber, day);
			return date && date.compare(today) >= 0 ? date : null;
		}
		return year.length === 4 ? LocalDate.of(number, monthNumber, day) : null;
	}
	for (let candidate = today.year; candidate <= today.year + 8; candidate++) {
		const date = LocalDate.of(candidate, monthNumber, day);
		if (date && date.compare(today) >= 0) return date;
	}
	return null;
}
