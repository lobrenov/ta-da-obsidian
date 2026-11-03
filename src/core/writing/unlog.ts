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

/** What a plan reads from the index. */
export interface MoveIndex {
	get(path: string): Item | undefined;
	projectOf(task: Item): Item | null;
	tasksIn(project: Item, includingLogged?: boolean): Item[];
	/** The filenames of every project's title, live or logged, except the project at `path`. */
	projectFilenames(excluding?: string): Set<string>;
}

/** A file's move, with the destination planned from the folder's names at planning time. */
export interface FileMove {
	from: string;
	to: string;
}

/** A task's `project` link that names the project's old title is pointed at the project's new one. Paths are from before the moves. */
export interface ProjectRelink {
	task: string;
	project: string;
	from: string;
}

/** A `project` link to point at `to`, at the task's path once the moves are done. */
export interface Relink {
	path: string;
	from: string;
	to: string;
}

/** Moves in order (a project before its task), then the paths, once moved, to set to Doing, then the links to follow. */
export interface UnlogPlan {
	moves: FileMove[];
	doing: string[];
	relinks: ProjectRelink[];
}

/**
 * The filename a file takes in a folder when it moves: its own, or number-suffixed when `children` (the folder's names
 * now) hold it. A project's also avoids `named` (the project filenames chosen so far in the run, which the caller adds
 * each project's name to) and `projectFilenames`.
 */
export function moveName(item: Item, children: Iterable<string>, named: Iterable<string>, projectFilenames: Iterable<string>): string {
	const taken = item.properties.kind === "project" ? [...children, ...named, ...projectFilenames] : [...children];
	return movedName(item.path, taken);
}

/** Plans each item's move into the folder `folderFor` gives it, in order, with the folders the moves need. */
export function planMoves(
	index: MoveIndex,
	items: Item[],
	folderFor: (item: Item) => string,
	filenamesIn: (folder: string) => Iterable<string>,
): { moves: FileMove[]; folders: string[] } {
	const claimed = new Map<string, Set<string>>();
	const named = new Set<string>();
	const moves: FileMove[] = [];
	for (const item of items) {
		const folder = folderFor(item);
		const existing = claimed.get(folder) ?? new Set(filenamesIn(folder));
		claimed.set(folder, existing);
		const name = moveName(item, existing, named, index.projectFilenames(item.path));
		existing.add(name);
		if (item.properties.kind === "project") named.add(name);
		moves.push({ from: item.path, to: `${folder}/${name}` });
	}
	return { moves, folders: [...claimed.keys()] };
}

/** The links of every task of each project in `items`, to follow if the project's title changes when it moves. */
export function planRelinks(index: MoveIndex, items: Item[]): ProjectRelink[] {
	return items
		.filter((item) => item.properties.kind === "project")
		.flatMap((project) => index.tasksIn(project, true).map((task) => ({ task: task.path, project: project.path, from: project.title })));
}

/** The relinks to apply: those of projects that moved and whose title changed, at their tasks' paths after `moved`. */
export function resolveRelinks(relinks: ProjectRelink[], moved: ReadonlyMap<string, string> | Record<string, string>): Relink[] {
	const at = (path: string): string | undefined => (moved instanceof Map ? (moved as ReadonlyMap<string, string>).get(path) : Object.hasOwn(moved, path) ? (moved as Record<string, string>)[path] : undefined);
	return relinks.flatMap(({ task, project, from }) => {
		const destination = at(project);
		const to = destination === undefined ? null : titleOfPath(destination);
		return to === null || to === from ? [] : [{ path: at(task) ?? task, from, to }];
	});
}

/**
 * Where logged files go back to. `paths` that aren't logged are skipped. `filenamesIn` lists the names already in a
 * folder. `doing` holds the paths of projects the caller has chosen to set to Doing as well as the ones brought back
 * for a task.
 */
export function planUnlog(
	index: MoveIndex,
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
	const ordered = [...parents, ...items].filter((item, at, all) => all.findIndex((other) => other.path === item.path) === at);
	const { moves } = planMoves(index, ordered, (item) => (item.properties.kind === "project" ? projectFolder : taskFolder), filenamesIn);
	const moved = new Map(moves.map((move) => [move.from, move.to]));
	const settled = [...parents.map((parent) => parent.path), ...doing].flatMap((path) => moved.get(path) ?? []);
	return { moves, doing: [...new Set(settled)], relinks: planRelinks(index, ordered) };
}

/** The filename a file keeps in a folder, or its number-suffixed name when `existing` holds it, ignoring case. */
export function movedName(path: string, existing: Iterable<string>): string {
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
