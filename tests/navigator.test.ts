import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { trashedItems } from "../src/core/storage/trash";
import { domainKey, groupingOf, readDomain } from "../src/ui/navigator/domain";
import { visiblePaths, visibleRows } from "../src/ui/navigator/listModel";
import { loadFixtureIndex } from "./fixtureVault";
import { context, describeList, list } from "./navigatorSupport";
import { makeItem } from "./support";

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const today = date("2026-10-02");

describe("Today", () => {
	const ctx = context(loadFixtureIndex("DesignVault"), today);

	it("groups by project, tasks without a parent first, with the dates the Agenda shows", () => {
		const model = list({ kind: "today" }, ctx);
		expect(model.header.title).toBe("Today");
		expect(model.header.detail).toBe("Fri 2 Oct");
		expect(model.grouping).toBe("Project");
		expect(describeList(model)).toEqual([
			"# -",
			"    Message Max about a coat and a jacket | [Not Started]",
			"    Resolve the cabin payback | [Doing] | 1/2 | Deadline Today (overdue)",
			"    Shift my physio appointment | [Blocked]",
			"    Submit timesheet | [Not Started] | repeat Weekly · Fri",
			"    Update my claude.md files | [Doing] | 2/5 | Deadline Tue 6 Oct",
			"# project Atlas Billing 1 (Work)",
			"    Create a system testing plan | [Not Started] | 0/4 | Deadline Today (overdue)",
			"# project Game Jam - Starfall 1 (Game Jams)",
			"    Update Dan’s website for Starfall | [Doing] | 1/3 | Deadline Thu 8 Oct",
		]);
	});

	it("names each task's place under Status and Open, where no group names it", () => {
		const model = list({ kind: "today" }, ctx, { groupings: { today: "Status" } });
		expect(describeList(model)).toEqual([
			"# Doing 3",
			"    Resolve the cabin payback | [Doing] | 1/2 | Deadline Today (overdue)",
			"    Update Dan’s website for Starfall | [Doing] | in Game Jam - Starfall | 1/3 | Deadline Thu 8 Oct",
			"    Update my claude.md files | [Doing] | 2/5 | Deadline Tue 6 Oct",
			"# Blocked 1",
			"    Shift my physio appointment | [Blocked]",
			"# Not Started 3",
			"    Create a system testing plan | [Not Started] | in Atlas Billing | 0/4 | Deadline Today (overdue)",
			"    Message Max about a coat and a jacket | [Not Started]",
			"    Submit timesheet | [Not Started] | repeat Weekly · Fri",
		]);
		expect(list({ kind: "today" }, ctx, { groupings: { today: "Open" } }).sections.map((s) => s.id)).toEqual(["today|Open"]);
	});

	it("lists a task completed today in Completed, folded under Status and Date", () => {
		const index = new VaultIndex([
			makeItem("Ta Da/tasks/Finished.md", "type: task\nstatus: Done\ncompletedDate: 2026-10-02"),
			makeItem("Ta Da/tasks/Due.md", "type: task\nstatus: Not Started\ndueDate: 2026-10-02"),
		]);
		const status = list({ kind: "today" }, context(index, today), { groupings: { today: "Status" } });
		expect(describeList(status)).toEqual(["# Not Started 1", "    Due | [Not Started]", "+ quiet Done 1", "    Finished | [Done]"]);
		const opened = list({ kind: "today" }, context(index, today), { groupings: { today: "Status" }, folds: new Set(["today|Status: Done"]) });
		expect(opened.sections.map((section) => section.folded)).toEqual([false, false]);
	});

	it("falls back to the default when a list's saved grouping isn't one of its choices", () => {
		expect(groupingOf("today", { today: "Date" })).toBe("Project");
		expect(groupingOf("loose", { loose: "Date" })).toBe("Date");
	});
});

