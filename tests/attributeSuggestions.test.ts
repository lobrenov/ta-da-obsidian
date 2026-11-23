import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { dateRows, dateText, dateTrigger, fuzzyScore, parentRows, parentText, parentTrigger } from "../src/ui/attributeSuggestions";
import { makeItem } from "./support";

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const friday = date("2026-10-02");

/** The trigger with the caret at the end of `line`, or at the `¦` in it. */
function at(line: string, trigger: typeof dateTrigger): ReturnType<typeof dateTrigger> {
	const caret = line.indexOf("¦");
	return caret < 0 ? trigger(line, line.length) : trigger(line.replace("¦", ""), caret);
}

describe("dateTrigger", () => {
	it("opens on a > after whitespace on a checkbox line, with the typed text as the query", () => {
		expect(at("- [ ] Call >", dateTrigger)).toEqual({ start: 11, end: 12, query: "" });
		expect(at("- [ ] Call >fri", dateTrigger)).toEqual({ start: 11, end: 15, query: "fri" });
		expect(at("- [ ] >fri", dateTrigger)).toEqual({ start: 6, end: 10, query: "fri" });
		expect(at("  1. [/] Call\t>2026-1", dateTrigger)).toEqual({ start: 14, end: 21, query: "2026-1" });
	});

	it("takes up to two single spaces, and the text before the caret only", () => {
		expect(at("- [ ] a >next fri", dateTrigger)?.query).toBe("next fri");
		expect(at("- [ ] a >in two weeks", dateTrigger)?.query).toBe("in two weeks");
		expect(at("- [ ] a >fr¦i later", dateTrigger)).toEqual({ start: 8, end: 11, query: "fr" });
		expect(at("- [ ] a >dec 25/", dateTrigger)?.query).toBe("dec 25/");
	});

	it("closes on a space straight after, a third space, a double space, another character or past 40 characters", () => {
		for (const line of ["- [ ] a > fri", "- [ ] a >one two three four", "- [ ] a >one  two", "- [ ] a >fri, ", "- [ ] a >fri!", `- [ ] a >${"x".repeat(41)}`]) {
			expect(at(line, dateTrigger), line).toBeNull();
		}
		expect(at(`- [ ] a >${"x".repeat(40)}`, dateTrigger)).not.toBeNull();
	});

	it("closes once a date is written and followed by a space", () => {
		expect(at("- [ ] a >2026-10-09", dateTrigger)).not.toBeNull();
		expect(at("- [ ] a >2026-10-09 ", dateTrigger)).toBeNull();
		expect(at("- [ ] a >2026-10-09 more", dateTrigger)).toBeNull();
	});

	it("needs whitespace before the >, a checkbox line and the caret after the box", () => {
		for (const line of ["- [ ] a>fri", "- [ ]>fri", "> fri", "> - [ ] a >fri", "- a >fri", "- [!] a >fri", "Prose >fri", "  >fri"]) {
			expect(at(line, dateTrigger), line).toBeNull();
		}
		expect(dateTrigger("- [ ] a >fri", 3)).toBeNull();
	});
});

describe("parentTrigger", () => {
	it("opens on an @ after whitespace on a checkbox line", () => {
		expect(at("- [ ] Call @", parentTrigger)).toEqual({ start: 11, end: 12, query: "" });
		expect(at("- [ ] Call @ta da", parentTrigger)).toEqual({ start: 11, end: 17, query: "ta da" });
		expect(at("- [ ] @ark", parentTrigger)).toEqual({ start: 6, end: 10, query: "ark" });
	});

	it("keeps a typed [[ out of the query and replaces its closing ]]", () => {
		expect(at("- [ ] a @[[Ta Da¦]]", parentTrigger)).toEqual({ start: 8, end: 18, query: "Ta Da" });
		expect(at("- [ ] a @[[Ta¦]] more", parentTrigger)).toEqual({ start: 8, end: 15, query: "Ta" });
		expect(at("- [ ] a @[[Ta", parentTrigger)).toEqual({ start: 8, end: 13, query: "Ta" });
		expect(at("- [ ] a @[[¦]]", parentTrigger)).toEqual({ start: 8, end: 13, query: "" });
	});

	it("closes on a bracket, |, #, ^, a leading space or past 100 characters", () => {
		for (const line of ["- [ ] a @[[Title]]", "- [ ] a @x|y", "- [ ] a @x#y", "- [ ] a @x^y", "- [ ] a @ x", `- [ ] a @${"x".repeat(101)}`]) {
			expect(at(line, parentTrigger), line).toBeNull();
		}
		expect(at(`- [ ] a @${"x".repeat(100)}`, parentTrigger)).not.toBeNull();
	});

	it("needs whitespace before the @, and a checkbox line", () => {
		for (const line of ["- [ ] mail@ark", "> - [ ] a @ark", "- a @ark", "Prose @ark"]) expect(at(line, parentTrigger), line).toBeNull();
	});
});

