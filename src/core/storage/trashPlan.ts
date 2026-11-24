import type { VaultIndex } from "../index/vaultIndex";
import type { Item } from "../model/item";

/** The paths deleting a file trashes, the file first and each once: a project takes its live tasks, an area its projects, their tasks and its own tasks. */
export function filesToTrash(index: VaultIndex, path: string): string[] {
	const item = index.get(path);
	const paths = [path];
	if (item?.properties.kind === "project") paths.push(...index.tasksIn(item).map((task) => task.path));
	if (item?.properties.kind === "area") paths.push(...index.projectsIn(item).map((project) => project.path), ...index.allTasksIn(item).map((task) => task.path));
	return [...new Set(paths)];
}

const count = (n: number, noun: string): string => (n === 1 ? `1 ${noun}` : `${n} ${noun}s`);

/** Whether Obsidian's "Deleted files" setting (`trashOption`) deletes permanently. */
export const deletesPermanently = (trashOption: unknown): boolean => trashOption === "none";

const permanentNote = "Obsidian's “Deleted files” setting is “Permanently delete”, so this can't be undone.";

/** What the delete confirmation says about a project when Obsidian's "Deleted files" setting deletes permanently: it goes with its live tasks, for good. */
export function projectDeleteMessage(index: VaultIndex, project: Item): string {
	const tasks = index.tasksIn(project).length;
	return `${project.title}${tasks > 0 ? ` and its ${count(tasks, "task")}` : ""} will be deleted permanently.\n\n${permanentNote}`;
}

/** What the delete confirmation says about an area: what goes with it, and what a restore brings back; with `trashOption` "none", that it can't be undone. */
export function areaTrashMessage(index: VaultIndex, area: Item, trashOption?: unknown): string {
	const projects = index.projectsIn(area);
	const projectTasks = projects.reduce((total, project) => total + index.tasksIn(project).length, 0);
	const own = index.tasksIn(area).length;
	const parts = [area.title];
	if (projects.length > 0) parts.push(`its ${count(projects.length, "project")}${projectTasks > 0 ? ` and their ${count(projectTasks, "task")}` : ""}`);
	if (own > 0) parts.push(`its ${count(own, "own task")}`);
	const last = parts[parts.length - 1];
	const list = parts.length > 2 ? `${parts.slice(0, -1).join(", ")}, and ${last}` : parts.join(" and ");
	if (deletesPermanently(trashOption)) return `${list} will be deleted permanently.\n\n${permanentNote}`;
	return `${list} ${parts.length === 1 ? "moves" : "move"} to the Trash.\n\nRestoring ${area.title} brings back the area alone. Restoring a project or task brings ${area.title} back with it.`;
}

/** The confirmation's title for one area. */
export function areaTrashTitle(area: Item): string {
	return `Delete “${area.title}”?`;
}
