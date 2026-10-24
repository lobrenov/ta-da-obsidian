import type { LocalDate } from "../../core/model/localDate";
import type { Status } from "../../core/model/status";
import { readTag } from "../../core/model/tag";
import { parseItem } from "../../core/parsing/parseItem";
import type { Edit } from "../../Writer";
import { setStatus } from "../../core/writing/completion";
import { clearProperty, setProperty } from "../../core/writing/frontmatterEditor";
import { type Parent, setParent } from "../../core/writing/parent";
import { addTag, removeTag } from "../../core/writing/tagEditor";

/** Sets a status; nothing when the file already has it. */
export function statusEdit(status: Status, path: string, today: LocalDate): Edit {
	return (text) => (parseItem(text, path)?.properties.status === status ? null : setStatus(status, text, today));
}

export function parentEdit(parent: Parent | null): Edit {
	return (text) => setParent(parent, text);
}

/** Sets `dueDate` or `deadline`, or empties it for null. */
export function dateEdit(key: "dueDate" | "deadline", date: LocalDate | null): Edit {
	return (text) => (date ? setProperty(key, { kind: "date", value: date }, text) : clearProperty(key, text));
}

/** Adds a tag by its typed name; nothing for a name with no tag in it. */
export function addTagEdit(name: string): Edit {
	const tag = readTag(name);
	return (text) => (tag ? addTag(tag, text) : null);
}

export function removeTagEdit(name: string): Edit {
	const tag = readTag(name);
	return (text) => (tag ? removeTag(tag, text) : null);
}
