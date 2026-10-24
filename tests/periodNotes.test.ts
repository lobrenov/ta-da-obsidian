import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ Notice: class {}, TFolder: class {} }));

const { existingCasing, folderOfPath } = await import("../src/ui/navigator/periodNotes");

describe("existingCasing", () => {
	const known = ["Periodic Notes", "Periodic Notes/Daily Notes", "Journal"];

	it("spells each folder as the vault does when it exists in another case", () => {
		expect(existingCasing("periodic notes/DAILY notes", known)).toBe("Periodic Notes/Daily Notes");
		expect(existingCasing("JOURNAL", known)).toBe("Journal");
	});

	it("keeps the typed spelling for folders the vault doesn't have, under the spelled ones", () => {
		expect(existingCasing("Periodic Notes/Weekly Notes", known)).toBe("Periodic Notes/Weekly Notes");
		expect(existingCasing("periodic notes/Weekly Notes", known)).toBe("Periodic Notes/Weekly Notes");
		expect(existingCasing("New/Deep", known)).toBe("New/Deep");
	});

	it("is the top level for no folder", () => {
		expect(existingCasing("", known)).toBe("");
	});
});

describe("folderOfPath", () => {
	it("is the path less its file name", () => {
		expect(folderOfPath("Periodic Notes/Daily Notes/2026-10-02.md")).toBe("Periodic Notes/Daily Notes");
		expect(folderOfPath("2026-10-02.md")).toBe("");
	});
});
