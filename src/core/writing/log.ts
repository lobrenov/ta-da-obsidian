import { rolloverDay } from "../index/repeatMove";
import { isLogged, titleOfPath, type Item } from "../model/item";
import type { LocalDate } from "../model/localDate";
import { isClosed } from "../model/status";
import { logbookFolderFor } from "../storage/vault";
import { moveForward, nextForCompleted } from "./recurrence";
import { movedName, type Relink, type UnlogIndex } from "./unlog";

/*
 * Logging, as the Mac's `log`: a completed task or project goes to `Ta Da/logbook/<yyyy-MM>/` by its `completedDate`,
 * numbered when its name is taken there. A project's name also avoids every project's title and the projects named so
 * far in the plan. A completed repeating task with a next date moves forward in place instead. When a project's name
 * had to change, its tasks' links follow.
 */

/** What the plan reads from the index. */
export interface LogIndex extends UnlogIndex {
	get(path: string): Item | undefined;
}

export interface LogMove {
	from: string;
	to: string;
}

/** A repeating task that moves forward in place: `edit` is spliced into its text. */
export interface ForwardMove {
	path: string;
	edit: (text: string) => string;
}

/** A task's `project` link that names `from` is pointed at `to`, once the project at `project` has moved. */
export interface LogRelink extends Relink {
	/** The project's path before the move. */
	project: string;
}

/**
 * `folders`: the month folders the moves go to, to create where missing. `moves` and `forward` are in the order of the
 * paths. `relinks` follow all the moves, each only when its `project` moved.
 */
export interface LogPlan {
	folders: string[];
	moves: LogMove[];
	forward: ForwardMove[];
	relinks: LogRelink[];
}

/**
 * Where completed files go. `paths` that aren't live tasks or projects are skipped. `filenamesIn` lists the names
 * already in a folder (none for a folder that doesn't exist yet).
 *
 * A file whose forward edit leaves it Done or Cancelled (it changed after the index read it) doesn't move; planning it
 * again once that edit has been spliced logs it.
 */
export function planLog(index: LogIndex, paths: string[], today: LocalDate, filenamesIn: (folder: string) => Iterable<string>): LogPlan {
	const items = [...new Set(paths)].flatMap((path) => index.get(path) ?? []).filter(
		(item) => !isLogged(item) && (item.properties.kind === "task" || item.properties.kind === "project"),
	);
	const moved = new Map<string, string>();
	const claimed = new Map<string, Set<string>>();
	const named = new Set<string>();
	const folders = new Set<string>();
	const moves: LogMove[] = [];
	const forward: ForwardMove[] = [];
	for (const item of items) {
		const closed = isClosed(index.projectOf(item)?.properties.status ?? "Not Started");
		const rollover = rolloverDay(item.properties.completedDate, today);
		if (nextForCompleted(item, rollover, closed)) {
			forward.push({ path: item.path, edit: (text) => moveForward(text, item.path, rollover, closed) });
			continue;
		}
		const isProject = item.properties.kind === "project";
		const folder = logbookFolderFor(item.properties.completedDate ?? today);
		const existing = claimed.get(folder) ?? new Set(filenamesIn(folder));
		claimed.set(folder, existing);
		const taken = isProject ? [...existing, ...named, ...index.projectFilenames(item.path)] : [...existing];
		const name = movedName(item.path, taken);
		existing.add(name);
		if (isProject) named.add(name);
		const to = `${folder}/${name}`;
		moved.set(item.path, to);
		folders.add(folder);
		moves.push({ from: item.path, to });
	}
	const relinks: LogRelink[] = [];
	for (const project of items) {
		const to = moved.get(project.path);
		if (project.properties.kind !== "project" || to === undefined || titleOfPath(to) === project.title) continue;
		for (const task of index.tasksIn(project, true)) {
			relinks.push({ project: project.path, path: moved.get(task.path) ?? task.path, from: project.title, to: titleOfPath(to) });
		}
	}
	return { folders: [...folders], moves, forward, relinks };
}
