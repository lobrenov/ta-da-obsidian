import { describe, expect, it } from "vitest";
import { LocalDate } from "../src/core/model/localDate";
import { type DayOrder, parseDatePhrase } from "../src/core/writing/datePhrase";

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const tuesday = date("2026-10-13");

function parse(text: string, today: LocalDate = tuesday, order: DayOrder = "dayMonth"): string | null {
	return parseDatePhrase(text, today, order, 2)?.toString() ?? null;
}

describe("DatePhrase", () => {
	it.each([
		["today", "2026-10-13"], ["tod", "2026-10-13"], ["t", "2026-10-13"], ["to", "2026-10-13"], ["  TODAY ", "2026-10-13"],
		["tomorrow", "2026-10-14"], ["tmr", "2026-10-14"], ["tom", "2026-10-14"],
		["fri", "2026-10-16"], ["friday", "2026-10-16"], ["f", "2026-10-16"], ["next fri", "2026-10-16"], ["next fr", "2026-10-16"],
		["this friday", "2026-10-16"], ["on fri", "2026-10-16"], ["fri 3pm", "2026-10-16"], ["friday at 15:00", "2026-10-16"],
		["fri 3 pm", "2026-10-16"], ["fri at 3", "2026-10-16"], ["tomorrow at 9", "2026-10-14"],
		["fri 3", "2026-10-16"], ["fri 3p", "2026-10-16"], ["tomorrow 15:", "2026-10-14"], ["tomorrow 15:3", "2026-10-14"],
		["tue", "2026-10-13"], ["tu", "2026-10-13"], ["th", "2026-10-15"], ["w", "2026-10-14"], ["we", "2026-10-14"],
		["s", "2026-10-17"], ["sa", "2026-10-17"], ["su", "2026-10-18"], ["m", "2026-10-19"], ["mon", "2026-10-19"],
		["next mon", "2026-10-19"],
		["weekend", "2026-10-17"], ["wee", "2026-10-17"], ["this weekend", "2026-10-17"], ["wknd", "2026-10-17"],
		["next week", "2026-10-19"], ["n", "2026-10-19"], ["ne", "2026-10-19"], ["nex", "2026-10-19"], ["next", "2026-10-19"],
		["next w", "2026-10-19"], ["next wk", "2026-10-19"],
		["next month", "2026-11-01"], ["next m", "2026-11-01"],
		["end of month", "2026-10-31"], ["eom", "2026-10-31"], ["e", "2026-10-31"],
	])("reads the word %j as %s", (text, expected) => {
		expect(parse(text)).toBe(expected);
	});

	it.each([
		["3d", "2026-10-16"], ["3 days", "2026-10-16"], ["in 3 days", "2026-10-16"], ["+3", "2026-10-16"], ["in 3", "2026-10-16"],
		["2w", "2026-10-27"], ["in 2 weeks", "2026-10-27"], ["2 wks", "2026-10-27"],
		["1m", "2026-11-13"], ["in 1 month", "2026-11-13"], ["1y", "2027-10-13"], ["1 yr", "2027-10-13"],
		["25", "2026-10-25"], ["25th", "2026-10-25"], ["the 25th", "2026-10-25"], ["13", "2026-10-13"], ["12", "2026-11-12"],
		["1st", "2026-11-01"], ["31", "2026-10-31"],
	])("reads the number %j as %s", (text, expected) => {
		expect(parse(text)).toBe(expected);
	});

	it.each([
		["25/12", "2026-12-25"], ["25.12", "2026-12-25"], ["25-12", "2026-12-25"], ["25/12/", "2026-12-25"],
		["dec 25", "2026-12-25"], ["25 dec", "2026-12-25"], ["december 25th", "2026-12-25"], ["25th of december", "2026-12-25"],
		["Dec 25, 2026", "2026-12-25"], ["25 de", "2026-12-25"], ["dec. 25", "2026-12-25"], ["25dec", "2026-12-25"],
		["25/12/27", "2027-12-25"], ["25/12/2027", "2027-12-25"], ["25 dec 2027", "2027-12-25"], ["2027-12-25", "2027-12-25"],
		["1/1", "2027-01-01"], ["13/10", "2026-10-13"], ["12/10", "2027-10-12"], ["29/2", "2028-02-29"], ["sept 3", "2027-09-03"],
		["1/1/2020", "2020-01-01"], ["dec 3 pm", "2026-12-03"], ["dec 3 at 15:", "2026-12-03"],
	])("reads the date %j as %s", (text, expected) => {
		expect(parse(text)).toBe(expected);
	});

	it.each(["", "  ", "xyz", "31/2", "0", "32", "3pm", "ma", "25 ju", "this", "13/13", "2027-12", "1/1/123", "9999y", "2027-12-251"])(
		"rejects %j",
		(text) => {
			expect(parse(text)).toBeNull();
		},
	);

	it("follows the numeric order setting", () => {
		expect(parse("12/25", tuesday, "monthDay")).toBe("2026-12-25");
		expect(parse("5/12", tuesday, "monthDay")).toBe("2027-05-12");
		expect(parse("5/12", tuesday, "dayMonth")).toBe("2026-12-05");
		expect(parse("12/25", tuesday, "dayMonth")).toBeNull();
	});

	it.each([
		["t", "2026-10-14"], ["to", "2026-10-14"], ["tu", "2026-10-20"], ["tue", "2026-10-20"], ["on t", "2026-10-14"],
		["on tomorrow", "2026-10-15"], ["this tom", "2026-10-15"], ["next t", "2026-10-14"], ["next tu", "2026-10-20"],
		["w", "2026-10-14"], ["wed", "2026-10-14"],
	])("reads the prefix %j on a Wednesday as %s", (text, expected) => {
		expect(parse(text, date("2026-10-14"))).toBe(expected);
	});

	it("two-digit years don't pass through the past", () => {
		for (const typed of ["25/12/2", "25/12/20", "25/12/202", "dec 25 20", "dec 25 202"]) expect(parse(typed), typed).toBeNull();
		expect(parse("25/12/2027")).toBe("2027-12-25");
		expect(parse("12/25/27", tuesday, "monthDay")).toBe("2027-12-25");
	});

	it("on a Friday gives today", () => {
		const friday = date("2026-10-16");
		expect(parse("fri", friday)).toBe("2026-10-16");
		expect(parse("next fri", friday)).toBe("2026-10-16");
		expect(parse("sat", friday)).toBe("2026-10-17");
	});

	it("handles month ends and years", () => {
		expect(parse("1m", date("2026-01-31"))).toBe("2026-02-28");
		expect(parse("1m", date("2028-01-31"))).toBe("2028-02-29");
		expect(parse("1y", date("2028-02-29"))).toBe("2029-02-28");
		expect(parse("31", date("2026-04-30"))).toBe("2026-05-31");
		expect(parse("dec 25", date("2026-12-26"))).toBe("2027-12-25");
		expect(parse("jan 3", date("2026-12-31"))).toBe("2027-01-03");
		expect(parse("tomorrow", date("2026-12-31"))).toBe("2027-01-01");
		expect(parse("eom", date("2028-02-10"))).toBe("2028-02-29");
		expect(parse("29", date("2027-02-01"))).toBe("2027-03-29");
	});
});

