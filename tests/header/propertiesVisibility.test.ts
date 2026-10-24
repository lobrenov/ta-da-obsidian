import { describe, expect, it } from "vitest";
import { hidesProperties, ShownProperties } from "../../src/ui/header/propertiesVisibility";

describe("hidesProperties", () => {
	it("hides on task, project and area files by default", () => {
		for (const kind of ["task", "project", "area"] as const) expect(hidesProperties(kind, true, false)).toBe(true);
	});

	it("leaves notes and unknown files alone", () => {
		expect(hidesProperties("note", true, false)).toBe(false);
		expect(hidesProperties(undefined, true, false)).toBe(false);
	});

	it("shows them when the setting is off or the header's button showed them", () => {
		expect(hidesProperties("task", false, false)).toBe(false);
		expect(hidesProperties("task", true, true)).toBe(false);
	});
});

describe("ShownProperties", () => {
	it("flips per file and follows a rename", () => {
		const shown = new ShownProperties();
		expect(shown.toggle("a.md")).toBe(true);
		expect(shown.has("a.md")).toBe(true);
		shown.rename("a.md", "b.md");
		expect(shown.has("b.md")).toBe(true);
		expect(shown.toggle("b.md")).toBe(false);
		expect(shown.has("a.md")).toBe(false);
	});
});
