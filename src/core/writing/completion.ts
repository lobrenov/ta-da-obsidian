import { type Item, subtasks } from "../model/item";
import type { LocalDate } from "../model/localDate";
import { isClosed, type Status } from "../model/status";
import { clearProperty, setProperty } from "./frontmatterEditor";

/** Keeps `completedDate` in step with `status`, which is the source of truth. */

/** Done and Cancelled also set `completedDate: today`; any other status clears `completedDate`. */
export function setStatus(status: Status, text: string, today: LocalDate): string {
	const withStatus = setProperty("status", { kind: "text", value: status }, text);
	return isClosed(status)
		? setProperty("completedDate", { kind: "date", value: today }, withStatus)
		: clearProperty("completedDate", withStatus);
}

/** Whether an edit from `previous` to `item` starts the task: it's a Not Started task with more done subtasks. */
export function startsTask(item: Item, previous: Item): boolean {
	return (
		item.properties.kind === "task" &&
		item.properties.status === "Not Started" &&
		subtasks(item).done > subtasks(previous).done
	);
}

/** Done or Cancelled → Not Started, anything else → Done: what a row or editor checkbox does. */
export function toggle(current: Status, text: string, today: LocalDate): string {
	return setStatus(isClosed(current) ? "Not Started" : "Done", text, today);
}
