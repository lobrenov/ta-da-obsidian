import { describe, expect, it } from "vitest";
import { type TagNode, itemsTagged, tagBrowser, tagSuggestions, tagTree, untagged } from "../src/core/index/tagQueries";
import { readTag, type Tag } from "../src/core/model/tag";
import type { TaskGroup } from "../src/core/index/queries";
import { loadFixtureIndex } from "./fixtureVault";
import { titles } from "./support";

const index = loadFixtureIndex("TagVault");
const tag = (text: string): Tag => readTag(text) as Tag;

function describeNodes(nodes: TagNode[], depth = 0): string[] {
	return nodes.flatMap((node) => [`${"  ".repeat(depth)}${node.tag.name} ${node.count}`, ...describeNodes(node.children, depth + 1)]);
}

const groups = (list: TaskGroup[]): string[] =>
	list.map((group) => `${group.parent?.title ?? "Loose"}: ${titles(group.tasks).join(", ")}`);

describe("tag queries on TagVault", () => {
	it("rolls counts up the tag tree and leaves out logged and trashed files", () => {
		expect(describeNodes(tagTree(index))).toEqual([
			"errands 3",
			"Home 4",
			"  home/garden 3",
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
		expect(itemsTagged(index, tag("logged-only"))).toEqual([]);
		expect(itemsTagged(index, tag("trashed-only"))).toEqual([]);
	});

	it("lists every file without a tag as untagged", () => {
		expect(titles(untagged(index))).toEqual(["Untagged task", "Work"]);
	});

	it("lists parents, then open tasks with loose last, then completed", () => {
		const errands = tagBrowser(index, tag("errands"));
		expect(errands.areasAndProjects).toEqual([]);
		expect(errands.completed).toEqual([]);
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
		expect(names("win")).toEqual([]);
		expect(names("home/g")).toEqual(["home/garden"]);
		expect(names("")).toEqual(["Home", "errands", "home/garden", "people", "quick win", "Work", "Work/Clients", "people/dan", "People/Max"]);
		expect(names("", 2)).toEqual(["Home", "errands"]);
	});
});
