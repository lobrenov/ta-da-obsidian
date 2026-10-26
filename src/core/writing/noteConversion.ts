import type { Kind } from "../model/item";
import type { LocalDate } from "../model/localDate";
import type { Status } from "../model/status";
import { setStatus } from "./completion";
import { clearProperty, hasProperty, hasValue, insertAtTop, type PropertyValue, setProperty } from "./frontmatterEditor";
import type { Parent } from "./parent";

/** The frontmatter a note gets when it's converted to a task, project or area. The body is untouched. */

/**
 * The keys converting writes, in order: `type`, `status` (not for an area), the parent's link (a task's project or
 * area, a project's area), and `createdDate` unless the note has one with a value.
 */
export function keys(
	kind: Kind,
	status: Status,
	parent: Parent | null,
	hasCreatedDate: boolean,
	today: LocalDate,
): { key: string; value: PropertyValue }[] {
	const result: { key: string; value: PropertyValue }[] = [{ key: "type", value: { kind: "text", value: kind } }];
	if (kind !== "area") result.push({ key: "status", value: { kind: "text", value: status } });
	if (parent !== null && (kind === "task" || (kind === "project" && parent.kind === "area"))) {
		result.push({ key: parent.kind, value: { kind: "link", title: parent.title } });
	}
	if (!hasCreatedDate) result.push({ key: "createdDate", value: { kind: "date", value: today } });
	return result;
}

/**
 * The note's text as `kind`: missing keys go straight after the opening `---` (a note without frontmatter gets the
 * block), keys it already has are set in place, and a `project` or `area` key the parent doesn't name is emptied. A
 * Done or Cancelled status also sets `completedDate`; any other empties it.
 */
export function text(source: string, kind: Kind, status: Status, parent: Parent | null, today: LocalDate): string {
	const all = keys(kind, status, parent, hasValue("createdDate", source), today);
	let result = insertAtTop(
		all.filter(({ key }) => !hasProperty(key, source)),
		source,
	);
	for (const { key, value } of all) {
		if (hasProperty(key, source)) result = setProperty(key, value, result);
	}
	for (const key of ["project", "area"]) {
		if (!all.some((entry) => entry.key === key)) result = clearProperty(key, result);
	}
	return kind === "area" ? result : setStatus(status, result, today);
}
