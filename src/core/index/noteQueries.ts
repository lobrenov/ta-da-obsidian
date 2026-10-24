import { folderOf } from "../storage/vault";
import type { Item } from "../model/item";
import { compareCodeUnits } from "../text";
import { byTitle, compareTitles, type VaultIndex } from "./vaultIndex";

/** A folder in the Notes tree, with the number of notes in it and its subfolders, and its subfolders by name. */
export interface FolderNode {
	/** Relative to the vault, for example `Meetings/2026`. */
	path: string;
	/** The last path segment. */
	name: string;
	count: number;
	children: FolderNode[];
}

// The Notes queries. Loose is the vault's top level, written as the folder `""`.

/**
 * The folders that hold a note at any depth, plus `folders` (those known to be on disk) and their parents, as a tree.
 * Each level is sorted by name, ignoring case.
 */
export function folderTree(index: VaultIndex, folders: ReadonlySet<string> = new Set()): FolderNode[] {
	const counts = new Map<string, number>();
	const addParents = (start: string, count: number): void => {
		for (let folder = start; folder !== ""; folder = folderOf(folder)) counts.set(folder, (counts.get(folder) ?? 0) + count);
	};
	for (const folder of folders) addParents(folder, 0);
	for (const [folder, paths] of index.notePathsByFolder) addParents(folder, paths.size);
	const byParent = new Map<string, string[]>();
	for (const path of counts.keys()) byParent.set(folderOf(path), (byParent.get(folderOf(path)) ?? []).concat(path));
	const nodes = (parent: string): FolderNode[] =>
		(byParent.get(parent) ?? [])
			.map((path) => ({ path, name: path.split("/").filter((part) => part !== "").pop() ?? "", count: counts.get(path) ?? 0, children: nodes(path) }))
			.sort(byName);
	return nodes("");
}

/** The notes straight in `folder` (`""` for Loose), not its subfolders, sorted by title. */
export function notesIn(index: VaultIndex, folder: string): Item[] {
	return [...(index.notePathsByFolder.get(folder) ?? [])].flatMap((path) => index.get(path) ?? []).sort(byTitle);
}

/** The notes at the vault's top level, sorted by title. */
export function looseNotes(index: VaultIndex): Item[] {
	return notesIn(index, "");
}

function byName(a: FolderNode, b: FolderNode): number {
	return compareTitles(a.name, b.name) || compareCodeUnits(a.path, b.path);
}
