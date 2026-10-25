import { describe, expect, it } from "vitest";
import { isLoggedPath, isNotePath, titleOfPath } from "../src/core/model/item";
import { ISOWeek, LocalDate } from "../src/core/model/localDate";
import { readStatus, statuses } from "../src/core/model/status";
import { readTag } from "../src/core/model/tag";
import { attachmentName, linkTitle, readWikiLink, readWikiLinkInner } from "../src/core/model/wikiLink";
import { checkboxState } from "../src/core/model/checkbox";
import { scanBody } from "../src/core/parsing/bodyScanner";
import { parseItem } from "../src/core/parsing/parseItem";

const date = (text: string): LocalDate => {
	const parsed = LocalDate.parse(text);
	if (!parsed) throw new Error(text);
	return parsed;
};

describe("LocalDate", () => {
	it("parses and prints YYYY-MM-DD", () => {
		const d = date("2026-10-02");
		expect([d.year, d.month, d.day]).toEqual([2026, 10, 2]);
		expect(d.toString()).toBe("2026-10-02");
	});

	it.each([
		"", "2026-10-2", "2026/10/02", "2026-10-02T09:00", " 2026-10-02", "26-10-02",
		"2026-13-01", "2026-00-10", "2026-04-31", "2026-02-29", "1900-02-29", "0000-01-01", "２０２６-10-02",
	])("rejects %j", (text) => {
		expect(LocalDate.parse(text)).toBeNull();
	});

	it("accepts leap days", () => {
		expect(LocalDate.parse("2028-02-29")).not.toBeNull();
		expect(LocalDate.parse("2000-02-29")).not.toBeNull();
	});

	it("orders by day", () => {
		const sorted = ["2026-10-02", "2025-12-31", "2026-09-30", "2026-10-01"].map(date).sort((a, b) => a.compare(b));
		expect(sorted.map(String)).toEqual(["2025-12-31", "2026-09-30", "2026-10-01", "2026-10-02"]);
	});

	it("does day arithmetic", () => {
		const d = date("2026-10-30");
		expect(d.addingDays(3).toString()).toBe("2026-11-02");
		expect(d.addingDays(-30).toString()).toBe("2026-09-30");
		expect(date("2028-02-28").addingDays(1).toString()).toBe("2028-02-29");
		expect(date("2026-12-31").addingDays(1).toString()).toBe("2027-01-01");
		expect(d.daysTo(date("2026-11-02"))).toBe(3);
		expect(d.daysTo(date("2026-10-02"))).toBe(-28);
		expect(date("2026-10-02").weekday).toBe(6);
		expect(date("2026-10-03").addingDays(2).toString()).toBe("2026-10-05");
	});

	it.each([
		["2026-10-02", 2026, 40], ["2026-09-28", 2026, 40], ["2026-10-04", 2026, 40], ["2026-10-05", 2026, 41],
		["2020-12-31", 2020, 53], ["2021-01-03", 2020, 53], ["2021-01-04", 2021, 1],
		["2026-12-31", 2026, 53], ["2027-01-01", 2026, 53], ["2027-01-03", 2026, 53], ["2027-01-04", 2027, 1],
		["2024-12-30", 2025, 1], ["2025-12-29", 2026, 1], ["2026-01-01", 2026, 1], ["2016-01-01", 2015, 53],
	] as const)("puts %s in ISO week %i-W%i", (text, year, week) => {
		expect([date(text).isoWeek.year, date(text).isoWeek.week]).toEqual([year, week]);
	});

	it("runs an ISO week Monday to Sunday", () => {
		const days = new ISOWeek(2026, 53).days;
		expect(days.map(String)).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
		expect(days.every((day) => day.isoWeek.year === 2026 && day.isoWeek.week === 53)).toBe(true);
		expect(days.map((day) => day.weekday)).toEqual([2, 3, 4, 5, 6, 7, 1]);
		expect(new ISOWeek(2027, 1).firstDay.toString()).toBe("2027-01-04");
		expect(new ISOWeek(2020, 1).firstDay.toString()).toBe("2019-12-30");
		expect(new ISOWeek(2026, 40).toString()).toBe("2026-W40");
	});

	it.each(["2026-03-08", "2026-03-29", "2026-10-25", "2026-11-01"])("ignores daylight saving around %s", (text) => {
		const week = date(text).isoWeek;
		expect(week.days.some((day) => day.equals(date(text)))).toBe(true);
		expect(week.days.map((day) => day.weekday)).toEqual([2, 3, 4, 5, 6, 7, 1]);
	});
});

