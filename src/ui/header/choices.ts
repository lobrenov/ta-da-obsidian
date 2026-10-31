import type { Item, Kind } from "../../core/model/item";
import { isClosed } from "../../core/model/status";
import { readTag, type Tag } from "../../core/model/tag";
import { compareTitles } from "../../core/index/vaultIndex";
import { identityKey } from "../../core/text";
import type { Parent } from "../../core/writing/parent";

/** One line of the project or area menu. `parent` null is None. */
export interface ParentChoice {
	parent: Parent | null;
	label: string;
	/** The area a project sits under. */
	detail: string | null;
	current: boolean;
}

/** The index as the menus read it. */
export interface ParentSource {
	projects: Item[];
	areas: Item[];
	areaOf(item: Item): Item | null;
}

/**
 * None, then for a task the projects without an area, then each area followed by its projects; for a project the
 * areas. Completed projects are left out unless the file is filed under one. The current choice is marked, never hidden.
 */
export function parentChoices(kind: Kind, source: ParentSource, current: Parent | null, noneCurrent = true): ParentChoice[] {
	const isCurrent = (parent: Parent): boolean =>
		current !== null && current.kind === parent.kind && identityKey(current.title) === identityKey(parent.title);
	const choice = (parent: Parent, detail: string | null): ParentChoice => ({
		parent,
		label: parent.title,
		detail,
		current: isCurrent(parent),
	});
	const choices: ParentChoice[] = [{ parent: null, label: "None", detail: null, current: current === null && noneCurrent }];
	const areas = [...source.areas].sort(byTitle);
	if (kind === "project") {
		for (const area of areas) choices.push(choice({ kind: "area", title: area.title }, null));
		return choices;
	}
	if (kind !== "task") return choices;
	const projects = source.projects
		.filter((project) => !isClosed(project.properties.status) || isCurrent({ kind: "project", title: project.title }))
		.sort(byTitle);
	const under = (area: Item | null): Item[] => projects.filter((project) => source.areaOf(project)?.path === area?.path);
	for (const project of under(null)) choices.push(choice({ kind: "project", title: project.title }, null));
	for (const area of areas) {
		choices.push(choice({ kind: "area", title: area.title }, null));
		for (const project of under(area)) choices.push(choice({ kind: "project", title: project.title }, area.title));
	}
	return choices;
}

/** One line of the tag menu. */
export interface TagChoice {
	name: string;
	/** The file's `tags:` already has it; picking it removes it. */
	current: boolean;
	/** Typed text that no tag in the vault has. */
	isNew: boolean;
}

/** The index's tags, then Obsidian's tags (`#` and as written) for the paths the index doesn't have. */
export function pickerTags(carried: Tag[], obsidianTags: Record<string, number>): Tag[] {
	const seen = new Set(carried.map((tag) => tag.path));
	const extra = Object.keys(obsidianTags).flatMap((key) => readTag(key) ?? []).filter((tag) => !seen.has(tag.path) && seen.add(tag.path));
	return [...carried, ...extra];
}

/**
 * The tags in the vault by name, plus the typed query as a new tag when it names none of them. The ones on the file
 * are marked, never hidden.
 */
export function tagChoices(vaultTags: { name: string; path: string }[], onFile: string[], query: string): TagChoice[] {
	const here = new Set(onFile.map((name) => readTag(name)?.path ?? ""));
	const typed = readTag(query);
	const needle = typed?.path ?? identityKey(query.trim().replace(/^#/, ""));
	const names = new Map<string, string>();
	for (const tag of vaultTags) if (!names.has(tag.path)) names.set(tag.path, tag.name);
	const list: TagChoice[] = [...names]
		.filter(([path]) => path.includes(needle))
		.sort((a, b) => compareTitles(a[1], b[1]))
		.map(([path, name]) => ({ name, current: here.has(path), isNew: false }));
	if (typed && !names.has(typed.path)) list.unshift({ name: typed.name, current: here.has(typed.path), isNew: true });
	return list;
}

function byTitle(a: Item, b: Item): number {
	return compareTitles(a.title, b.title);
}
