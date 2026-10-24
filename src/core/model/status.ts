import { trimBlanks } from "../text";
import type { Kind } from "./item";

/** The `status` property. The value is the canonical written form. */
export const statuses = ["Not Started", "Doing", "Done", "Blocked", "Cancelled", "Ongoing"] as const;
export type Status = (typeof statuses)[number];

/** Done or Cancelled: completed, with a `completedDate`. */
export function isClosed(status: Status): boolean {
	return status === "Done" || status === "Cancelled";
}

/** Matches a written value case-insensitively, ignoring surrounding spaces and tabs. */
export function readStatus(text: string): Status | null {
	const trimmed = trimBlanks(text).toLowerCase();
	return statuses.find((status) => status.toLowerCase() === trimmed) ?? null;
}

/** The statuses a file of `kind` can be set to, in menu order. Ongoing is for projects only. */
export function statusChoices(kind: Kind): Status[] {
	return kind === "project"
		? ["Not Started", "Doing", "Ongoing", "Blocked", "Done", "Cancelled"]
		: ["Not Started", "Doing", "Blocked", "Done", "Cancelled"];
}