describe("Status", () => {
	it("reads case-insensitively", () => {
		expect(readStatus("Not Started")).toBe("Not Started");
		expect(readStatus("not started")).toBe("Not Started");
		expect(readStatus("DOING")).toBe("Doing");
		expect(readStatus(" done ")).toBe("Done");
		expect(readStatus("blocked")).toBe("Blocked");
		expect(readStatus("cancelled")).toBe("Cancelled");
		expect(readStatus("ongoing")).toBe("Ongoing");
	});

	it("rejects other values", () => {
		expect(readStatus("NotStarted")).toBeNull();
		expect(readStatus("In progress")).toBeNull();
		expect(readStatus("")).toBeNull();
	});

	it("has the canonical forms", () => {
		expect([...statuses]).toEqual(["Not Started", "Doing", "Done", "Blocked", "Cancelled", "Ongoing"]);
	});
});

describe("Tag", () => {
	it("matches ignoring case and keeps its spelling", () => {
		const tag = readTag("Errands");
		expect(tag).toEqual({ name: "Errands", path: "errands" });
		expect(readTag("#errands")?.path).toBe(tag?.path);
	});

	it("drops the hash and empty segments", () => {
		expect(readTag("home/")?.name).toBe("home");
		expect(readTag("#home//garden/")?.name).toBe("home/garden");
		expect(readTag(" quick win ")?.name).toBe("quick win");
		for (const empty of ["", "#", "/", "  "]) expect(readTag(empty)).toBeNull();
	});

	it.each([
		["#home/garden, #fish", ["home/garden", "fish"]],
		["#errands.", ["errands"]],
		["#quick win", ["quick"]],
		["#Errands", ["Errands"]],
		["#home/", ["home"]],
		["# Heading", []],
		["#2026", []],
		["#2026/", []],
		["`#errands`", []],
		["example.com/#top", []],
		["[[Sell the Kombi#Plan]]", []],
		["#2026/10 #2026/q4\n", ["2026/q4"]],
	] as const)("reads inline tags in %j", (written, tags) => {
		expect(scanBody(written).tags.map((tag) => tag.name)).toEqual(tags);
	});
});

describe("WikiLink", () => {
	it("parses target, heading and alias", () => {
		expect(readWikiLink("[[Ta Da MVP]]")).toEqual({ target: "Ta Da MVP", heading: null, alias: null });
		expect(readWikiLink("[[Ta Da MVP|the app]]")?.alias).toBe("the app");
		expect(readWikiLink("[[Ta Da MVP#Goals]]")?.heading).toBe("Goals");
		const both = readWikiLink("[[projects/Ta Da MVP#Goals|goals]]");
		expect(both).toEqual({ target: "projects/Ta Da MVP", heading: "Goals", alias: "goals" });
		expect(both && linkTitle(both)).toBe("Ta Da MVP");
	});

	it("drops folder and extension from the title", () => {
		expect(linkTitle(readWikiLink("[[a/b/Café.md]]") as never)).toBe("Café");
		expect(linkTitle(readWikiLink("[[ Spaced ]]") as never)).toBe("Spaced");
	});

	it("rejects non-links", () => {
		for (const text of ["Ta Da MVP", "[[Ta Da MVP]] and more", "[Ta Da MVP]", "[[]]", "[[#Heading only]]"]) {
			expect(readWikiLink(text)).toBeNull();
		}
	});

	it("needs an image extension for an attachment name", () => {
		const name = (text: string): string | null => attachmentName(readWikiLink(text) as never);
		expect(name("[[Pasted image 20260930101522.png]]")).toBe("Pasted image 20260930101522.png");
		expect(name("[[report.pdf]]")).toBeNull();
		expect(name("[[Version 1.2]]")).toBeNull();
		expect(name("[[.png]]")).toBe(".png");
	});

	it("reads blocks as headings and same-file links as none", () => {
		expect(readWikiLinkInner("Note#^b1|see")?.heading).toBe("^b1");
		expect(readWikiLinkInner("Note#")?.heading).toBeNull();
		expect(readWikiLinkInner("Note|")?.alias).toBeNull();
		expect(readWikiLinkInner("Note#^")?.heading).toBeNull();
		expect(readWikiLinkInner("Note#^b|")?.heading).toBe("^b");
		expect(readWikiLinkInner("Note#^b|")?.alias).toBeNull();
		for (const inner of ["#Heading", "#^b1", " #h"]) expect(readWikiLinkInner(inner)).toBeNull();
	});
});

