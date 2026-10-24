import { LocalDate } from "../../core/model/localDate";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** `Fri`. */
export function shortWeekday(date: LocalDate): string {
	return (weekdays[date.weekday - 1] ?? "").slice(0, 3);
}

/** `Oct`. */
export function shortMonth(date: LocalDate): string {
	return (months[date.month - 1] ?? "").slice(0, 3);
}

/** `Fri 2 Oct`. */
export function weekdayDayMonth(date: LocalDate): string {
	return `${shortWeekday(date)} ${date.day} ${shortMonth(date)}`;
}

/** `today`, or `Tue 6 Oct` (with the year when it isn't `today`'s). */
export function relativeLabel(date: LocalDate, today: LocalDate): string {
	if (date.equals(today)) return "today";
	return date.year === today.year ? weekdayDayMonth(date) : `${weekdayDayMonth(date)} ${date.year}`;
}

/** The text with its first letter in capitals. */
export function capitalised(text: string): string {
	return text.slice(0, 1).toUpperCase() + text.slice(1);
}

/** `1 Oct`, or `1 Oct 2025` in another year. */
export function dayMonth(date: LocalDate, today: LocalDate): string {
	const text = `${date.day} ${shortMonth(date)}`;
	return date.year === today.year ? text : `${text} ${date.year}`;
}

/** `Thursday 1 Oct`. */
export function wideWeekdayDayMonth(date: LocalDate): string {
	return `${weekdays[date.weekday - 1] ?? ""} ${date.day} ${shortMonth(date)}`;
}