describe("Upcoming", () => {
	const ctx = context(loadFixtureIndex("DesignVault"), today);

	it("lists a day at a time, a task on each of its dates, with a deadline's entry marked", () => {
		const model = list({ kind: "upcoming" }, ctx);
		expect(model.groupList).toBeNull();
		expect(describeList(model)).toEqual([
			"# 3 Sat",
			"    Update 2DS before the next session | [Not Started]",
			"# 5 Mon",
			"    Book a roadworthy for the Kombi | [Not Started] | in Sell the Kombi",
			"    Read and write files through iCloud Drive | [Doing] | in Ta Da MVP | 3/5",
			"# 6 Tue",
			"    Update my claude.md files | [Doing] | 2/5 | Deadline",
			"# 7 Wed",
			"    Build the sidebar domains | [Doing] | in Ta Da MVP",
			"# 8 Thu",
			"    Update Dan’s website for Starfall | [Doing] | in Game Jam - Starfall | 1/3 | Deadline",
			"# 9 Fri",
			"    Live preview editor on swift-markdown-engine | [Blocked] | in Ta Da MVP | 1/4",
			"# 14 Wed",
			"    Agenda view for Upcoming | [Not Started] | in Ta Da MVP",
			"# 16 Fri",
			"    Live preview editor on swift-markdown-engine | [Blocked] | in Ta Da MVP | 1/4 | Deadline",
			"# 30 Fri",
			"    Import iTerm2 colour schemes as themes | [Not Started] | in Ta Da MVP | Deadline",
		]);
	});

	it("gives a task listed twice two row ids and one selectable path", () => {
		const model = list({ kind: "upcoming" }, ctx);
		const ids = visibleRows(model).map((row) => row.id);
		expect(new Set(ids).size).toBe(ids.length);
		const paths = visiblePaths(model);
		expect(paths.filter((path) => path.endsWith("Live preview editor on swift-markdown-engine.md"))).toHaveLength(1);
		expect(ids.length).toBe(paths.length + 1);
	});

	it("names the month on days outside this one", () => {
		const index = new VaultIndex([makeItem("Ta Da/tasks/Later.md", "type: task\nstatus: Not Started\ndueDate: 2026-11-03"), makeItem("Ta Da/tasks/Next year.md", "type: task\nstatus: Not Started\ndueDate: 2027-01-04")]);
		const headers = list({ kind: "upcoming" }, context(index, today)).sections.map((section) => section.header);
		expect(headers).toEqual([
			{ style: "day", day: "3", detail: "Tue Nov" },
			{ style: "day", day: "4", detail: "Mon Jan 2027" },
		]);
	});
});

describe("Loose tasks", () => {
	it("groups by Status by default and shows the date itself", () => {
		const model = list({ kind: "loose" }, context(loadFixtureIndex("DesignVault"), today));
		expect(model.groupList).toBe("loose");
		expect(describeList(model)).toEqual([
			"# Doing 2",
			"    Resolve the cabin payback | [Doing] | 1/2 | Deadline Today (overdue)",
			"    Update my claude.md files | [Doing] | 2/5 | Deadline Tue 6 Oct",
			"# Blocked 1",
			"    Shift my physio appointment | [Blocked] | Today",
			"# Not Started 3",
			"    Message Max about a coat and a jacket | [Not Started] | Today",
			"    Submit timesheet | [Not Started] | repeat Weekly · Fri | Today",
			"    Update 2DS before the next session | [Not Started] | Sat 3 Oct",
		]);
	});

	it("groups by Date", () => {
		const model = list({ kind: "loose" }, context(loadFixtureIndex("DesignVault"), today), { groupings: { loose: "Date" } });
		expect(model.sections.map((section) => `${section.header && "title" in section.header ? section.header.title : ""} ${section.rows.length}`)).toEqual(["Today 5", "Upcoming 1"]);
	});

	it("says so when there are none", () => {
		const model = list({ kind: "loose" }, context(new VaultIndex(), today));
		expect(model.empty).toBe("No loose tasks");
		expect(model.sections).toEqual([]);
	});
});

