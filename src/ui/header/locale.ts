import type { DayOrder } from "../../core/writing/datePhrase";

/** Whether the locale writes the day before the month in a short numeric date. */
export function dayOrderOf(locale?: string): DayOrder {
	try {
		const parts = new Intl.DateTimeFormat(locale, { day: "numeric", month: "numeric" }).formatToParts(new Date(2000, 11, 25));
		const types = parts.map((part) => part.type);
		return types.indexOf("day") < types.indexOf("month") ? "dayMonth" : "monthDay";
	} catch {
		return "dayMonth";
	}
}

/** The locale's first weekday as Calendar numbers (1 = Sunday); Monday where the runtime can't say. */
export function firstWeekdayOf(locale?: string): number {
	try {
		const info = new Intl.Locale(locale ?? navigator.language) as unknown as {
			getWeekInfo?: () => { firstDay: number };
			weekInfo?: { firstDay: number };
		};
		const first = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
		if (first === undefined) return 2;
		return first === 7 ? 1 : first + 1;
	} catch {
		return 2;
	}
}
