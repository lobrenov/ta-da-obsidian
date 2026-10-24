import { LocalDate } from "../core/model/localDate";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** Today's date on the device's calendar. */
export function localToday(now: Date = new Date()): LocalDate {
	return LocalDate.of(now.getFullYear(), now.getMonth() + 1, now.getDate()) as LocalDate;
}

/** `October 2026`; with `today`, the year is left out when it's `today`'s: `October`. */
export function monthTitle(date: LocalDate, today?: LocalDate): string {
	const name = monthNames[date.month - 1] ?? "";
	return today !== undefined && date.year === today.year ? name : `${name} ${date.year}`;
}
