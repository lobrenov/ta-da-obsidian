import { describe, expect, it } from "vitest";
import { TagFilter, dateGroupOf, listSections, type ListSection } from "../src/core/index/grouping";
import { LocalDate } from "../src/core/model/localDate";
import { makeItem, titles } from "./support";

const today = LocalDate.parse("2026-10-16") as LocalDate;

const tasks = [
	makeItem("tasks/Overdue.md", "type: task\nstatus: Doing\ndueDate: 2026-10-14\ntags: [bug]"),
	makeItem("tasks/Deadline today.md", "type: task\nstatus: Blocked\ndueDate: 2026-10-20\ndeadline: 2026-10-16"),
	makeItem("tasks/Next week.md", "type: task\nstatus: Not Started\ndeadline: 2026-10-23\ntags: [Home/Garden]"),
	makeItem("tasks/Undated.md", "type: task\nstatus: Not Started\ntags: [dev, bug]"),
	makeItem("tasks/Shipped.md", "type: task\nstatus: Done\ndueDate: 2026-10-14\ntags: [home]"),
	makeItem("tasks/Dropped.md", "type: task\nstatus: Cancelled"),
];

const described = (sections: ListSection[]): string[] => sections.map((section) => `${section.title}: ${titles(section.tasks).join(", ")}`);

describe("ListSection", () => {
	it("runs status sections Doing, Blocked, Not Started, Done, Cancelled", () => {
		expect(described(listSections(tasks, "Status", today))).toEqual([
			"Doing: Overdue",
			"Blocked: Deadline today",
			"Not Started: Next week, Undated",
			"Done: Shipped",
			"Cancelled: Dropped",
		]);
	});

	it("merges due date and deadline in date sections", () => {
		expect(described(listSections(tasks, "Date", today))).toEqual([
			"Today: Overdue, Deadline today",
			"Upcoming: Next week",
			"Someday: Undated",
			"Completed: Shipped, Dropped",
		]);
	});

	it("puts Completed last in open sections", () => {
		expect(described(listSections(tasks, "Open", today))).toEqual([
			"Open: Overdue, Deadline today, Next week, Undated",
			"Completed: Shipped, Dropped",
		]);
	});

	it("leaves empty groups out", () => {
		expect(described(listSections(tasks.slice(2, 4), "Date", today))).toEqual(["Upcoming: Next week", "Someday: Undated"]);
		expect(listSections([], "Status", today)).toEqual([]);
	});

	it("takes the nearer of either date", () => {
		const item = makeItem("tasks/A.md", "type: task\ndueDate: 2026-10-17\ndeadline: 2026-10-15");
		expect(dateGroupOf(item, today)).toBe("Today");
		const closed = makeItem("tasks/B.md", "type: task\nstatus: Done\ndueDate: 2026-10-01");
		expect(described(listSections([closed], "Date", today))).toEqual(["Completed: B"]);
	});

	it("puts Ongoing after Doing", () => {
		const items = [makeItem("projects/P.md", "type: project\nstatus: Ongoing"), makeItem("tasks/D.md", "type: task\nstatus: Doing")];
		expect(listSections(items, "Status", today).map((section) => section.title)).toEqual(["Doing", "Ongoing"]);
	});
});

describe("TagFilter", () => {
	it("passes files with any picked tag or a child of one", () => {
		expect(new TagFilter().apply(tasks)).toHaveLength(tasks.length);
		expect(titles(new TagFilter(new Set(["bug"])).apply(tasks))).toEqual(["Overdue", "Undated"]);
		expect(titles(new TagFilter(new Set(["dev", "home"])).apply(tasks))).toEqual(["Next week", "Undated", "Shipped"]);
		expect(titles(new TagFilter(new Set(["home/garden"])).apply(tasks))).toEqual(["Next week"]);
		expect(new TagFilter(new Set(["hom"])).apply(tasks)).toEqual([]);
	});

	it("lists the tags of the files with counts", () => {
		const tags = TagFilter.tags(tasks).map((entry) => `${entry.tag.name} ${entry.count}`);
		expect(tags).toEqual(["bug 2", "dev 1", "Home 2", "Home/Garden 1"]);
		expect(new TagFilter(new Set(["home"])).apply(tasks)).toHaveLength(2);
	});

	it("lists a parent only its children carry", () => {
		const files = [makeItem("tasks/A.md", "type: task\ntags: [people/max, people/sam]")];
		expect(TagFilter.tags(files).map((entry) => `${entry.tag.name} ${entry.count}`)).toEqual(["people 1", "people/max 1", "people/sam 1"]);
	});
});