describe("areas and projects", () => {
	const ctx = context(loadFixtureIndex("AreaVault"), today);

	it("groups Today by area, each area's projects under it, and a project's missing area beside its name", () => {
		expect(describeList(list({ kind: "today" }, ctx))).toEqual([
			"# -",
			"    Buy milk | [Not Started]",
			"    Call Nowhere | [Not Started]",
			"# project Lost 1 (Nowhere)",
			"    Find the map | [Not Started]",
			"# project Side quest 1",
			"    Plan the quest | [Not Started]",
			"# area Personal 1",
			"    Pay rent | [Not Started]",
			"# sub Garden 1",
			"    Water the beds | [Done]",
			"# sub Ta Da 2",
			"    Both keys | [Not Started] | Thu 1 Oct (overdue)",
			"    Build the sidebar | [Doing]",
			"# area Work 0",
			"# sub Payroll 1",
			"    Run payroll | [Not Started] | Deadline Today (overdue)",
		]);
	});

	it("shows an area's projects, then its own open tasks, then its Completed folded", () => {
		const model = list({ kind: "area", path: "areas/Personal.md" }, ctx);
		expect(model.header.title).toBe("Personal");
		expect(model.header.lines).toEqual(["2 projects · 2 tasks"]);
		expect(model.header.file).toEqual({ path: "areas/Personal.md", label: "Open area file" });
		expect(describeList(model)).toEqual(["# -", "    project | Garden | line", "    project | Ta Da | line | 2 open", "# -", "    Book a dentist | [Not Started]", "    Pay rent | [Not Started] | Today"]);
		const index = new VaultIndex([
			makeItem("Ta Da/areas/Home.md", "type: area"),
			makeItem("Ta Da/tasks/Open.md", 'type: task\nstatus: Doing\narea: "[[Home]]"'),
			makeItem("Ta Da/tasks/Shut.md", 'type: task\nstatus: Done\ncompletedDate: 2026-09-20\narea: "[[Home]]"'),
		]);
		const home = list({ kind: "area", path: "Ta Da/areas/Home.md" }, context(index, today));
		expect(describeList(home)).toEqual(["# -", "    Open | [Doing]", "+ quiet Completed 1", "    Shut | [Done]"]);
		expect(visiblePaths(home)).toEqual(["Ta Da/tasks/Open.md"]);
		expect(visiblePaths(list({ kind: "area", path: "Ta Da/areas/Home.md" }, context(index, today), { folds: new Set(["area:Ta Da/areas/Home.md|Completed"]) }))).toEqual(["Ta Da/tasks/Open.md", "Ta Da/tasks/Shut.md"]);
	});

	it("shows a project's status, progress and tasks by Open", () => {
		const model = list({ kind: "project", path: "projects/Ta Da.md" }, ctx);
		expect(model.groupList).toBe("project");
		expect(model.grouping).toBe("Open");
		expect(model.header.lines).toEqual(["Doing · 0 of 2 done"]);
		expect(describeList(model)).toEqual(["# Open 2", "    Both keys | [Not Started] | Thu 1 Oct (overdue)", "    Build the sidebar | [Doing] | Today"]);
	});

	it("keeps a finished project's tasks under Completed, folded under Date", () => {
		const model = list({ kind: "project", path: "projects/Garden.md" }, ctx, { groupings: { project: "Date" } });
		expect(describeList(model)).toEqual(["+ quiet Completed 1", "    Water the beds | [Done]"]);
	});

	it("is null for a project or area that's gone", () => {
		expect(() => list({ kind: "project", path: "projects/Gone.md" }, ctx)).toThrow();
	});
});

