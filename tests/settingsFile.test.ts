import { describe, expect, it } from "vitest";
import { readDailyNotes, readObsidianDailyNotes, writeDailyNotes } from "../src/core/storage/settingsFile";
import { defaultDailyNotes } from "../src/settingsData";

describe("readDailyNotes", () => {
	it("reads no keys from nothing, from text that isn't JSON and from JSON that isn't an object", () => {
		expect(readDailyNotes(null)).toEqual({});
		expect(readDailyNotes("{ nope")).toEqual({});
		expect(readDailyNotes("[1]")).toEqual({});
		expect(readDailyNotes('{ "dailyNotes": 3 }')).toEqual({});
	});

	it("keeps each key that has a value of the right type", () => {
		const text = JSON.stringify({ dailyNotes: { dailyFolder: 3, dailyTemplate: null, weekNotes: "yes", weekFolder: "", weekTemplate: "T.md" } });
		expect(readDailyNotes(text)).toEqual({ dailyTemplate: null, weekFolder: "", weekTemplate: "T.md" });
	});
});

describe("writeDailyNotes", () => {
	it("writes the five keys to a new file as two-space JSON with a final newline", () => {
		expect(writeDailyNotes(null, defaultDailyNotes)).toBe(`${JSON.stringify({ dailyNotes: defaultDailyNotes }, null, 2)}\n`);
		expect(writeDailyNotes(null, defaultDailyNotes)).toContain('\n  "dailyNotes": {\n    "dailyFolder"');
	});

	it("keeps the other groups and keys, unknown ones included", () => {
		const existing = JSON.stringify({ theme: { themeSet: "Ayu" }, editor: { autocomplete: { tags: true } }, other: [1], dailyNotes: { dailyFolder: "Old", future: true } });
		const values = { ...defaultDailyNotes, dailyFolder: "New", weekNotes: false };
		expect(JSON.parse(writeDailyNotes(existing, values))).toEqual({ theme: { themeSet: "Ayu" }, editor: { autocomplete: { tags: true } }, other: [1], dailyNotes: { ...values, future: true } });
	});

	it("starts again from text that can't be read", () => {
		expect(JSON.parse(writeDailyNotes("{ nope", defaultDailyNotes))).toEqual({ dailyNotes: defaultDailyNotes });
		expect(JSON.parse(writeDailyNotes('{ "dailyNotes": 4 }', defaultDailyNotes))).toEqual({ dailyNotes: defaultDailyNotes });
	});
});

describe("readObsidianDailyNotes", () => {
	it("reads the folder and the template, adding .md to a template without it", () => {
		expect(readObsidianDailyNotes('{ "folder": "Daily", "template": "Templates/Day" }')).toEqual({ dailyFolder: "Daily", dailyTemplate: "Templates/Day.md" });
		expect(readObsidianDailyNotes('{ "template": "Day.md" }')).toEqual({ dailyTemplate: "Day.md" });
	});

	it("leaves out an empty template, and reads nothing from text that isn't JSON", () => {
		expect(readObsidianDailyNotes('{ "folder": "", "template": "" }')).toEqual({ dailyFolder: "" });
		expect(readObsidianDailyNotes("nope")).toEqual({});
	});
});
