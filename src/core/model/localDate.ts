const dayMs = 86_400_000;

/** A calendar day with no time or time zone, read from and written as `YYYY-MM-DD`. */
export class LocalDate {
	private constructor(
		readonly year: number,
		readonly month: number,
		readonly day: number,
	) {}

	/** Returns null for days that don't exist, such as February 30. */
	static of(year: number, month: number, day: number): LocalDate | null {
		if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
		if (year < 1 || year > 9999 || month < 1 || month > 12) return null;
		if (day < 1 || day > daysIn(month, year)) return null;
		return new LocalDate(year, month, day);
	}

	/** Parses exactly `YYYY-MM-DD`. Times, other separators and impossible days are null. */
	static parse(text: string): LocalDate | null {
		const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(text);
		if (!match) return null;
		return LocalDate.of(Number(match[1]), Number(match[2]), Number(match[3]));
	}

	toString(): string {
		return `${pad(this.year, 4)}-${pad(this.month, 2)}-${pad(this.day, 2)}`;
	}

	/** Negative when this day is earlier than `other`, zero when equal. */
	compare(other: LocalDate): number {
		return this.year - other.year || this.month - other.month || this.day - other.day;
	}

	equals(other: LocalDate): boolean {
		return this.compare(other) === 0;
	}

	addingDays(days: number): LocalDate {
		const date = new Date(this.midnightUTC() + days * dayMs);
		return new LocalDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
	}

	/** `days` away, or null when that leaves years 1 to 9999. */
	checkedAddingDays(days: number): LocalDate | null {
		const date = new Date(this.midnightUTC() + days * dayMs);
		return LocalDate.of(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
	}

	/** The first day of this day's month. */
	get startOfMonth(): LocalDate {
		return new LocalDate(this.year, this.month, 1);
	}

	/** The first day of the month `months` away. */
	addingMonths(months: number): LocalDate {
		const index = this.year * 12 + (this.month - 1) + months;
		const first = LocalDate.of(Math.trunc(index / 12), (index % 12) + 1, 1);
		if (!first) throw new RangeError(`Month out of range: ${months} from ${this.toString()}`);
		return first;
	}

	/** The same day `months` away, or that month's last day when it's shorter; null outside years 1 to 9999. */
	addingMonthsKeepingDay(months: number): LocalDate | null {
		const index = this.year * 12 + (this.month - 1) + months;
		for (let day = this.day; day >= Math.max(this.day - 3, 1); day--) {
			const date = LocalDate.of(Math.trunc(index / 12), (index % 12) + 1, day);
			if (date) return date;
		}
		return null;
	}

	/** The coming Saturday, or this day on a Saturday or Sunday. */
	get thisWeekend(): LocalDate {
		return this.weekday === 1 ? this : this.addingDays(7 - this.weekday);
	}

	/** The first day of the week after this day's, from `firstWeekday` (1 = Sunday). */
	nextWeek(firstWeekday: number): LocalDate {
		return this.addingDays(7 - ((this.weekday - firstWeekday + 7) % 7));
	}

	/** Whole days from this day to `other`; negative when `other` is earlier. */
	daysTo(other: LocalDate): number {
		return Math.round((other.midnightUTC() - this.midnightUTC()) / dayMs);
	}

	/** 1 = Sunday ... 7 = Saturday. */
	get weekday(): number {
		return new Date(this.midnightUTC()).getUTCDay() + 1;
	}

	/** The ISO week this day is in. Late December can be week 1 of the next year, and early January week 52 or 53. */
	get isoWeek(): ISOWeek {
		const thursday = this.mondayOfWeek().addingDays(3);
		const dayOfYear = new LocalDate(thursday.year, 1, 1).daysTo(thursday);
		return new ISOWeek(thursday.year, Math.floor(dayOfYear / 7) + 1);
	}

	/** The ISO weeks that have a day in this day's month, in order. */
	get isoWeeksOfMonth(): ISOWeek[] {
		const last = this.addingMonths(1).addingDays(-1);
		const first = this.startOfMonth.isoWeek;
		const count = first.firstDay.daysTo(last.mondayOfWeek()) / 7;
		return Array.from({ length: count + 1 }, (_, at) => first.addingWeeks(at));
	}

	mondayOfWeek(): LocalDate {
		return this.addingDays(-((this.weekday + 5) % 7));
	}

	private midnightUTC(): number {
		const date = new Date(0);
		date.setUTCFullYear(this.year, this.month - 1, this.day);
		return date.getTime();
	}
}

/** An ISO 8601 week: it starts on Monday, and belongs to the year that holds its Thursday. */
export class ISOWeek {
	constructor(
		readonly year: number,
		/** 1 to 52, or 53 in a long year. */
		readonly week: number,
	) {}

	/** The week's Monday. */
	get firstDay(): LocalDate {
		const fourth = LocalDate.of(this.year, 1, 4);
		if (!fourth) throw new RangeError(`Year out of range: ${this.year}`);
		return fourth.mondayOfWeek().addingDays((this.week - 1) * 7);
	}

	/** The week `weeks` away (earlier when negative). */
	addingWeeks(weeks: number): ISOWeek {
		return this.firstDay.addingDays(weeks * 7).isoWeek;
	}

	equals(other: ISOWeek): boolean {
		return this.year === other.year && this.week === other.week;
	}

	/** Monday to Sunday. */
	get days(): LocalDate[] {
		const first = this.firstDay;
		return [0, 1, 2, 3, 4, 5, 6].map((offset) => first.addingDays(offset));
	}

	/** `GGGG-[W]WW`, for example `2026-W40`. */
	toString(): string {
		return `${pad(this.year, 4)}-W${pad(this.week, 2)}`;
	}
}

export function daysIn(month: number, year: number): number {
	if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
	return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export const later = (a: LocalDate, b: LocalDate): LocalDate => (a.compare(b) >= 0 ? a : b);

function pad(value: number, width: number): string {
	return String(value).padStart(width, "0");
}