describe("tags", () => {
	const ctx = context(loadFixtureIndex("TagVault"), today);

	it("shows a tag's page with its children as chips and its files in sections that fold", () => {
		const model = list({ kind: "tag", path: "home" }, ctx);
		expect(model.header.title).toBe("Home");
		expect(model.header.lines).toEqual(["1 area · 1 project · 2 open tasks"]);
		expect(model.header.chips.map((chip) => [chip.label, chip.count, chip.domain])).toEqual([["garden", 3, { kind: "tag", path: "home/garden" }]]);
		expect(describeList(model)).toEqual([
			"# Tagged areas and projects 2",
			"    area | Home | card | 1 project",
			"    project | Garden | card | 0 of 2 done · Home",
			"# Tasks 2",
			"# area Home 0",
			"# sub Garden 2",
			"    Buy mulch | [Not Started] | 2 tags",
			"    Prune the lemon tree | [Doing] | 2 tags",
		]);
	});

	it("folds the tasks' groups with their Tasks header", () => {
		const model = list({ kind: "tag", path: "home" }, ctx, { folds: new Set(["tag:home|Tasks"]) });
		expect(model.sections.map((section) => section.folded)).toEqual([false, true, true, true]);
		expect(visiblePaths(model)).toEqual(["areas/Home.md", "projects/Garden.md"]);
	});

	it("shows Untagged with Loose last", () => {
		const model = list({ kind: "tag", path: null }, ctx);
		expect(model.header.title).toBe("Untagged");
		expect(describeList(model)).toEqual(["# Areas and projects 1", "    area | Work | card | 1 project", "# Tasks 1", "# Loose", "    Untagged task | [Not Started]"]);
	});

	it("says when no open task carries the tag", () => {
		const model = list({ kind: "tag", path: "errands" }, context(new VaultIndex([makeItem("Ta Da/areas/A.md", "type: area\ntags: [errands]")]), today));
		expect(model.sections.find((section) => section.id === "tag:errands|Tasks")?.message).toBe("No open tasks carry this tag.");
	});
});

describe("notes", () => {
	const ctx = context(loadFixtureIndex("NoteVault"), today, { folders: new Set(["Empty"]) });

	it("shows a folder's own notes with its subfolders as chips", () => {
		const model = list({ kind: "folder", path: "Meetings" }, ctx);
		expect(model.header.title).toBe("Meetings");
		expect(model.header.lines).toEqual(["1 note · 1 folder"]);
		expect(model.header.chips.map((chip) => [chip.label, chip.count, chip.domain])).toEqual([["2026", 1, { kind: "folder", path: "Meetings/2026" }]]);
		expect(describeList(model)).toEqual(["# -", "    note | Ark planning call"]);
		expect(list({ kind: "folder", path: "Meetings/2026" }, ctx).header.detail).toBe("Meetings/");
	});

	it("shows the top level as Loose, and says when a folder holds none", () => {
		expect(describeList(list({ kind: "folder", path: "" }, ctx))).toEqual(["# -", "    note | Loose idea", "    note | Reading list"]);
		expect(list({ kind: "folder", path: "" }, ctx).header.title).toBe("Loose");
		expect(list({ kind: "folder", path: "Empty" }, ctx).empty).toBe("No notes in Empty itself.");
	});
});

