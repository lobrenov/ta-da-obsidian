import { dayMarks } from "../../core/index/queries";
import type { VaultIndex } from "../../core/index/vaultIndex";
import { ISOWeek, LocalDate } from "../../core/model/localDate";
import { monthTitle } from "../dates";

/** The Agenda's period: a day or an ISO week. */
export type AgendaSelection = { kind: "day"; date: LocalDate } | { kind: "week"; week: ISOWeek };

/** The Agenda's selection, and whether its strip shows the month or just the selected week. */
export interface AgendaState {
	selection: AgendaSelection;
	monthOpen: boolean;
}

/** The Agenda as it opens: today, with the week showing. */
export function agendaOn(today: LocalDate): AgendaState {
	return { selection: { kind: "day", date: today }, monthOpen: false };
}

export function sameSelection(a: AgendaSelection, b: AgendaSelection): boolean {
	if (a.kind === "day") return b.kind === "day" && a.date.equals(b.date);
	return b.kind === "week" && a.week.equals(b.week);
}

/** The day the strip's month is the month of: the day, or the middle of the week. */
export function anchorOf(selection: AgendaSelection): LocalDate {
	return selection.kind === "day" ? selection.date : selection.week.firstDay.addingDays(3);
}

/**
 * A day, or a week when a week is selected, moved by `offset`; with `byMonth`, by whole months instead. A day keeps
 * its day of the month (the last day of a shorter month); a week moves to the one holding its Thursday, moved by the
 * same months.
 */
export function stepSelection(selection: AgendaSelection, offset: number, byMonth = false): AgendaSelection {
	if (selection.kind === "day") {
		const { date } = selection;
		return { kind: "day", date: byMonth ? (date.addingMonthsKeepingDay(offset) ?? date) : date.addingDays(offset) };
	}
	const { week } = selection;
	if (!byMonth) return { kind: "week", week: week.addingWeeks(offset) };
	const thursday = week.firstDay.addingDays(3);
	return { kind: "week", week: (thursday.addingMonthsKeepingDay(offset) ?? week.firstDay).isoWeek };
}

/** A selection on the old today moves to the new one when the day changes. */
export function rolledOver(selection: AgendaSelection, previous: LocalDate, today: LocalDate): AgendaSelection {
	return selection.kind === "day" && selection.date.equals(previous) ? { kind: "day", date: today } : selection;
}

/** The week a selection is in. */
export function weekOf(selection: AgendaSelection): ISOWeek {
	return selection.kind === "day" ? selection.date.isoWeek : selection.week;
}

/** The date whose month the strip's title names: the shown month, or with the week showing, the month of that week's Monday. */
export function titleDate(selection: AgendaSelection, monthOpen: boolean): LocalDate {
	return monthOpen ? anchorOf(selection) : weekOf(selection).firstDay;
}

export interface DayCell {
	date: LocalDate;
	/** The day of the month. */
	label: string;
	selected: boolean;
	today: boolean;
	/** Outside the strip's month, or before today. */
	faded: boolean;
	/** An open task is due or at its deadline that day. */
	hasOpenTasks: boolean;
	/** For the screen reader: `Today, Fri 2 Oct, tasks due`. */
	aria: string;
}

export interface WeekCell {
	week: ISOWeek;
	label: string;
	selected: boolean;
}

export interface StripRow {
	week: WeekCell;
	days: DayCell[];
}

/** The Agenda's header: Week | Month, ‹ Today ›, the month's title, and the weeks as rows of days. */
export interface StripModel {
	monthOpen: boolean;
	/** `October 2026`. */
	title: string;
	/** What ‹ and › step: a day, a week when a week is selected, or a month while the month is open. */
	unit: "day" | "week" | "month";
	/** The weekday initials over the days, Monday first. */
	initials: string[];
	rows: StripRow[];
}

const initials = ["M", "T", "W", "T", "F", "S", "S"];
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The strip: the selected week's row, or every week of the month's rows when the month is open. */
export function buildStrip(index: VaultIndex, state: AgendaState, today: LocalDate): StripModel {
	const { selection, monthOpen } = state;
	const anchor = anchorOf(selection);
	const weeks = monthOpen ? anchor.isoWeeksOfMonth : [weekOf(selection)];
	const first = weeks[0]?.firstDay ?? anchor;
	const last = weeks[weeks.length - 1]?.days[6] ?? anchor;
	const marks = dayMarks(index, first, last);
	const rows = weeks.map((week): StripRow => ({
		week: { week, label: String(week.week), selected: selection.kind === "week" && selection.week.equals(week) },
		days: week.days.map((date): DayCell => {
			const isToday = date.equals(today);
			const hasOpenTasks = marks.get(date.toString())?.hasOpenTasks === true;
			return {
				date,
				label: String(date.day),
				selected: selection.kind === "day" && selection.date.equals(date),
				today: isToday,
				faded: date.month !== anchor.month || date.compare(today) < 0,
				hasOpenTasks,
				aria: `${isToday ? "Today, " : ""}${weekdayNames[date.weekday - 1]} ${date.day}${hasOpenTasks ? ", tasks due" : ""}`,
			};
		}),
	}));
	return { monthOpen, title: monthTitle(titleDate(selection, monthOpen)), unit: monthOpen ? "month" : selection.kind === "week" ? "week" : "day", initials, rows };
}

/** The saved form of an Agenda state. */
export function writeAgenda(state: AgendaState): Record<string, unknown> {
	const { selection } = state;
	return {
		selection: selection.kind === "day" ? { kind: "day", date: selection.date.toString() } : { kind: "week", year: selection.week.year, week: selection.week.week },
		monthOpen: state.monthOpen,
	};
}

/** An Agenda state read back from saved view state; today's when it isn't one. */
export function readAgenda(value: unknown, today: LocalDate): AgendaState {
	const saved = typeof value === "object" && value !== null ? (value as { selection?: unknown; monthOpen?: unknown }) : {};
	const state = agendaOn(today);
	const raw = typeof saved.selection === "object" && saved.selection !== null ? (saved.selection as { kind?: unknown; date?: unknown; year?: unknown; week?: unknown }) : {};
	if (raw.kind === "day" && typeof raw.date === "string") {
		const date = LocalDate.parse(raw.date);
		if (date) state.selection = { kind: "day", date };
	} else if (raw.kind === "week" && typeof raw.year === "number" && typeof raw.week === "number") {
		const fourth = LocalDate.of(raw.year, 12, 28);
		if (Number.isInteger(raw.year) && Number.isInteger(raw.week) && fourth && raw.week >= 1 && raw.week <= fourth.isoWeek.week) {
			state.selection = { kind: "week", week: new ISOWeek(raw.year, raw.week) };
		}
	}
	if (typeof saved.monthOpen === "boolean") state.monthOpen = saved.monthOpen;
	return state;
}
