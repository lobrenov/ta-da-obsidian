import { isLogged, titleOfPath, type Item } from "../model/item";
import { linkTitle } from "../model/wikiLink";
import { parseItem } from "../parsing/parseItem";
import { identityKey } from "../text";
import { projectFolder, taskFolder } from "../storage/vault";
import { filename, splitFilename } from "./fileNaming";
import { setProperty } from "./frontmatterEditor";

/*
 * Putting logged files back, as the Mac's `unlog`: a task or project goes to `Ta Da/tasks/` or `Ta Da/projects/`,
 * numbered when its name is taken there. A project's name also avoids every other project's filename. A task whose
 * project is logged brings it back too, set to Doing. When a project's name had to change, its tasks' links follow.
 */

/** What the plan reads from the index. */
export interface UnlogIndex {
	get(path: string): Item | undefined;
	projectOf(task: Item): Item | null;
	tasksIn(project: Item, includingLogged?: boolean): Item[];
	/** The filenames of every project's title, live or logged, except the project at `path`. */
	projectFilenames(excluding?: string): Set<string>;
}

export interface UnlogMove {
	from: string;
	to: string;
}

/** A task's `project` link that names `from` is pointed at `to`. */
export interface Relink {
	/** The task's path once the moves are done. */
	path: string;
	from: string;
	to: string;
}

/** Moves in order (a project before its task), then the paths, once moved, to set to Doing, then the links to follow. */
export interface UnlogPlan {
	moves: UnlogMove[];
	doing: string[];
	relinks: Relink[];
}

/**
 * Where logged files go back to. `paths` that aren't logged are skipped. `filenamesIn` lists the names already in a
 * folder. `doing` holds the paths of projects the caller has chosen to set to Doing as well as the ones brought back
 * for a task.
 */
export function planUnlog(
	index: UnlogIndex,
	paths: string[],
	filenamesIn: (folder: string) => Iterable<string>,
	doing: string[] = [],
): UnlogPlan {
	const items = paths.flatMap((path) => index.get(path) ?? []).filter(isLogged);
	const parents: Item[] = [];
	for (const item of items) {
		const project = index.projectOf(item);
		if (!project || !isLogged(project) || paths.includes(project.path) || parents.some((p) => p.path === project.path)) continue;
		parents.push(project);
	}
	const moved = new Map<string, string>();
	const claimed = new Map<string, Set<string>>();
	const named = new Set<string>();
	const moves: UnlogMove[] = [];
	for (const item of [...parents, ...items]) {
		if (moved.has(item.path)) continue;
		const isProject = item.properties.kind === "project";
		const folder = isProject ? projectFolder : taskFolder;
		const existing = claimed.get(folder) ?? new Set(filenamesIn(folder));
		claimed.set(folder, existing);
		const taken = isProject ? [...existing, ...named, ...index.projectFilenames(item.path)] : [...existing];
		const name = movedName(item.path, taken);
		existing.add(name);
		if (isProject) named.add(name);
		const to = `${folder}/${name}`;
		moved.set(item.path, to);
		moves.push({ from: item.path, to });
	}
	const relinks: Relink[] = [];
	for (const project of [...parents, ...items]) {
		const to = moved.get(project.path);
		if (project.properties.kind !== "project" || to === undefined || titleOfPath(to) === project.title) continue;
		for (const task of index.tasksIn(project, true)) {
			relinks.push({ path: moved.get(task.path) ?? task.path, from: project.title, to: titleOfPath(to) });
		}
	}
	const settled = [...parents.map((parent) => parent.path), ...doing].flatMap((path) => moved.get(path) ?? []);
	return { moves, doing: [...new Set(settled)], relinks };
}

/** The filename a file keeps in a folder, or its number-suffixed name when `existing` holds it, ignoring case. */
function movedName(path: string, existing: Iterable<string>): string {
	const current = path.split("/").pop() ?? path;
	const taken = [...existing];
	if (!taken.some((name) => identityKey(name) === identityKey(current))) return current;
	const { base, ext } = splitFilename(current);
	return filename(base, taken, ext);
}

/** Points the `project` link at `to` when it names `from`, ignoring case; nothing otherwise. */
export function relinkEdit(path: string, from: string, to: string): (text: string) => string | null {
	return (text) => {
		const link = parseItem(text, path)?.properties.project;
		if (!link || identityKey(linkTitle(link)) !== identityKey(from)) return null;
		return setProperty("project", { kind: "link", title: to }, text);
	};
}
