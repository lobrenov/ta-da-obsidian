import type { VaultIndex } from "../core/index/vaultIndex";
import type { Item } from "../core/model/item";
import type { LocalDate } from "../core/model/localDate";
import { identityKey } from "../core/text";
import type { Parent } from "../core/writing/parent";

/** What a set of files is, for the items the file menus offer: all tasks, all projects, a mix, or not all Ta Da tasks and projects (null). */
export function fileSetKind(index: VaultIndex, paths: readonly string[]): "task" | "project" | "mixed" | null {
	const kinds = new Set<string>();
	for (const path of paths) {
		const kind = index.get(path)?.properties.kind;
		if (kind !== "task" && kind !== "project") return null;
		kinds.add(kind);
	}
	return kinds.size === 0 ? null : kinds.size === 1 ? (kinds.has("task") ? "task" : "project") : "mixed";
}

/** The date every item has for `key`, null when they differ or have none. */
export function agreedDate(items: readonly Item[], key: "dueDate" | "deadline"): LocalDate | null {
	const [first, ...rest] = items.map((item) => item.properties[key]);
	if (!first) return null;
	return rest.every((date) => date?.equals(first)) ? first : null;
}

/** Whether two parents are the same project or area, by kind and title. */
export function sameParent(a: Parent | null, b: Parent | null): boolean {
	return a === null || b === null ? a === b : a.kind === b.kind && identityKey(a.title) === identityKey(b.title);
}

/** The parent every file has (null for none), or undefined when they differ. */
export function agreedParent(parents: readonly (Parent | null)[]): Parent | null | undefined {
	const [first, ...rest] = parents;
	if (first === undefined) return undefined;
	return rest.every((parent) => sameParent(parent, first)) ? first : undefined;
}

/**
 * The parent a drop of `paths` onto a project or area row files them under: tasks go onto a project or area, projects
 * onto an area. Null refuses it: a mix, a file that isn't a task or project, or a project onto a project.
 */
export function dropParent(index: VaultIndex, paths: readonly string[], target: { kind: "project" | "area"; path: string }): Parent | null {
	const kind = fileSetKind(index, paths);
	const title = index.get(target.path)?.title;
	if (!title || (kind !== "task" && !(kind === "project" && target.kind === "area"))) return null;
	return { kind: target.kind, title };
}
