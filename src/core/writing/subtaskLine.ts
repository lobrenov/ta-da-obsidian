import { checkboxState } from "../model/checkbox";
import type { LocalDate } from "../model/localDate";
import { parseInlineAttributes, removingAttribute } from "../parsing/inlineAttributes";
import { box, markerEnd, markerStart } from "./checkboxSyntax";

/** Setting a subtask line's due date and parent (Subtask attributes in `docs/file-format.md`), splicing only the token. */

type Splice = { range: [number, number] | null; token: string | null };

/**
 * `line` with the text after its box edited by `edit`, which gets that text and says which token to replace (if any) and
 * with what (null removes it, or adds nothing). Null when the line isn't a subtask (an icon box isn't).
 */
function splicing(line: string, edit: (rest: string) => Splice): string | null {
	const markerEndAt = markerEnd(line, markerStart(line));
	const found = markerEndAt === null ? null : box(line, markerEndAt);
	const state = found === null ? null : checkboxState(found.marker);
	if (found === null || state === null || state === "icon") return null;
	let start = found.offset + 2;
	while (start < line.length && (line[start] === " " || line[start] === "\t")) start++;
	const head = line.slice(0, start);
	const rest = line.slice(start);
	const { range, token } = edit(rest);
	if (range && token !== null) return head + rest.slice(0, range[0]) + token + rest.slice(range[0] + range[1]);
	if (range) return head + removingAttribute(range, rest);
	if (token !== null) {
		const trailing = /[ \t]*$/.exec(rest)?.[0] ?? "";
		const base = rest.slice(0, rest.length - trailing.length);
		return head + (base === "" ? token : `${base} ${token}`) + trailing;
	}
	return line;
}

/**
 * The line with its due date set to `date`: an existing `>YYYY-MM-DD` is replaced, or removed for null, else the token is
 * added at the end of the text. `line` is a subtask's content without its line ending; null when it isn't one.
 */
export function settingDue(date: LocalDate | null, line: string): string | null {
	return splicing(line, (rest) => ({ range: parseInlineAttributes(rest).due?.range ?? null, token: date === null ? null : `>${date.toString()}` }));
}

/** The line with its parent set to `@[[title]]`, as `settingDue` does. Null also when `title` has a bracket or a line break. */
export function settingParent(title: string | null, line: string): string | null {
	if (title !== null && (title === "" || /[[\]\n\r]/.test(title))) return null;
	return splicing(line, (rest) => ({ range: parseInlineAttributes(rest).parent?.range ?? null, token: title === null ? null : `@[[${title}]]` }));
}

/** `text` with line `line` (0-based) replaced by `edit`'s result, its `\r` before the line ending kept. */
function replacingLine(line: number, text: string, edit: (content: string) => string | null): string | null {
	let start = 0;
	for (let i = 0; i < line; i++) {
		const newline = text.indexOf("\n", start);
		if (newline < 0) return null;
		start = newline + 1;
	}
	const newline = text.indexOf("\n", start);
	let end = newline < 0 ? text.length : newline;
	if (end > start && text.charAt(end - 1) === "\r") end--;
	const replaced = edit(text.slice(start, end));
	return replaced === null ? null : text.slice(0, start) + replaced + text.slice(end);
}

/** `settingDue` on line `line` (0-based) of `text`, keeping every other character. Null when the text has no such line. */
export function setDue(date: LocalDate | null, text: string, line: number): string | null {
	return replacingLine(line, text, (content) => settingDue(date, content));
}

/** `settingParent` on line `line` (0-based) of `text`. */
export function setParent(title: string | null, text: string, line: number): string | null {
	return replacingLine(line, text, (content) => settingParent(title, content));
}