describe("tag filter", () => {
	const index = new VaultIndex([
		makeItem("Ta Da/tasks/Wet.md", "type: task\nstatus: Not Started\ntags: [Home/Garden]"),
		makeItem("Ta Da/tasks/Dry.md", "type: task\nstatus: Not Started\ntags: [work]"),
		makeItem("Ta Da/tasks/Bare.md", "type: task\nstatus: Not Started"),
	]);

	it("offers the tags in the list, with parents, and narrows to a picked tag or its children", () => {
		const all = list({ kind: "loose" }, context(index, today));
		expect(all.filter?.tags.map((tag) => `${tag.name} ${tag.count}`)).toEqual(["Home 1", "Home/Garden 1", "work 1"]);
		expect(all.filter).toMatchObject({ shown: 3, total: 3 });
		const picked = list({ kind: "loose" }, context(index, today), { picked: new Set(["home"]) });
		expect(describeList(picked)).toEqual(["# Not Started 1", "    Wet | [Not Started] | 1 tag"]);
		expect(picked.filter).toMatchObject({ shown: 1, total: 3 });
		expect(picked.filter?.tags.find((tag) => tag.path === "home")?.picked).toBe(true);
	});

	it("keeps a picked tag in the menu after no file carries it, and says nothing matches", () => {
		const model = list({ kind: "loose" }, context(index, today), { picked: new Set(["gone"]) });
		expect(model.empty).toBe("No matches");
		expect(model.filter?.tags.find((tag) => tag.path === "gone")).toEqual({ path: "gone", name: "gone", count: 0, picked: true });
	});

	it("has no filter where no file carries a tag", () => {
		const bare = new VaultIndex([makeItem("Ta Da/tasks/Bare.md", "type: task\nstatus: Not Started")]);
		expect(list({ kind: "loose" }, context(bare, today)).filter).toBeNull();
	});

	it("filters Upcoming's entries and an area's projects and tasks", () => {
		const dated = new VaultIndex([
			makeItem("Ta Da/areas/Home.md", "type: area"),
			makeItem("Ta Da/tasks/A.md", "type: task\nstatus: Not Started\ndueDate: 2026-10-05\ntags: [x]"),
			makeItem("Ta Da/tasks/B.md", 'type: task\nstatus: Not Started\ndueDate: 2026-10-05\narea: "[[Home]]"'),
			makeItem("Ta Da/projects/P.md", 'type: project\nstatus: Doing\narea: "[[Home]]"\ntags: [x]'),
		]);
		const upcoming = list({ kind: "upcoming" }, context(dated, today), { picked: new Set(["x"]) });
		expect(describeList(upcoming)).toEqual(["# 5 Mon", "    A | [Not Started] | 1 tag"]);
		const area = list({ kind: "area", path: "Ta Da/areas/Home.md" }, context(dated, today), { picked: new Set(["x"]) });
		expect(describeList(area)).toEqual(["# -", "    project | P | line"]);
	});
});

describe("Logbook", () => {
	const index = new VaultIndex([
		makeItem("Ta Da/tasks/Done today.md", "type: task\nstatus: Done\ncompletedDate: 2026-10-02"),
		makeItem("Ta Da/projects/Closed with open.md", "type: project\nstatus: Done\ncompletedDate: 2026-10-01"),
		makeItem("Ta Da/tasks/Closed child.md", 'type: task\nstatus: Done\ncompletedDate: 2026-10-01\nproject: "[[Closed with open]]"'),
		makeItem("Ta Da/tasks/Still open.md", 'type: task\nstatus: Doing\nproject: "[[Closed with open]]"'),
		makeItem("Ta Da/Logbook/2026-09/Logged old.md", "type: task\nstatus: Done\ncompletedDate: 2026-09-30"),
		makeItem("Ta Da/Logbook/2026-09/Old project.md", "type: project\nstatus: Cancelled\ncompletedDate: 2026-09-30"),
		makeItem("Ta Da/Logbook/2026-09/Logged older.md", "type: task\nstatus: Cancelled\ncompletedDate: 2026-09-10"),
		makeItem("Ta Da/Logbook/2025-12/Last year.md", "type: task\nstatus: Done\ncompletedDate: 2025-12-20"),
		makeItem("Ta Da/tasks/Open.md", "type: task\nstatus: Doing"),
	]);

	it("groups files not logged yet, then logged ones by day, month and year, newest first", () => {
		const model = list({ kind: "logbook" }, context(index, today));
		expect(model.header.lines).toEqual(["3 completed, still in place"]);
		expect(describeList(model)).toEqual([
			"# Completed today [Still in place · logs tonight]",
			"    logged | task | Done today | [Done] | Loose task | Today",
			"# Waiting for open tasks",
			"    logged | task | Closed child | [Done] | Closed with open | 1 Oct",
			"    logged | project | Closed with open | [Done] | Project · 2 tasks | 1 Oct",
			"# Wednesday 30 Sep",
			"    logged | task | Logged old | [Done] | Loose task | 30 Sep",
			"    logged | project | Old project | [Cancelled] | Project · 0 tasks | 30 Sep",
			"# September",
			"    logged | task | Logged older | [Cancelled] | Loose task | 10 Sep",
			"# December 2025",
			"    logged | task | Last year | [Done] | Loose task | 20 Dec 2025",
		]);
	});

	it("opens every row's file and never offers a checkbox action", () => {
		const rows = visibleRows(list({ kind: "logbook" }, context(index, today)));
		expect(rows.every((row) => row.type === "logged" && row.path !== null)).toBe(true);
	});

	it("says so when empty", () => {
		expect(list({ kind: "logbook" }, context(new VaultIndex(), today)).empty).toBe("Nothing logged yet");
	});
});

