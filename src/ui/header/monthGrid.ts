import type { LocalDate } from "../../core/model/localDate";

/** The weeks of a month, as whole weeks from `firstWeekday` (1 = Sunday), with the neighbouring months' days around it. */
export function monthGrid(month: LocalDate, firstWeekday: number): LocalDate[][] {
	const first = month.startOfMonth;
	const last = first.addingMonths(1).addingDays(-1);
	let day = first.addingDays(-((first.weekday - firstWeekday + 7) % 7));
	const weeks: LocalDate[][] = [];
	while (day.compare(last) <= 0) {
		const week: LocalDate[] = [];
		for (let index = 0; index < 7; index++) {
			week.push(day);
			day = day.addingDays(1);
		}
		weeks.push(week);
	}
	return weeks;
}

/** Calendar's weekday numbers (1 = Sunday) in the order a week shows them. */
export function weekdayOrder(firstWeekday: number): number[] {
	return [0, 1, 2, 3, 4, 5, 6].map((offset) => ((firstWeekday - 1 + offset) % 7) + 1);
}

const letters = ["S", "M", "T", "W", "T", "F", "S"] as const;

export function weekdayLetter(weekday: number): string {
	return letters[weekday - 1] ?? "";
}

export const monthNames = [
	"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
] as const;

export function monthTitle(month: LocalDate): string {
	return `${monthNames[month.month - 1]} ${month.year}`;
}
