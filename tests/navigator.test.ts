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

describe("Agenda day", () => {
	const ctx = context(loadFixtureIndex("DesignVault"), today);
	const day = { kind: "agenda" } as const;

	it("groups today by project, tasks without a parent first, with the dates the Agenda shows", () => {
		const model = list(day, ctx);
		expect(model.strip).toBeDefined();
		expect(model.grouping).toBe("Project");
		expect(model.groupList).toBe("agenda");
		expect(describeList(model)).toEqual([
			"# day Friday 2 October (Today)",
			"# scheduled",
			"# -",
			"    Message Max about a coat and a jacket | [Not Started]",
			"    Resolve the cabin payback | [Doing] | 1/2 | deadline Today (overdue)",
			"    Shift my physio appointment | [Blocked]",
			"    Submit timesheet | [Not Started]",
			"    Update my claude.md files | [Doing] | 2/5 | deadline 4 days left",
			"# project Atlas Billing 1 (Work)",
			"    Create a system testing plan | [Not Started] | 0/4 | deadline Today (overdue)",
			"# project Game Jam - Starfall 1 (Game Jams)",
			"    Update Dan’s website for Starfall | [Doing] | 1/3 | deadline 6 days left",
		]);
	});

	it("names each task's place under Status and Open, where no group names it", () => {
		const model = list(day, ctx, { groupings: { agenda: "Status" } });
		expect(describeList(model).slice(2)).toEqual([
			"# Doing 3",
			"    Resolve the cabin payback | [Doing] | 1/2 | deadline Today (overdue)",
			"    Update Dan’s website for Starfall | [Doing] | in Game Jam - Starfall | 1/3 | deadline 6 days left",
			"    Update my claude.md files | [Doing] | 2/5 | deadline 4 days left",
			"# Blocked 1",
			"    Shift my physio appointment | [Blocked]",
			"# Not Started 3",
			"    Create a system testing plan | [Not Started] | in Atlas Billing | 0/4 | deadline Today (overdue)",
			"    Message Max about a coat and a jacket | [Not Started]",
			"    Submit timesheet | [Not Started]",
		]);
		expect(list(day, ctx, { groupings: { agenda: "Open" } }).sections.map((s) => s.id)).toEqual(["agenda:day", "agenda:scheduled", "agenda|Open"]);
	});

	it("lists a task completed today in Completed, folded under Status", () => {
		const index = new VaultIndex([
			makeItem("Ta Da/tasks/Finished.md", "type: task\nstatus: Done\ncompletedDate: 2026-10-02"),
			makeItem("Ta Da/tasks/Due.md", "type: task\nstatus: Not Started\ndueDate: 2026-10-02"),
		]);
		const status = list(day, context(index, today), { groupings: { agenda: "Status" } });
		expect(describeList(status).slice(2)).toEqual(["# Not Started 1", "    Due | [Not Started]", "+ quiet Done 1", "    Finished | [Done]"]);
		const opened = list(day, context(index, today), { groupings: { agenda: "Status" }, folds: new Set(["agenda|Status: Done"]) });
		expect(opened.sections.slice(2).map((section) => section.folded)).toEqual([false, false]);
	});

	it("lists another day's tasks due or at their deadline that day, and names it relative to today", () => {
		const onDay = (date: string): string[] => {
			const selection = { kind: "day", date: LocalDate.parse(date) as LocalDate } as const;
			return describeList(list(day, context(loadFixtureIndex("DesignVault"), today, { agenda: { selection, monthOpen: false } })));
		};
		expect(onDay("2026-10-06")).toEqual(["# day Tuesday 6 October", "# scheduled", "# -", "    Update my claude.md files | [Doing] | 2/5 | deadline 4 days left"]);
		expect(onDay("2026-10-03")[0]).toBe("# day Saturday 3 October (Tomorrow)");
		expect(onDay("2026-10-01")).toEqual(["# day Thursday 1 October (Yesterday) {Nothing scheduled}"]);
	});

	it("says nothing is scheduled on an empty day", () => {
		const model = list(day, context(new VaultIndex(), today));
		expect(describeList(model)).toEqual(["# day Friday 2 October (Today) {Nothing scheduled}"]);
		expect(model.filter).toBeNull();
	});

	it("falls back to the default when a list's saved grouping isn't one of its choices", () => {
		expect(groupingOf("agenda", { agenda: "Date" })).toBe("Project");
		expect(groupingOf("loose", { loose: "Date" })).toBe("Date");
	});
});

