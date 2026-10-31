import { type Item, isLogged } from "../model/item";
import type { LocalDate } from "../model/localDate";
import { isClosed } from "../model/status";
import { byTitle, type VaultIndex } from "./vaultIndex";

/** Whether a file waits to be logged: a live Done or Cancelled project that still has open tasks, or one of its tasks. */
export function waitsForOpenTasks(index: VaultIndex, item: Item): boolean {
	const project = item.properties.kind === "project" ? item : index.projectOf(item);
	if (!project || isLogged(project) || !isClosed(project.properties.status)) return false;
	return index.openTasksIn(project).length > 0;
}

/**
 * The tasks and projects to log: Done or Cancelled and not logged yet, completed before `before` (any day when it's
 * null; a file without a `completedDate` counts as completed before it), by title. A Done or Cancelled project that
 * still has open tasks waits, and so do its tasks. Logging moves a completed repeating task forward rather than
 * logging it.
 */
export function filesToLog(index: VaultIndex, before: LocalDate | null): Item[] {
	return index.liveItems
		.filter((item) => {
			const p = item.properties;
			if ((p.kind !== "task" && p.kind !== "project") || !isClosed(p.status) || waitsForOpenTasks(index, item)) return false;
			return before === null || p.completedDate === null || p.completedDate.compare(before) < 0;
		})
		.sort(byTitle);
}

/** Logged files that aren't Done or Cancelled any more, as when reopened in another app, by title: logging puts them back. */
export function reopenedLogged(index: VaultIndex): Item[] {
	return index.logged.filter((item) => !isClosed(item.properties.status)).sort(byTitle);
}

/** Logged projects that have live open tasks, as when a task was reopened in another app, by title: they go back as Doing. */
export function loggedProjectsWithOpenTasks(index: VaultIndex): Item[] {
	const seen = new Set<string>();
	const projects: Item[] = [];
	for (const task of index.tasks) {
		const project = isClosed(task.properties.status) ? null : index.projectOf(task);
		if (project && isLogged(project) && !seen.has(project.path)) {
			seen.add(project.path);
			projects.push(project);
		}
	}
	return projects.sort(byTitle);
}
