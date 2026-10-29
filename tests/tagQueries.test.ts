import { describe, expect, it } from "vitest";
import { type TagNode, itemsTagged, tagBrowser, tagSuggestions, tagTree, untagged } from "../src/core/index/tagQueries";
import { readTag, type Tag } from "../src/core/model/tag";
import type { TaskGroup } from "../src/core/index/queries";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { loadFixtureIndex } from "./fixtureVault";
import { makeItem, titles } from "./support";

const index = loadFixtureIndex("TagVault");
const tag = (text: string): Tag => readTag(text) as Tag;

function describeNodes(nodes: TagNode[], depth = 0): string[] {
	return nodes.flatMap((node) => [`${"  ".repeat(depth)}${node.tag.name} ${node.count}`, ...describeNodes(node.children, depth + 1)]);
}

const groups = (list: TaskGroup[]): string[] =>
	list.map((group) => `${group.parent?.title ?? "Loose"}: ${titles(group.tasks).join(", ")}`);

describe("tag queries on TagVault", () => {
	it("rolls counts up the tag tree and leaves out trashed files", () => {
		expect(describeNodes(tagTree(index))).toEqual([
			"errands 4",
			"Home 4",
			"  home/garden 3",
			"logged-only 1",
			"people 2",
			"  people/dan 1",
			"  People/Max 1",
			"quick win 2",
			"Work 2",
			"  Work/Clients 2",
		]);
	});

	it("lists items tagged with a tag or its children", () => {
		expect(titles(itemsTagged(index, tag("home")))).toEqual(["Buy mulch", "Garden", "Home", "Prune the lemon tree"]);
		expect(titles(itemsTagged(index, tag("HOME/GARDEN")))).toEqual(["Buy mulch", "Garden", "Prune the lemon tree"]);
		expect(titles(itemsTagged(index, tag("logged-only")))).toEqual(["Old errand"]);
		expect(titles(itemsTagged(index, tag("errands")))).toContain("Old errand");
		expect(itemsTagged(index, tag("trashed-only"))).toEqual([]);
	});

	it("lists every live file without a tag as untagged", () => {
		expect(titles(untagged(index))).toEqual(["Untagged task", "Work"]);
	});

	it("lists parents, then open tasks with loose last, then completed", () => {
		const errands = tagBrowser(index, tag("errands"));
		expect(errands.areasAndProjects).toEqual([]);
		expect(titles(errands.completed)).toEqual(["Old errand"]);
		expect(errands.children).toEqual([]);
		expect(groups(errands.groups)).toEqual(["Home: ", "Garden: Buy mulch, Prune the lemon tree", "Loose: Message Max"]);

		const home = tagBrowser(index, tag("Home"));
		expect(titles(home.areasAndProjects)).toEqual(["Home", "Garden"]);
		expect(home.children.map((node) => node.tag.name)).toEqual(["home/garden"]);

		const people = tagBrowser(index, tag("people"));
		expect(groups(people.groups)).toEqual(["Loose: Message Max"]);
		expect(titles(people.completed)).toEqual(["Call Dan"]);
		expect(people.children.map((node) => `${node.tag.name} ${node.count}`)).toEqual(["people/dan 1", "People/Max 1"]);

		const none = tagBrowser(index, null);
		expect(titles(none.areasAndProjects)).toEqual(["Work"]);
		expect(groups(none.groups)).toEqual(["Loose: Untagged task"]);
		expect(none.children).toEqual([]);
	});

	it("suggests segment starts, first segment first, then by use", () => {
		const names = (query: string, limit?: number): string[] => tagSuggestions(index, query, limit).map((node) => node.tag.name);
		expect(names("pe")).toEqual(["people", "people/dan", "People/Max"]);
		expect(names("gar")).toEqual(["home/garden"]);
		expect(names("C")).toEqual(["Work/Clients"]);
		expect(names("w")).toEqual(["Work", "Work/Clients"]);
		expect(names("logged")).toEqual(["logged-only"]);
		expect(names("win")).toEqual([]);
		expect(names("home/g")).toEqual(["home/garden"]);
		expect(names("")).toEqual(["errands", "Home", "home/garden", "people", "quick win", "Work", "Work/Clients", "logged-only", "people/dan", "People/Max"]);
		expect(names("", 2)).toEqual(["errands", "Home"]);
	});
});

describe("tags and logged files", () => {
	it("counts logged files as carriers and follows their edits", () => {
		const logged = makeItem("Ta Da/logbook/2026-09/Done chore.md", "type: task\nstatus: Done\ntags: [chore, shared]");
		const loggedProject = makeItem("Ta Da/logbook/2026-09/Old plan.md", "type: project\nstatus: Done\ntags: [chore]");
		const live = makeItem("tasks/Live.md", "type: task\nstatus: Not Started\ntags: [shared]");
		const small = new VaultIndex([logged, loggedProject, live]);
		expect(describeNodes(tagTree(small))).toEqual(["chore 2", "shared 2"]);
		expect(tagSuggestions(small, "ch").map((node) => node.tag.name)).toEqual(["chore"]);
		const chore = tagBrowser(small, tag("chore"));
		expect([titles(chore.completed), titles(chore.areasAndProjects)]).toEqual([["Done chore"], ["Old plan"]]);
		expect(untagged(small)).toEqual([]);
		expect(titles(itemsTagged(small, tag("shared")))).toEqual(["Done chore", "Live"]);

		small.update(makeItem(logged.path, "type: task\nstatus: Done\ntags: [other]"));
		expect(describeNodes(tagTree(small))).toEqual(["chore 1", "other 1", "shared 1"]);
		small.remove(logged.path);
		expect(describeNodes(tagTree(small))).toEqual(["chore 1", "shared 1"]);
	});
});