describe("Agenda week", () => {
	const week = (index: VaultIndex) => list({ kind: "agenda" }, context(index, today, { agenda: { selection: { kind: "week", week: today.isoWeek }, monthOpen: false } }));

	it("lists a row for each day, then what's due in the week with the date each is listed for", () => {
		const model = week(loadFixtureIndex("DesignVault"));
		expect(model.groupList).toBeNull();
		expect(model.filter).toBeNull();
		expect(describeList(model)).toEqual([
			"# week Week 40 28 Sep – 4 Oct (this week)",
			"# -",
			"    day | Mon 28",
			"    day | Tue 29",
			"    day | Wed 30",
			"    day | Thu 1",
			"    day | Fri 2 | 7 due | dot | today",
			"    day | Sat 3 | 1 due | dot",
			"    day | Sun 4",
			"# Due this week",
			"    Frontmatter schema for tasks and projects | [Done] | in Ta Da MVP",
			"    Message Max about a coat and a jacket | [Not Started] | due Today",
			"    Shift my physio appointment | [Blocked] | due Today",
			"    Submit timesheet | [Not Started] | due Today",
			"    Update Dan’s website for Starfall | [Doing] | in Game Jam - Starfall | 1/3 | due Today",
			"    Update my claude.md files | [Doing] | 2/5 | due Today",
			"    Create a system testing plan | [Not Started] | in Atlas Billing | 0/4 | deadline Today (overdue)",
			"    Resolve the cabin payback | [Doing] | 1/2 | deadline Today (overdue)",
			"    Update 2DS before the next session | [Not Started] | due Sat",
		]);
		expect(model.sections[2]?.header).toEqual({ style: "archive", title: "Due this week", note: null });
	});

	it("has no file in a day's row, so the arrow keys pass it", () => {
		const model = week(loadFixtureIndex("DesignVault"));
		expect(visibleRows(model).every((row) => row.type === "task")).toBe(true);
	});

	it("lists a task on each of its dates in the week", () => {
		const index = new VaultIndex([makeItem("Ta Da/tasks/Both.md", "type: task\nstatus: Doing\ndueDate: 2026-09-29\ndeadline: 2026-10-01")]);
		const model = week(index);
		expect(describeList(model).slice(-3)).toEqual(["# Due this week", "    Both | [Doing] | due 29 Sep (overdue)", "    Both | [Doing] | deadline 1 day late (overdue)"]);
		expect(model.sections[2]?.rows.map((row) => row.id)).toEqual(["Ta Da/tasks/Both.md#due", "Ta Da/tasks/Both.md#deadline"]);
		expect(visiblePaths(model)).toEqual(["Ta Da/tasks/Both.md"]);
	});

	it("leaves out the due section when nothing is due", () => {
		expect(week(new VaultIndex()).sections.map((section) => section.id)).toEqual(["agenda:week", "agenda:days"]);
	});
});

