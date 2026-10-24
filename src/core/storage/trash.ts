import type { Item } from "../model/item";
import { linkTitle } from "../model/wikiLink";
import { parseItem } from "../parsing/parseItem";
import { byTitle } from "../index/vaultIndex";
import { identityKey } from "../text";

/** A Ta Da file or note in the vault's `.trash/` folder. Its path is in `.trash/`. */
export interface TrashedItem {
	item: Item;
}

/**
 * The Ta Da files and notes among `files` (path and text, each in `.trash/`), by title. Hidden files and files in
 * hidden folders inside `.trash/` are left out.
 */
export function trashedItems(files: { path: string; text: string }[]): TrashedItem[] {
	const trashed: TrashedItem[] = [];
	for (const { path, text } of files) {
		if (!path.toLowerCase().endsWith(".md")) continue;
		if (path.split("/").slice(1).some((part) => part.startsWith("."))) continue;
		const item = parseItem(text, path);
		if (item) trashed.push({ item });
	}
	return trashed.sort((a, b) => byTitle(a.item, b.item));
}

/** Trashed tasks whose `project` link names this trashed project, sorted by title. */
export function tasksOf(project: Item, trashed: TrashedItem[]): TrashedItem[] {
	const title = identityKey(project.title);
	return trashed
		.filter(({ item }) => item.properties.kind === "task" && item.properties.project !== null && identityKey(linkTitle(item.properties.project)) === title)
		.sort((a, b) => byTitle(a.item, b.item));
}

/**
 * Trashed projects whose `area` link names this trashed area, and trashed tasks filed under the area or those
 * projects, each sorted by title.
 */
export function contentsOf(area: Item, trashed: TrashedItem[]): { projects: TrashedItem[]; tasks: TrashedItem[] } {
	const title = identityKey(area.title);
	const filed = trashed
		.filter(({ item }) => item.properties.area !== null && identityKey(linkTitle(item.properties.area)) === title)
		.sort((a, b) => byTitle(a.item, b.item));
	const projects = filed.filter(({ item }) => item.properties.kind === "project");
	const tasks = filed.filter(({ item }) => item.properties.kind === "task").concat(projects.flatMap((project) => tasksOf(project.item, trashed)));
	return { projects, tasks };
}