describe("LocalDate arithmetic for DatePhrase", () => {
	it("finds months", () => {
		expect(date("2026-10-14").startOfMonth.toString()).toBe("2026-10-01");
		expect(date("2026-10-14").addingMonths(3).toString()).toBe("2027-01-01");
		expect(date("2026-01-31").addingMonths(-1).toString()).toBe("2025-12-01");
	});

	it("keeps the day or the month's last", () => {
		expect(date("2026-01-31").addingMonthsKeepingDay(1)?.toString()).toBe("2026-02-28");
		expect(date("2028-01-31").addingMonthsKeepingDay(1)?.toString()).toBe("2028-02-29");
		expect(date("2026-03-31").addingMonthsKeepingDay(-1)?.toString()).toBe("2026-02-28");
		expect(date("2026-10-13").addingMonthsKeepingDay(14)?.toString()).toBe("2027-12-13");
		expect(date("2026-10-13").addingMonthsKeepingDay(12 * 8000)).toBeNull();
	});

	it("this weekend is the coming Saturday, or today", () => {
		expect(date("2026-10-02").thisWeekend.toString()).toBe("2026-10-03");
		expect(date("2026-10-03").thisWeekend.toString()).toBe("2026-10-03");
		expect(date("2026-10-04").thisWeekend.toString()).toBe("2026-10-04");
		expect(date("2026-10-05").thisWeekend.toString()).toBe("2026-10-10");
	});

	it("next week is the first day of the following week", () => {
		expect(date("2026-10-02").nextWeek(2).toString()).toBe("2026-10-05");
		expect(date("2026-10-05").nextWeek(2).toString()).toBe("2026-10-12");
		expect(date("2026-10-04").nextWeek(2).toString()).toBe("2026-10-05");
		expect(date("2026-10-02").nextWeek(1).toString()).toBe("2026-10-04");
	});
});
