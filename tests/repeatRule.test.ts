import { describe, expect, it } from "vitest";
import { RepeatRule } from "../src/core/model/repeatRule";

describe("RepeatRule.parse", () => {
	it("gives null for object property names as units", () => {
		for (const unit of ["constructor", "__proto__", "toString", "hasOwnProperty"]) expect(RepeatRule.parse(`every ${unit}`)).toBeNull();
	});

	it("splits words as Swift does", () => {
		expect(RepeatRule.parse("every\u0085week")?.frequency).toBe("week");
		expect(RepeatRule.parse("every﻿week")).toBeNull();
		expect(RepeatRule.parse("every week on mon, tue")?.weekdays).toEqual([2, 3]);
	});
});
