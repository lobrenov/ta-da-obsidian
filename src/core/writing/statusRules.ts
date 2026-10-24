import type { Item } from "../model/item";
import { isClosed, type Status } from "../model/status";

/*
 * What changing a status does to other files, as the apps' `setStatus`: closing a project that has open tasks asks
 * first, and reopening a Done or Cancelled task reopens its Done or Cancelled project to Doing.
 */

/** What the rules read from the index. */
export interface StatusIndex {
	get(path: string): Item | undefined;
	projectOf(task: Item): Item | null;
	openTasksIn(project: Item): Item[];
}

export type ClosedStatus = "Done" | "Cancelled";

export interface StatusChange {
	path: string;
	status: Status;
}

/** Closing a project that still has open tasks: they're closed with it, or nothing changes. */
export interface CompletionQuestion {
	project: Item;
	status: ClosedStatus;
	/** The project's open tasks as they were when asked about. */
	tasks: Item[];
}

export type StatusPlan = { ask: CompletionQuestion } | { changes: StatusChange[] };

/** Setting `status` on `item`: the question to ask first, or the files to set in order. Areas and notes have no status. */
export function planStatus(index: StatusIndex, item: Item, status: Status): StatusPlan {
	const { kind } = item.properties;
	if (kind !== "task" && kind !== "project") return { changes: [] };
	if (kind === "project" && (status === "Done" || status === "Cancelled")) {
		const tasks = index.openTasksIn(item);
		if (tasks.length > 0) return { ask: { project: item, status, tasks } };
	}
	const changes: StatusChange[] = [{ path: item.path, status }];
	if (kind === "task" && isClosed(item.properties.status) && !isClosed(status)) {
		const project = index.projectOf(item);
		if (project && isClosed(project.properties.status)) changes.push({ path: project.path, status: "Doing" });
	}
	return { changes };
}

/** Done or Cancelled → Not Started, anything else → Done: what a checkbox and Complete do. */
export function planToggle(index: StatusIndex, item: Item): StatusPlan {
	return planStatus(index, item, isClosed(item.properties.status) ? "Not Started" : "Done");
}

/**
 * Answering a question with `tasksAs`: the project is set to the asked status, then the tasks it has open now are set
 * to `tasksAs`. Nothing for a project that's gone.
 */
export function planAnswer(index: StatusIndex, question: CompletionQuestion, tasksAs: ClosedStatus): StatusChange[] {
	const project = index.get(question.project.path);
	if (!project) return [];
	const changes: StatusChange[] = [];
	if (project.properties.status !== question.status) changes.push({ path: project.path, status: question.status });
	for (const task of index.openTasksIn(project)) changes.push({ path: task.path, status: tasksAs });
	return changes;
}

/** The question's words: "Complete “Sell the Kombi”?" or "Cancel “Sell the Kombi”?" */
export function questionTitle(question: CompletionQuestion): string {
	return `${question.status === "Cancelled" ? "Cancel" : "Complete"} “${question.project.title}”?`;
}

/** "1 of its tasks is still open. Close it with the project." */
export function questionMessage(question: CompletionQuestion): string {
	const count = question.tasks.length;
	const open = count === 1 ? "1 of its tasks is still open." : `${count} of its tasks are still open.`;
	return `${open} Close ${count === 1 ? "it" : "them"} with the project.`;
}

/** "Complete 3 tasks" or "Cancel 3 tasks". */
export function questionButton(question: CompletionQuestion, status: ClosedStatus): string {
	const count = question.tasks.length;
	return `${status === "Cancelled" ? "Cancel" : "Complete"} ${count === 1 ? "1 task" : `${count} tasks`}`;
}