describe("dateRows", () => {
	const rows = (query: string, today = friday) => dateRows(query, today, "dayMonth", 2).map((row) => `${row.kind}: ${row.label}${row.detail ? ` (${row.detail})` : ""}`);

	it("lists Today, Tomorrow, Next week and Pick a date… for an empty query", () => {
		expect(rows("")).toEqual(["quick: Today (Fri 2 Oct)", "quick: Tomorrow (Sat 3 Oct)", "quick: Next week (Mon 5 Oct)", "pick: Pick a date…"]);
	});

	it("puts the typed phrase's date first, written as it will be", () => {
		expect(rows("mon")[0]).toBe("phrase: Mon 5 Oct (2026-10-05)");
		expect(rows("3d")[0]).toBe("phrase: Mon 5 Oct (2026-10-05)");
		expect(rows("dec 25")[0]).toBe("phrase: Fri 25 Dec (2026-12-25)");
	});

	it("reads fri on a Friday as today, and leaves out the quick day the phrase gave", () => {
		expect(rows("fri")).toEqual(["phrase: Today (2026-10-02)", "quick: Tomorrow (Sat 3 Oct)", "quick: Next week (Mon 5 Oct)", "pick: Pick a date…"]);
		expect(rows("tomorrow")).toEqual(["phrase: Sat 3 Oct (2026-10-03)", "quick: Today (Fri 2 Oct)", "quick: Next week (Mon 5 Oct)", "pick: Pick a date…"]);
	});

	it("lists only the quick days and Pick a date… for text that isn't a date", () => {
		expect(rows("zzz")).toEqual(rows(""));
	});

	it("writes a date as >YYYY-MM-DD and a space", () => {
		expect(dateText(date("2026-10-09"))).toBe(">2026-10-09 ");
	});
});

describe("parentRows", () => {
	const index = new VaultIndex([
		makeItem("Ta Da/areas/Work.md", "type: area"),
		makeItem("Ta Da/areas/Home.md", "type: area"),
		makeItem("Ta Da/projects/Ta Da MVP.md", "type: project\nstatus: Doing\narea: \"[[Work]]\""),
		makeItem("Ta Da/projects/Garden.md", "type: project\nstatus: Not Started\narea: \"[[Home]]\""),
		makeItem("Ta Da/projects/Taxes.md", "type: project\nstatus: Not Started"),
		makeItem("Ta Da/projects/Old.md", "type: project\nstatus: Done"),
		makeItem("Notes/Tame.md", "tags: []"),
	]);
	const rows = (query: string) => parentRows(index, query).map((row) => (row.kind === "new" ? `new: ${row.title}` : `${row.kind}: ${row.title}${row.detail ? ` (${row.detail})` : ""}`));

	it("lists the live projects, then the areas, for an empty query; completed projects and notes aren't parents", () => {
		expect(rows("")).toEqual(["project: Garden (Home)", "project: Ta Da MVP (Work)", "project: Taxes", "area: Home", "area: Work"]);
	});

	it("matches fuzzily, best first, and offers a new project named by text that names none", () => {
		expect(rows("ta")).toEqual(["project: Taxes", "project: Ta Da MVP (Work)", "new: ta"]);
		expect(rows("tdm")).toEqual(["project: Ta Da MVP (Work)", "new: tdm"]);
		expect(rows("zzz")).toEqual(["new: zzz"]);
	});

	it("leaves out New project when the text names a project, in any case, and keeps it for an area's name", () => {
		expect(rows("garden")).toEqual(["project: Garden (Home)"]);
		expect(rows("work")).toEqual(["area: Work", "new: work"]);
	});

	it("writes a parent as @[[Title]] and a space", () => {
		expect(parentText("Ta Da MVP")).toBe("@[[Ta Da MVP]] ");
	});
});

describe("fuzzyScore", () => {
	it("needs the characters in order, ignoring case", () => {
		expect(fuzzyScore("tdm", "Ta Da MVP")).not.toBeNull();
		expect(fuzzyScore("mdt", "Ta Da MVP")).toBeNull();
		expect(fuzzyScore("GARDEN", "garden")).not.toBeNull();
	});

	it("scores a prefix and consecutive characters higher", () => {
		expect((fuzzyScore("ta", "Taxes") ?? 0) > (fuzzyScore("ta", "Garden state") ?? 0)).toBe(true);
		expect((fuzzyScore("gar", "Garden") ?? 0) > (fuzzyScore("gar", "Gxaxr") ?? 0)).toBe(true);
	});
});