describe("Trash", () => {
	const trash = trashedItems([
		{ path: ".trash/Area X.md", text: "---\ntype: area\n---\n" },
		{ path: ".trash/Project Y.md", text: '---\ntype: project\nstatus: Doing\narea: "[[Area X]]"\n---\n' },
		{ path: ".trash/Task Z.md", text: '---\ntype: task\nstatus: Doing\nproject: "[[Project Y]]"\n---\n' },
		{ path: ".trash/Loose.md", text: "---\ntype: task\nstatus: Not Started\n---\n" },
		{ path: ".trash/A note.md", text: "Just a note\n" },
	]);

	it("lists the trashed files by title with their place, none of them openable", () => {
		const model = list({ kind: "trash" }, context(new VaultIndex(), today, { trash }));
		expect(describeList(model)).toEqual([
			"# -",
			"    trashed | note | A note | [Not Started] | Note",
			"    trashed | area | Area X | [Not Started] | Area · deleted with 1 project and 1 task",
			"    trashed | task | Loose | [Not Started] | Loose task",
			"    trashed | project | Project Y | [Doing] | Area X",
			"    trashed | task | Task Z | [Doing] | Project Y",
		]);
		expect(visibleRows(model)).toEqual([]);
	});

	it("says so when empty", () => {
		expect(list({ kind: "trash" }, context(new VaultIndex(), today)).empty).toBe("Trash is empty");
	});
});

describe("search", () => {
	it("lists matching tasks with their place, notes with their folder and parents as cards", () => {
		const index = new VaultIndex([
			makeItem("Ta Da/projects/Garden.md", "type: project\nstatus: Doing"),
			makeItem("Ta Da/tasks/Water the garden.md", 'type: task\nstatus: Not Started\nproject: "[[Garden]]"'),
			makeItem("Notes/Garden ideas.md", ""),
			makeItem("Ta Da/tasks/Unrelated.md", "type: task\nstatus: Doing"),
		]);
		const model = list({ kind: "search", query: "garden" }, context(index, today));
		expect(model.header.detail).toBe("3 results");
		expect(describeList(model)).toEqual(["# -", "    project | Garden | card | 0 of 1 done · No area", "    note | Garden ideas | Notes", "    Water the garden | [Not Started] | in Garden"]);
		expect(list({ kind: "search", query: "zzz" }, context(index, today)).empty).toBe("No results");
	});
});

describe("domains", () => {
	it("reads saved domains and refuses anything else", () => {
		for (const domain of [{ kind: "today" }, { kind: "project", path: "p.md" }, { kind: "tag", path: null }, { kind: "tag", path: "a/b" }, { kind: "folder", path: "" }] as const) {
			expect(readDomain(JSON.parse(JSON.stringify(domain)))).toEqual(domain);
		}
		for (const bad of [null, "today", { kind: "search", query: "x" }, { kind: "project" }, { kind: "folder", path: 3 }, { kind: "nope" }]) {
			expect(readDomain(bad)).toBeNull();
		}
	});

	it("keys each list apart", () => {
		expect(new Set([{ kind: "tag", path: null }, { kind: "tag", path: "a" }, { kind: "folder", path: "a" }, { kind: "area", path: "a" }, { kind: "today" }].map((domain) => domainKey(domain as never))).size).toBe(5);
	});
});