describe("Checkbox", () => {
	it("follows the reference set", () => {
		for (const marker of [" ", "/", ">", "<"]) expect(checkboxState(marker)).toBe("open");
		for (const marker of ["x", "X"]) expect(checkboxState(marker)).toBe("done");
		expect(checkboxState("-")).toBe("cancelled");
		for (const marker of "?!*\"lbiSIpcfkwud") expect(checkboxState(marker)).toBe("icon");
		for (const marker of ["y", "✓", "0"]) expect(checkboxState(marker)).toBeNull();
	});
});

describe("Item paths", () => {
	it("knows note paths", () => {
		for (const path of ["Note.md", "A/B/Note.MD", "Meetings/tasks/Note.md", "tasks/Note.md", "attachments/Note.md", ".trash/Note.md", ".trash/Meetings/Note.md"]) {
			expect(isNotePath(path), path).toBe(true);
		}
		for (const path of [
			"Ta Da/tasks/Note.md", "ta da/projects/Note.md", "Ta Da/logbook/2026-10/Note.md", ".logbook/2026-10/Note.md",
			".obsidian/Note.md", "A/.hidden/Note.md", ".Note.md", "Note.txt", ".trash/Ta Da/attachments/Note.md",
		]) {
			expect(isNotePath(path), path).toBe(false);
		}
	});

	it("keeps Ta Da's folder out of notes", () => {
		expect(isNotePath("Ta Da/Readme.md") || isNotePath("ta da/deep/Readme.md")).toBe(false);
		expect(isNotePath("Ta Da 2/Readme.md")).toBe(true);
	});

	it("finds the logbook in any case", () => {
		expect(isLoggedPath("ta da/logbook/2026-10/X.md") && isLoggedPath("Ta Da/Logbook/2026-10/X.md")).toBe(true);
		expect(isLoggedPath("Ta Da/tasks/X.md") || isLoggedPath(".logbook/X.md") || isLoggedPath("Logbook/X.md")).toBe(false);
	});

	it("takes a title from the last path component", () => {
		expect(titleOfPath("folder/Name.md")).toBe("Name");
		expect(titleOfPath("Name.MD")).toBe("Name");
		expect(titleOfPath("front.jpg")).toBe("front.jpg");
	});

	it.each([
		"No frontmatter\n\n- [ ] not a subtask\n",
		"---\nstatus: Doing\n---\nBody\n",
		"---\ntype: note\n---\n",
		"---\ntype: task\nnever closed\n",
		"",
	])("reads untyped %j as a note only at note paths", (text) => {
		expect(parseItem(text, "x.md")?.properties.kind).toBe("note");
		expect(parseItem(text, "Meetings/x.md")?.properties.kind).toBe("note");
		expect(parseItem(text, "Ta Da/tasks/x.md")).toBeNull();
	});
});

describe("identityKey", () => {
	it("lowercases per scalar, with no final sigma", async () => {
		const { identityKey } = await import("../src/core/text");
		expect(identityKey("ΟΔΟΣ")).toBe("οδοσ");
		expect(identityKey("Café")).toBe(identityKey("Café"));
	});
});
