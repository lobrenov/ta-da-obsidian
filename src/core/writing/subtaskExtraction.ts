import { checkboxState } from "../model/checkbox";
import type { LocalDate } from "../model/localDate";
import type { Status } from "../model/status";
import { lineRange, lineRanges, maxRange, substring } from "../syntax/ranges";
import { trimBlanks } from "../text";
import { isBlank, isNewlineCharacter } from "./characters";
import { box, markerEnd, markerStart } from "./checkboxSyntax";
import { setStatus } from "./completion";
import { newTask } from "./newFile";

/** Extract to Task: a subtask line, with the lines indented under it, becomes a task file of its own and leaves the text it was in. */

export interface Extract {
	/** The line's text after its box, trimmed. */
	title: string;
	/** From the box: `/` Doing, `x` Done, `-` Cancelled, any other open box Not Started. */
	status: Status;
	/** The lines indented under the subtask, outdented by their least indent; empty without any. */
	body: string;
	/** The UTF-16 range of the subtask line and the lines under it, line endings included, which the edit deletes: location, length. */
	range: [number, number];
}

const isIndent = (code: number): boolean => code === 0x20 || code === 0x09;

/** A line without its line ending: `trimmingCharacters(in: .newlines)`. */
function content(line: string): string {
	let start = 0;
	let end = line.length;
	while (start < end && isNewlineCharacter(line.charAt(start))) start++;
	while (end > start && isNewlineCharacter(line.charAt(end - 1))) end--;
	return line.slice(start, end);
}

const indentLength = (line: string): number => {
	let at = 0;
	while (at < line.length && isIndent(line.charCodeAt(at))) at++;
	return at;
};

/** The columns a line's leading spaces and tabs take, a tab moving to the next multiple of 4. */
function indentColumns(line: string): number {
	let columns = 0;
	for (let at = 0; at < indentLength(line); at++) columns = line[at] === "\t" ? Math.floor(columns / 4) * 4 + 4 : columns + 1;
	return columns;
}

/** `line` less the leading spaces and tabs that take its first `columns` columns. */
function outdented(line: string, columns: number): string {
	let at = 0;
	let used = 0;
	while (used < columns && at < line.length && isIndent(line.charCodeAt(at))) {
		used = line[at] === "\t" ? Math.floor(used / 4) * 4 + 4 : used + 1;
		at++;
	}
	return line.slice(at);
}

/** Whether a ``` or ~~~ fence before UTF-16 `location` opens a code block that hasn't closed. */
function isInCode(location: number, text: string): boolean {
	let inCode = false;
	const before = text.slice(0, location);
	for (const line of lineRanges(before)) {
		const trimmed = trimBlanks(substring(before, line));
		if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) inCode = !inCode;
	}
	return inCode;
}

/**
 * The subtask on the line holding UTF-16 `location` in `text`. Null when the line isn't a subtask (an icon box isn't),
 * has no text after its box, is in a quote or callout, or is inside a ``` or ~~~ code block.
 */
export function extract(location: number, text: string): Extract | null {
	const lineAt = lineRange(text, location);
	const lineBegin = lineAt.location;
	let end = maxRange(lineAt);
	const line = content(substring(text, lineAt));
	const indent = indentColumns(line);
	const start = markerStart(line);
	if (start !== indentLength(line) || isInCode(lineBegin, text)) return null;
	const markerEndAt = markerEnd(line, start);
	const found = markerEndAt === null ? null : box(line, markerEndAt);
	const state = found === null ? null : checkboxState(found.marker);
	if (found === null || state === null || state === "icon") return null;
	const title = trimBlanks(line.slice(found.offset + 2));
	if (title === "") return null;

	const children: string[] = [];
	let at = end;
	while (at < text.length) {
		const next = maxRange(lineRange(text, at));
		const child = content(text.slice(at, next));
		if (isBlank(child)) {
			children.push("");
		} else if (indentColumns(child) > indent) {
			children.push(child);
			end = next;
		} else {
			break;
		}
		at = next;
	}
	while (children[children.length - 1] === "") children.pop();
	const indents = children.filter((child) => child !== "").map(indentColumns);
	const outdent = indents.length === 0 ? 0 : Math.min(...indents);
	const body = children.map((child) => outdented(child, outdent)).join("\n");

	const status: Status = state === "done" ? "Done" : state === "cancelled" ? "Cancelled" : found.marker === "/" ? "Doing" : "Not Started";
	return { title, status, body, range: [lineBegin, end - lineBegin] };
}

/**
 * Every subtask in `text` extracted, first to last, each with the lines indented under it (so a subtask under another
 * goes with its parent's), and the text left.
 */
export function extractAll(source: string): { text: string; extracts: Extract[] } {
	let text = source;
	const extracts: Extract[] = [];
	let location = 0;
	while (location < text.length) {
		const found = extract(location, text);
		if (found) {
			extracts.push(found);
			text = text.slice(0, found.range[0]) + text.slice(found.range[0] + found.range[1]);
		} else {
			location = maxRange(lineRange(text, location));
		}
	}
	return { text, extracts };
}

/** The new task's text: a task filed under `project` or else `area`, with the extract's status and its body. */
export function taskText(found: Extract, project: string | null, area: string | null, today: LocalDate): string {
	const text = setStatus(found.status, newTask({ project, area, today }), today);
	return found.body === "" ? text : `${text}${found.body}\n`;
}
