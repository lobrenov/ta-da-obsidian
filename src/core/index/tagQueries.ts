import type { Item } from "../model/item";
import { isClosed } from "../model/status";
import { isTagAncestor, type Tag, tagLeaf, tagParent } from "../model/tag";
import { compareCodeUnits, identityKey } from "../text";
import { grouped, type TaskGroup } from "./queries";
import { byTitle, compareTitles, type VaultIndex } from "./vaultIndex";

/** A tag in the tag tree, with the number of files carrying it or any child of it, and its children by name. */
export interface TagNode {
	tag: Tag;
	count: number;
	children: TagNode[];
}

/** What a tag's page lists, or Untagged's. */
export interface TagBrowser {
	/** The areas by title, then the projects by title. */
	areasAndProjects: Item[];
	/** Open tasks in Today's groups, with the tasks without a parent last. */
	groups: TaskGroup[];
	/** Done and Cancelled tasks, by title. */
	completed: Item[];
	/** Notes, by title. */
	notes: Item[];
	/** The tag's children in the tag tree; none for Untagged. */
	children: TagNode[];
}

// The tag queries. A file is tagged by its own tags only, never its parent's. Logged files aren't counted.

/**
 * Every carried tag and its parents, as a tree. Each level is sorted by name, ignoring case. A parent carried by no
 * file takes its spelling from a child.
 */
export function tagTree(index: VaultIndex): TagNode[] {
	const tags = new Map<string, Tag>();
	const carriers = new Map<string, Set<string>>();
	for (const tag of index.carriedTags.sort((a, b) => compareCodeUnits(a.path, b.path))) {
		const paths = index.pathsCarrying(tag.path);
		let node: Tag | null = tag;
		while (node) {
			if (!tags.has(node.path)) tags.set(node.path, node);
			const set = carriers.get(node.path) ?? new Set<string>();
			for (const path of paths) set.add(path);
			carriers.set(node.path, set);
			node = tagParent(node);
		}
	}
	const byParent = new Map<string, Tag[]>();
	for (const tag of tags.values()) {
		const key = tagParent(tag)?.path ?? "";
		byParent.set(key, (byParent.get(key) ?? []).concat(tag));
	}
	const nodes = (parent: string): TagNode[] =>
		(byParent.get(parent) ?? []).sort(byLeaf).map((tag) => ({ tag, count: carriers.get(tag.path)?.size ?? 0, children: nodes(tag.path) }));
	return nodes("");
}

/** Items that aren't logged and carry the tag or any child of it, sorted by title. */
export function itemsTagged(index: VaultIndex, tag: Tag): Item[] {
	const paths = new Set<string>();
	for (const carried of index.carriedTags) {
		if (carried.path !== tag.path && !isTagAncestor(tag, carried)) continue;
		for (const path of index.pathsCarrying(carried.path)) paths.add(path);
	}
	return [...paths].flatMap((path) => index.get(path) ?? []).sort(byTitle);
}

/** Areas, projects, tasks and notes that aren't logged and carry no tag, sorted by title. */
export function untagged(index: VaultIndex): Item[] {
	return index.liveItems.filter((item) => item.tags.length === 0).sort(byTitle);
}

/** The page for a tag, including its children's files, or for Untagged when `tag` is null. */
export function tagBrowser(index: VaultIndex, tag: Tag | null): TagBrowser {
	const files = tag ? itemsTagged(index, tag) : untagged(index);
	const tasks = files.filter((item) => item.properties.kind === "task");
	const groups = grouped(index, tasks.filter((task) => !isClosed(task.properties.status)));
	const loose = groups.findIndex((group) => group.parent === null);
	if (loose >= 0) groups.push(...groups.splice(loose, 1));
	return {
		areasAndProjects: files.filter((item) => item.properties.kind === "area").concat(files.filter((item) => item.properties.kind === "project")),
		groups,
		completed: tasks.filter((task) => isClosed(task.properties.status)),
		notes: files.filter((item) => item.properties.kind === "note"),
		children: (tag ? nodeFor(tag, tagTree(index)) : null)?.children ?? [],
	};
}

/**
 * Tags for autocomplete: those with a segment starting with the query, ignoring case. Tags whose first segment matches
 * come first, then the most used, then by path. At most `limit`.
 */
export function tagSuggestions(index: VaultIndex, query: string, limit = 50): TagNode[] {
	const wanted = identityKey(query);
	const matches: { node: TagNode; first: boolean }[] = [];
	const visit = (nodes: TagNode[]): void => {
		for (const node of nodes) {
			const path = node.tag.path;
			const starts = [0];
			for (let at = path.indexOf("/"); at >= 0; at = path.indexOf("/", at + 1)) starts.push(at + 1);
			const start = starts.find((offset) => path.startsWith(wanted, offset));
			if (start !== undefined) matches.push({ node: { tag: node.tag, count: node.count, children: [] }, first: start === 0 });
			visit(node.children);
		}
	};
	visit(tagTree(index));
	return matches
		.sort((a, b) => {
			if (a.first !== b.first) return a.first ? -1 : 1;
			if (a.node.count !== b.node.count) return b.node.count - a.node.count;
			return compareCodeUnits(a.node.tag.path, b.node.tag.path);
		})
		.slice(0, limit)
		.map((match) => match.node);
}

function nodeFor(tag: Tag, nodes: TagNode[]): TagNode | null {
	for (const node of nodes) {
		if (node.tag.path === tag.path) return node;
		if (isTagAncestor(node.tag, tag)) return nodeFor(tag, node.children);
	}
	return null;
}

function byLeaf(a: Tag, b: Tag): number {
	return compareTitles(tagLeaf(a), tagLeaf(b)) || compareCodeUnits(a.path, b.path);
}
