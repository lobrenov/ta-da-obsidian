import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { ISOWeek, LocalDate } from "../src/core/model/localDate";
import { agendaOn, buildStrip, readAgenda, rolledOver, sameSelection, stepSelection, titleDate, writeAgenda, type AgendaSelection, type AgendaState } from "../src/ui/navigator/agenda";
import { loadFixtureIndex } from "./fixtureVault";
import { makeItem } from "./support";

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const today = date("2026-10-02");
const day = (text: string): AgendaSelection => ({ kind: "day", date: date(text) });
const week = (year: number, number: number): AgendaSelection => ({ kind: "week", week: new ISOWeek(year, number) });
const state = (selection: AgendaSelection, monthOpen = false): AgendaState => ({ selection, monthOpen });
const none = new VaultIndex();

describe("ISO weeks of a month", () => {
	it("lists every ISO week that has a day in the month", () => {
		const numbers = (text: string): number[] => date(text).isoWeeksOfMonth.map((entry) => entry.week);
		expect(numbers("2026-10-15")).toEqual([40, 41, 42, 43, 44]);
		expect(numbers("2026-11-01")).toEqual([44, 45, 46, 47, 48, 49]);
		expect(numbers("2026-12-31")).toEqual([49, 50, 51, 52, 53]);
		expect(numbers("2027-01-10")).toEqual([53, 1, 2, 3, 4]);
	});

	it("moves a week by whole weeks across a year's end", () => {
		const last = new ISOWeek(2026, 53);
		expect(last.addingWeeks(1)).toMatchObject({ year: 2027, week: 1 });
		expect(new ISOWeek(2027, 1).addingWeeks(-1)).toMatchObject({ year: 2026, week: 53 });
		expect(last.equals(new ISOWeek(2026, 53))).toBe(true);
	});
});

describe("the strip", () => {
	it("shows the selected day's week: Monday first, its ISO week number, and the month's title", () => {
		const strip = buildStrip(none, state(day("2026-10-02")), today);
		expect(strip.title).toBe("September 2026");
		expect(strip.initials).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
		expect(strip.unit).toBe("day");
		expect(strip.rows).toHaveLength(1);
		expect(strip.rows[0]?.week).toEqual({ week: new ISOWeek(2026, 40), label: "40", selected: false });
		expect(strip.rows[0]?.days.map((cell) => cell.label)).toEqual(["28", "29", "30", "1", "2", "3", "4"]);
	});

	it("marks the picked day and today, and fades days before today and outside the month", () => {
		const cells = buildStrip(none, state(day("2026-10-03")), today).rows[0]?.days ?? [];
		expect(cells.map((cell) => [cell.label, cell.selected, cell.today, cell.faded])).toEqual([
			["28", false, false, true],
			["29", false, false, true],
			["30", false, false, true],
			["1", false, false, true],
			["2", false, true, false],
			["3", true, false, false],
			["4", false, false, false],
		]);
		expect(cells[4]?.aria).toBe("Today, Fri 2");
	});

	it("shows a picked week as selected, with the month of its Thursday", () => {
		const strip = buildStrip(none, state(week(2026, 40)), today);
		expect(strip.rows[0]?.week.selected).toBe(true);
		expect(strip.rows[0]?.days.every((cell) => !cell.selected)).toBe(true);
		expect(strip.unit).toBe("week");
		expect(strip.title).toBe("September 2026");
	});

	it("shows every week of the month when it's open, each led by its week number", () => {
		const strip = buildStrip(none, state(day("2026-10-14"), true), today);
		expect(strip.title).toBe("October 2026");
		expect(strip.rows.map((row) => row.week.label)).toEqual(["40", "41", "42", "43", "44"]);
		expect(strip.rows.map((row) => row.days.filter((cell) => cell.selected).map((cell) => cell.label))).toEqual([[], [], ["14"], [], []]);
		expect(strip.rows[0]?.days.map((cell) => cell.faded)).toEqual([true, true, true, true, false, false, false]);
		expect(strip.rows[4]?.days.map((cell) => [cell.label, cell.faded])).toEqual([["26", false], ["27", false], ["28", false], ["29", false], ["30", false], ["31", false], ["1", true]]);
	});

	it("draws a dot under a day with an open task due or at its deadline, and none for a done one", () => {
		const index = new VaultIndex([
			makeItem("Ta Da/tasks/Open.md", "type: task\nstatus: Doing\ndueDate: 2026-10-03"),
			makeItem("Ta Da/tasks/Late.md", "type: task\nstatus: Not Started\ndeadline: 2026-10-04"),
			makeItem("Ta Da/tasks/Shut.md", "type: task\nstatus: Done\ndueDate: 2026-10-02\ncompletedDate: 2026-10-02"),
		]);
		const cells = buildStrip(index, state(day("2026-10-02")), today).rows[0]?.days ?? [];
		expect(cells.map((cell) => cell.hasOpenTasks)).toEqual([false, false, false, false, false, true, true]);
		expect(cells[5]?.aria).toBe("Sat 3, tasks due");
	});

	it("draws the same dots on DesignVault as the days have open tasks", () => {
		const cells = buildStrip(loadFixtureIndex("DesignVault"), state(day("2026-10-02")), today).rows[0]?.days ?? [];
		expect(cells.filter((cell) => cell.hasOpenTasks).map((cell) => cell.label)).toEqual(["2", "3"]);
	});

	it("names the year in the title of another year's month", () => {
		expect(buildStrip(none, state(day("2027-01-14"), true), today).title).toBe("January 2027");
		expect(titleDate(day("2026-10-14"), true).month).toBe(10);
		expect(titleDate(day("2026-10-02"), false).month).toBe(9);
	});
});

