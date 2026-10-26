import { checkboxState } from "../model/checkbox";
import type { LocalDate } from "../model/localDate";
import type { Status } from "../model/status";
import { isWhitespaceUnit, trimBlanks } from "../text";
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
const isLineBreak = (code: number): boolean => (code >= 0x0a && code <= 0x0d) || code === 0x85 || code === 0x2028 || code === 0x2029;

/** The end of the line holding `location`, its line ending included (`NSString.lineRange`). */
function lineEnd(text: string, location: number): number {
	let at = location;
	while (at < text.length && !isLineBreak(text.charCodeAt(at))) at++;
	if (at >= text.length) return text.length;
	return text.charCodeAt(at) === 0x0d && text.charCodeAt(at + 1) === 0x0a ? at + 2 : at + 1;
}

/** The start of the line holding `location`. */
function lineStart(text: string, location: number): number {
	let at = location;
	while (at > 0 && !isLineBreak(text.charCodeAt(at - 1))) at--;
	if (at > 0 && text.charCodeAt(at) === 0x0a && text.charCodeAt(at - 1) === 0x0d) at--;
	return at;
}

/** A line without its line ending. */
function content(text: string, start: number, end: number): string {
	let result = end;
	while (result > start && isLineBreak(text.charCodeAt(result - 1))) result--;
	return text.slice(start, result);
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
	for (const line of text.slice(0, location).split(/\r\n|[\n\r\u0085\u2028\u2029]/)) {
		const trimmed = trimBlanks(line);
		if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) inCode = !inCode;
	}
	return inCode;
}

/**
 * The subtask on the line holding UTF-16 `location` in `text`. Null when the line isn't a subtask (an icon box isn't),
 * has no text after its box, is in a quote or callout, or is inside a ``` or ~~~ code block.
 */
export function extract(location: number, text: string): Extract | null {
	const lineBegin = lineStart(text, Math.min(location, text.length));
	let end = lineEnd(text, lineBegin);
	const line = content(text, lineBegin, end);
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
		const next = lineEnd(text, at);
		const child = content(text, at, next);
		if ([...child].every((character) => isWhitespaceUnit(character.charCodeAt(0)))) {
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
	const outdent = Math.min(...children.filter((child) => child !== "").map(indentColumns), Infinity);
	const body = children.map((child) => outdented(child, outdent === Infinity ? 0 : outdent)).join("\n");

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
			location = lineEnd(text, location);
		}
	}
	return { text, extracts };
}

/** The new task's text: a task filed under `project` or else `area`, with the extract's status and its body. */
export function taskText(found: Extract, project: string | null, area: string | null, today: LocalDate): string {
	const text = setStatus(found.status, newTask({ project, area, today }), today);
	return found.body === "" ? text : `${text}${found.body}\n`;
}
