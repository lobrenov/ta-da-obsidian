import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { ancestorsOf, buildNav, type NavItem } from "../src/ui/navigator/navModel";
import { moveSelection } from "../src/ui/navigator/selection";
import { visiblePaths } from "../src/ui/navigator/listModel";
import { loadFixtureIndex } from "./fixtureVault";
import { context, list } from "./navigatorSupport";
import { makeItem } from "./support";

const today = LocalDate.parse("2026-10-02") as LocalDate;

const describeItems = (items: NavItem[]): string[] =>
	items.map((item) => `${"  ".repeat(item.depth)}${item.expanded === null ? "" : item.expanded ? "v " : "> "}${item.label}${item.count ? ` ${item.count}` : ""}`);

describe("navigation pane", () => {
	it("counts the open tasks due today under Agenda, Loose tasks and Trash beside the domains", () => {
		const nav = buildNav(context(loadFixtureIndex("DesignVault"), today), "tasks", new Set());
		expect(describeItems(nav.domains)).toEqual(["Agenda 7", "Loose tasks 6", "Logbook", "Trash"]);
		expect(nav.domains.map((item) => item.domain.kind)).toEqual(["agenda", "loose", "logbook", "trash"]);
	});

	it("leaves a task completed today out of the Agenda's count", () => {
		const index = new VaultIndex([makeItem("Ta Da/tasks/A.md", "type: task\nstatus: Done\ncompletedDate: 2026-10-02"), makeItem("Ta Da/tasks/B.md", "type: task\nstatus: Doing\ndueDate: 2026-10-01")]);
		expect(buildNav(context(index, today), "tasks", new Set()).domains[0]?.count).toBe(1);
	});

	it("lists loose projects, then each area with its active projects at the same left edge, a gap before each area", () => {
		const nav = buildNav(context(loadFixtureIndex("AreaVault"), today), "tasks", new Set());
		expect(describeItems(nav.tree)).toEqual(["Lost 1", "Side quest 1", "Empty", "Personal", "Ta Da 2", "Work", "Payroll 1"]);
		expect(nav.tree.every((item) => item.depth === 0)).toBe(true);
		expect(nav.tree.filter((item) => item.gap).map((item) => item.label)).toEqual(["Empty", "Personal", "Work"]);
		expect(nav.tree.filter((item) => item.strong).map((item) => item.label)).toEqual(["Empty", "Personal", "Work"]);
	});

	it("lists Untagged and the tag tree, opening a parent's children only when it's expanded", () => {
		const ctx = context(loadFixtureIndex("TagVault"), today);
		expect(describeItems(buildNav(ctx, "tags", new Set()).tree)).toEqual(["Untagged 2", "errands 3", "> Home 4", "> people 2", "quick win 2", "> Work 2"]);
		expect(describeItems(buildNav(ctx, "tags", new Set(["tag:home", "tag:work"])).tree)).toEqual([
			"Untagged 2",
			"errands 3",
			"v Home 4",
			"  garden 3",
			"> people 2",
			"quick win 2",
			"v Work 2",
			"  Clients 2",
		]);
	});

	it("lists Loose and the folder tree, with folders on disk that hold no note", () => {
		const ctx = context(loadFixtureIndex("NoteVault"), today, { folders: new Set(["Empty", "Docs"]) });
		expect(describeItems(buildNav(ctx, "notes", new Set(["folder:Meetings"])).tree)).toEqual(["Loose 2", "Docs", "Empty", "v Meetings 2", "  2026 1", "> Work 1"]);
	});

	it("names the rows above a nested tag or folder, which open to show it", () => {
		expect(ancestorsOf({ kind: "tag", path: "work/clients" })).toEqual(["tag:work"]);
		expect(ancestorsOf({ kind: "folder", path: "A/B/C" })).toEqual(["folder:A", "folder:A/B"]);
		expect(ancestorsOf({ kind: "tag", path: null })).toEqual([]);
		expect(ancestorsOf({ kind: "agenda" })).toEqual([]);
	});
});

describe("selection", () => {
	const paths = ["a.md", "b.md", "c.md"];

	it("moves down and up and stops at the ends", () => {
		expect(moveSelection(paths, "a.md", 1)).toBe("b.md");
		expect(moveSelection(paths, "c.md", 1)).toBe("c.md");
		expect(moveSelection(paths, "b.md", -1)).toBe("a.md");
		expect(moveSelection(paths, "a.md", -1)).toBe("a.md");
	});

	it("starts at the first row going down and the last going up when nothing in the list is selected", () => {
		expect(moveSelection(paths, null, 1)).toBe("a.md");
		expect(moveSelection(paths, null, -1)).toBe("c.md");
		expect(moveSelection(paths, "elsewhere.md", 1)).toBe("a.md");
		expect(moveSelection([], "a.md", 1)).toBeNull();
	});

	it("skips folded rows, in the order the list shows them", () => {
		const ctx = context(loadFixtureIndex("AreaVault"), today);
		const model = list({ kind: "project", path: "projects/Garden.md" }, ctx, { groupings: { project: "Date" } });
		expect(visiblePaths(model)).toEqual([]);
		const area = list({ kind: "agenda" }, ctx);
		const shown = visiblePaths(area);
		expect(shown[0]).toBe("tasks/Buy milk.md");
		expect(moveSelection(shown, shown[0] ?? null, 1)).toBe(shown[1]);
		expect(moveSelection(shown, shown[shown.length - 1] ?? null, 1)).toBe(shown[shown.length - 1]);
	});
});
