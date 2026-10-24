import { describe, expect, it } from "vitest";
import { currentPhoneTab, phoneTabs } from "../src/ui/navigator/phone";

describe("phone tabs", () => {
	it("are Agenda, Projects and Files", () => {
		expect(phoneTabs.map((tab) => tab.label)).toEqual(["Agenda", "Projects", "Files"]);
	});

	it("highlight Agenda while the Agenda list shows", () => {
		expect(currentPhoneTab({ domain: { kind: "agenda" }, query: "", showingList: true })).toBe("agenda");
	});

	it("highlight Projects on the navigation pane, even with the Agenda as the saved domain", () => {
		expect(currentPhoneTab({ domain: { kind: "agenda" }, query: "", showingList: false })).toBe("projects");
	});

	it("highlight Projects for a list opened from the navigation pane", () => {
		expect(currentPhoneTab({ domain: { kind: "loose" }, query: "", showingList: true })).toBe("projects");
		expect(currentPhoneTab({ domain: { kind: "project", path: "Ta Da/projects/A.md" }, query: "", showingList: true })).toBe("projects");
	});

	it("highlight none while searching", () => {
		expect(currentPhoneTab({ domain: { kind: "agenda" }, query: "pay", showingList: true })).toBeNull();
	});
});
