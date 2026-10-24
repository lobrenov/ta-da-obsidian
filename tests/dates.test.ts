import { describe, expect, it } from "vitest";
import { LocalDate } from "../src/core/model/localDate";
import { localToday, monthTitle } from "../src/ui/dates";

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;

describe("ui dates", () => {
	it("titles a month, leaving the year out only for today's year when told", () => {
		expect(monthTitle(date("2026-10-15"))).toBe("October 2026");
		expect(monthTitle(date("2026-10-15"), date("2026-01-01"))).toBe("October");
		expect(monthTitle(date("2025-09-01"), date("2026-01-01"))).toBe("September 2025");
	});

	it("reads today from the device's calendar", () => {
		expect(localToday(new Date(2026, 9, 24, 23, 59)).toString()).toBe("2026-10-24");
	});
});