describe("Loose tasks", () => {
	it("groups by Status by default and shows the date itself", () => {
		const model = list({ kind: "loose" }, context(loadFixtureIndex("DesignVault"), today));
		expect(model.groupList).toBe("loose");
		expect(describeList(model)).toEqual([
			"# Doing 2",
			"    Resolve the cabin payback | [Doing] | 1/2 | deadline Today (overdue)",
			"    Update my claude.md files | [Doing] | 2/5 | deadline Tue",
			"# Blocked 1",
			"    Shift my physio appointment | [Blocked] | due Today",
			"# Not Started 3",
			"    Message Max about a coat and a jacket | [Not Started] | due Today",
			"    Submit timesheet | [Not Started] | due Today",
			"    Update 2DS before the next session | [Not Started] | due Sat",
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

	it("groups the Agenda by area, each area's projects under it, and a project's missing area beside its name", () => {
		expect(describeList(list({ kind: "agenda" }, ctx))).toEqual([
			"# day Friday 2 October (Today)",
			"# scheduled",
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
			"    Both keys | [Not Started] | due 1 Oct (overdue)",
			"    Build the sidebar | [Doing]",
			"# area Work 0",
			"# sub Payroll 1",
			"    Run payroll | [Not Started] | deadline Today (overdue)",
		]);
	});

	it("shows an area's projects, then its own open tasks, then its Completed folded", () => {
		const model = list({ kind: "area", path: "areas/Personal.md" }, ctx);
		expect(model.header.title).toBe("Personal");
		expect(model.header.lines).toEqual(["2 projects · 2 tasks"]);
		expect(model.header.file).toEqual({ path: "areas/Personal.md", label: "Open area file" });
		expect(describeList(model)).toEqual(["# -", "    project | Garden | line", "    project | Ta Da | line | 2 open", "# -", "    Book a dentist | [Not Started]", "    Pay rent | [Not Started] | due Today"]);
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
		expect(describeList(model)).toEqual(["# Open 2", "    Both keys | [Not Started] | due 1 Oct (overdue)", "    Build the sidebar | [Doing] | due Today"]);
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

	it("filters the Agenda's day and an area's projects and tasks", () => {
		const dated = new VaultIndex([
			makeItem("Ta Da/areas/Home.md", "type: area"),
			makeItem("Ta Da/tasks/A.md", "type: task\nstatus: Not Started\ndueDate: 2026-10-05\ntags: [x]"),
			makeItem("Ta Da/tasks/B.md", 'type: task\nstatus: Not Started\ndueDate: 2026-10-05\narea: "[[Home]]"'),
			makeItem("Ta Da/projects/P.md", 'type: project\nstatus: Doing\narea: "[[Home]]"\ntags: [x]'),
		]);
		const onDay = { kind: "day", date: date("2026-10-05") } as const;
		const agenda = list({ kind: "agenda" }, context(dated, today, { agenda: { selection: onDay, monthOpen: false } }), { picked: new Set(["x"]) });
		expect(describeList(agenda).slice(2)).toEqual(["# -", "    A | [Not Started] | 1 tag"]);
		expect(agenda.filter).toMatchObject({ shown: 1, total: 2 });
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
		expect(describeList(model)).toEqual(["# -", "    project | Garden | card | 0 of 1 done · No area", "    note | Garden ideas | Notes", "    Water the garden | [Not Started]"]);
		expect(list({ kind: "search", query: "zzz" }, context(index, today)).empty).toBe("No results");
	});
});

describe("domains", () => {
	it("reads saved domains and refuses anything else", () => {
		for (const domain of [{ kind: "agenda" }, { kind: "project", path: "p.md" }, { kind: "tag", path: null }, { kind: "tag", path: "a/b" }, { kind: "folder", path: "" }] as const) {
			expect(readDomain(JSON.parse(JSON.stringify(domain)))).toEqual(domain);
		}
		expect(readDomain({ kind: "today" })).toEqual({ kind: "agenda" });
		expect(readDomain({ kind: "upcoming" })).toEqual({ kind: "agenda" });
		for (const bad of [null, "today", { kind: "search", query: "x" }, { kind: "project" }, { kind: "folder", path: 3 }, { kind: "nope" }]) {
			expect(readDomain(bad)).toBeNull();
		}
	});

	it("keys each list apart", () => {
		expect(new Set([{ kind: "tag", path: null }, { kind: "tag", path: "a" }, { kind: "folder", path: "a" }, { kind: "area", path: "a" }, { kind: "agenda" }].map((domain) => domainKey(domain as never))).size).toBe(5);
	});
});