describe("stepping", () => {
	it("steps a day by days and a week by weeks, across month and year ends", () => {
		expect(stepSelection(day("2026-10-31"), 1)).toEqual(day("2026-11-01"));
		expect(stepSelection(day("2026-01-01"), -1)).toEqual(day("2025-12-31"));
		expect(stepSelection(week(2026, 53), 1)).toEqual(week(2027, 1));
		expect(stepSelection(week(2026, 40), -2)).toEqual(week(2026, 38));
	});

	it("steps a day by a month, keeping its day of the month, or the last day of a shorter month", () => {
		expect(stepSelection(day("2026-10-14"), 1, true)).toEqual(day("2026-11-14"));
		expect(stepSelection(day("2026-10-14"), -1, true)).toEqual(day("2026-09-14"));
		expect(stepSelection(day("2026-01-31"), 1, true)).toEqual(day("2026-02-28"));
		expect(stepSelection(day("2026-03-31"), -1, true)).toEqual(day("2026-02-28"));
		expect(stepSelection(day("2026-12-15"), 1, true)).toEqual(day("2027-01-15"));
		expect(stepSelection(day("2026-01-15"), -1, true)).toEqual(day("2025-12-15"));
	});

	it("steps a week by a month to the week holding its Thursday, moved by the same months", () => {
		// Week 40 of 2026 has Thursday 1 Oct; a month on, Thursday 1 Nov is in week 44 (26 Oct to 1 Nov).
		expect(stepSelection(week(2026, 40), 1, true)).toEqual(week(2026, 44));
		expect(stepSelection(week(2026, 40), -1, true)).toEqual(week(2026, 36));
		expect(stepSelection(week(2026, 53), 1, true)).toEqual(week(2027, 4));
	});

	it("shows the strip's month after stepping by a month", () => {
		const stepped = stepSelection(day("2026-10-14"), 1, true);
		expect(buildStrip(none, state(stepped, true), today).title).toBe("November 2026");
		// A week's month is its Thursday's: week 44's Thursday is 29 Oct, so a week stepped from 1 Oct still shows October.
		const weekStepped = stepSelection(week(2026, 40), 1, true);
		expect(buildStrip(none, state(weekStepped, true), today).title).toBe("October 2026");
		expect(buildStrip(none, state(stepSelection(weekStepped, 1, true), true), today).title).toBe("November 2026");
	});

	it("names a month as the unit of the arrows while the month is open", () => {
		expect(buildStrip(none, state(day("2026-10-14"), true), today).unit).toBe("month");
		expect(buildStrip(none, state(day("2026-10-14")), today).unit).toBe("day");
		expect(buildStrip(none, state(week(2026, 40)), today).unit).toBe("week");
	});

	it("goes back to today's day", () => {
		expect(agendaOn(today)).toEqual(state(day("2026-10-02")));
	});

	it("compares selections by kind and period", () => {
		expect(sameSelection(day("2026-10-02"), day("2026-10-02"))).toBe(true);
		expect(sameSelection(day("2026-10-02"), day("2026-10-03"))).toBe(false);
		expect(sameSelection(week(2026, 40), week(2026, 40))).toBe(true);
		expect(sameSelection(week(2026, 40), day("2026-10-02"))).toBe(false);
	});

	it("moves a selection on yesterday's today to the new today when the day changes, and leaves any other", () => {
		const tomorrow = date("2026-10-03");
		expect(rolledOver(day("2026-10-02"), today, tomorrow)).toEqual(day("2026-10-03"));
		expect(rolledOver(day("2026-10-05"), today, tomorrow)).toEqual(day("2026-10-05"));
		expect(rolledOver(week(2026, 40), today, tomorrow)).toEqual(week(2026, 40));
	});
});

describe("saved Agenda state", () => {
	it("round-trips a day, a week and the month", () => {
		for (const saved of [state(day("2026-10-14"), true), state(week(2026, 53))]) {
			expect(readAgenda(JSON.parse(JSON.stringify(writeAgenda(saved))), today)).toEqual(saved);
		}
	});

	it("opens on today for anything it can't read", () => {
		const opened = state(day("2026-10-02"));
		for (const bad of [null, "x", {}, { selection: { kind: "day", date: "2026-02-30" } }, { selection: { kind: "week", year: 2027, week: 53 } }, { selection: { kind: "week", year: 2026, week: 1.5 } }, { selection: 4 }]) {
			expect(readAgenda(bad, today)).toEqual(opened);
		}
		expect(readAgenda({ monthOpen: "yes" }, today)).toEqual(opened);
		expect(readAgenda({ monthOpen: true }, today).monthOpen).toBe(true);
	});
});
