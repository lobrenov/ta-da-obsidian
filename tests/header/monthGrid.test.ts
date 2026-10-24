import { describe, expect, it } from "vitest";
import { LocalDate } from "../../src/core/model/localDate";
import { monthGrid, monthTitle, weekdayLetter, weekdayOrder } from "../../src/ui/header/monthGrid";

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;

describe("monthGrid", () => {
	it("fills whole weeks from Monday around October 2026", () => {
		const weeks = monthGrid(date("2026-10-15"), 2);
		expect(weeks).toHaveLength(5);
		expect(weeks[0]?.[0]?.toString()).toBe("2026-09-28");
		expect(weeks[0]?.[3]?.toString()).toBe("2026-10-01");
		expect(weeks[4]?.[6]?.toString()).toBe("2026-11-01");
		expect(weeks.every((week) => week.length === 7)).toBe(true);
	});

	it("starts on Sunday when asked", () => {
		const weeks = monthGrid(date("2026-10-01"), 1);
		expect(weeks[0]?.[0]?.toString()).toBe("2026-09-27");
	});

	it("takes six weeks when the month needs them", () => {
		expect(monthGrid(date("2026-08-01"), 2)).toHaveLength(6);
	});

	it("starts a month on the first day of the week without a lead-in", () => {
		expect(monthGrid(date("2026-06-01"), 2)[0]?.[0]?.toString()).toBe("2026-06-01");
	});

	it("orders weekday letters and titles the month", () => {
		expect(weekdayOrder(2).map(weekdayLetter).join("")).toBe("MTWTFSS");
		expect(weekdayOrder(1).map(weekdayLetter).join("")).toBe("SMTWTFS");
		expect(monthTitle(date("2026-10-15"))).toBe("October 2026");
	});
});
