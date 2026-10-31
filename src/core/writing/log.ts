import { rolloverDay } from "../index/repeatMove";
import { isLogged, type Item } from "../model/item";
import type { LocalDate } from "../model/localDate";
import { isClosed } from "../model/status";
import { logbookFolderFor } from "../storage/vault";
import { moveForward, nextForCompleted } from "./recurrence";
import { planMoves, planRelinks, type FileMove, type MoveIndex, type ProjectRelink } from "./unlog";

/*
 * Logging, as the Mac's `log`: a completed task or project goes to `Ta Da/logbook/<yyyy-MM>/` by its `completedDate`,
 * numbered when its name is taken there. A project's name also avoids every project's title and the projects named so
 * far in the run. A completed repeating task with a next date moves forward in place instead. When a project's name
 * changes, its tasks' links follow.
 */

/** A repeating task that moves forward in place: `edit` is spliced into its text. */
export interface ForwardMove {
	path: string;
	edit: (text: string) => string;
}

/**
 * `folders`: the month folders the moves go to, to create where missing. `moves` and `forward` are in the order of the
 * paths; a forward-moved file isn't in `moves`. Each move's `to` is the destination planned from the folders' names
 * now: the apply picks the name again with `moveName` just before each rename. `relinks` follow the moves
 * (`resolveRelinks`).
 */
export interface LogPlan {
	folders: string[];
	moves: FileMove[];
	forward: ForwardMove[];
	relinks: ProjectRelink[];
}

/**
 * Where completed files go. `paths` that aren't live tasks or projects are skipped. `filenamesIn` lists the names
 * already in a folder (none for a folder that doesn't exist yet).
 */
export function planLog(index: MoveIndex, paths: string[], today: LocalDate, filenamesIn: (folder: string) => Iterable<string>): LogPlan {
	const items = [...new Set(paths)].flatMap((path) => index.get(path) ?? []).filter(
		(item) => !isLogged(item) && (item.properties.kind === "task" || item.properties.kind === "project"),
	);
	const forward: ForwardMove[] = [];
	const logged: Item[] = [];
	for (const item of items) {
		const closed = isClosed(index.projectOf(item)?.properties.status ?? "Not Started");
		const rollover = rolloverDay(item.properties.completedDate, today);
		if (nextForCompleted(item, rollover, closed)) forward.push({ path: item.path, edit: (text) => moveForward(text, item.path, rollover, closed) });
		else logged.push(item);
	}
	const { moves, folders } = planMoves(index, logged, (item) => logbookFolderFor(item.properties.completedDate ?? today), filenamesIn);
	return { folders, moves, forward, relinks: planRelinks(index, logged) };
}
