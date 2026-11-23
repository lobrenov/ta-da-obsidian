import { LocalDate } from "../model/localDate";
import { linkTitle, readWikiLinkInner } from "../model/wikiLink";
import { trimBlanks } from "../text";

/*
 * The attributes a checkbox line can carry after its box (Subtasks in `docs/file-format.md`): a due date,
 * `>YYYY-MM-DD`, and a parent, `@[[Title]]`. Each starts the text or follows a space or tab; the first of each counts;
 * code spans and links hold none. Ranges are UTF-16, in the text parsed.
 */

export interface InlineDue {
	date: LocalDate;
	/** `>YYYY-MM-DD`: location, length. */
	range: [number, number];
}

export interface InlineParent {
	/** The link's target title: no folder, alias or heading. */
	title: string;
	/** `@[[…]]`: location, length. */
	range: [number, number];
}

export interface InlineAttributes {
	due: InlineDue | null;
	parent: InlineParent | null;
}

const [space, tab, backtick, greater, at, open, close, paren, closeParen, newline, backslash] = [0x20, 0x09, 0x60, 0x3e, 0x40, 0x5b, 0x5d, 0x28, 0x29, 0x0a, 0x5c];

const alphanumeric = /^[\p{L}\p{M}\p{N}]$/u;

/** `YYYY-MM-DD` at `i`, valid and not followed by a letter or digit. */
function dateAt(text: string, i: number): LocalDate | null {
	if (i + 10 > text.length) return null;
	if (i + 10 < text.length && alphanumeric.test(text.charAt(i + 10))) return null;
	return LocalDate.parse(text.slice(i, i + 10));
}

/** The title and end of the `@[[…]]` at `i`; null when it has no closing `]]` on the line or links no file. */
function parentLink(text: string, i: number): [string, number] | null {
	let j = i + 3;
	while (j + 1 < text.length && text.charCodeAt(j) !== close && text.charCodeAt(j) !== open && text.charCodeAt(j) !== newline) j++;
	if (j + 1 >= text.length || text.charCodeAt(j) !== close || text.charCodeAt(j + 1) !== close) return null;
	const link = readWikiLinkInner(text.slice(i + 3, j));
	return link === null ? null : [linkTitle(link), j + 2];
}

/** The index after the code span opened by the backtick run at `i`, or after the run when nothing closes it. */
function afterCodeSpan(text: string, i: number): number {
	let length = 0;
	while (i + length < text.length && text.charCodeAt(i + length) === backtick) length++;
	let j = i + length;
	while (j < text.length) {
		if (text.charCodeAt(j) !== backtick) {
			j++;
			continue;
		}
		let run = 0;
		while (j + run < text.length && text.charCodeAt(j + run) === backtick) run++;
		if (run === length) return j + run;
		j += run;
	}
	return i + length;
}

/** The `]` that closes the `[` at `i`, skipping nested brackets, escapes and code spans. */
function closingBracket(text: string, from: number): number | null {
	let depth = 0;
	let j = from;
	while (j < text.length) {
		const code = text.charCodeAt(j);
		if (code === backslash) j++;
		else if (code === backtick) j = afterCodeSpan(text, j) - 1;
		else if (code === open) depth++;
		else if (code === close) {
			depth--;
			if (depth === 0) return j;
		}
		j++;
	}
	return null;
}

/**
 * The index after the `[[…]]`, `[text](target)` or `[text][ref]` that starts at `i`, or after the bracket when it isn't
 * one. The text's brackets nest.
 */
function afterLink(text: string, i: number): number {
	if (i + 1 < text.length && text.charCodeAt(i + 1) === open) {
		for (let j = i + 2; j + 1 < text.length; j++) {
			if (text.charCodeAt(j) === close && text.charCodeAt(j + 1) === close) return j + 2;
		}
		return i + 1;
	}
	const end = closingBracket(text, i);
	if (end === null || end + 1 >= text.length) return i + 1;
	if (text.charCodeAt(end + 1) === open) {
		const ref = text.indexOf("]", end + 2);
		return ref < 0 ? i + 1 : ref + 1;
	}
	if (text.charCodeAt(end + 1) !== paren) return i + 1;
	let depth = 0;
	for (let j = end + 1; j < text.length; j++) {
		const code = text.charCodeAt(j);
		if (code === backslash) j++;
		else if (code === paren) depth++;
		else if (code === closeParen) {
			depth--;
			if (depth === 0) return j + 1;
		}
	}
	return i + 1;
}

/** The attributes in `text`, the text after a checkbox's box. */
export function parseInlineAttributes(text: string): InlineAttributes {
	const found: InlineAttributes = { due: null, parent: null };
	if (!text.includes(">") && !text.includes("@")) return found;
	let i = 0;
	while (i < text.length && (found.due === null || found.parent === null)) {
		const atBoundary = i === 0 || text.charCodeAt(i - 1) === space || text.charCodeAt(i - 1) === tab;
		const code = text.charCodeAt(i);
		if (code === backtick) {
			i = afterCodeSpan(text, i);
		} else if (code === open) {
			i = afterLink(text, i);
		} else if (code === greater && atBoundary && found.due === null) {
			const date = dateAt(text, i + 1);
			if (date) found.due = { date, range: [i, 11] };
			i += 1;
		} else if (
			code === at &&
			atBoundary &&
			found.parent === null &&
			i + 2 < text.length &&
			text.charCodeAt(i + 1) === open &&
			text.charCodeAt(i + 2) === open
		) {
			const link = parentLink(text, i);
			if (link) {
				found.parent = { title: link[0], range: [i, link[1] - i] };
				i = link[1];
			} else {
				i += 1;
			}
		} else {
			i += 1;
		}
	}
	return found;
}

/** `text` less `range` and the one space or tab before it, or after it when the range starts the text. */
export function removingAttribute(range: [number, number], text: string): string {
	let start = range[0];
	let end = range[0] + range[1];
	const isSpace = (i: number): boolean => text.charCodeAt(i) === space || text.charCodeAt(i) === tab;
	if (start > 0) {
		if (isSpace(start - 1)) start--;
	} else if (end < text.length && isSpace(end)) {
		end++;
	}
	return text.slice(0, start) + text.slice(end);
}

/** `text` without the attributes that count, each with the space or tab before it, and without surrounding whitespace. */
export function strippedOf(attributes: InlineAttributes, text: string): string {
	let result = text;
	const ranges: [number, number][] = [];
	if (attributes.due) ranges.push(attributes.due.range);
	if (attributes.parent) ranges.push(attributes.parent.range);
	for (const range of ranges.sort((a, b) => b[0] - a[0])) result = removingAttribute(range, result);
	return trimBlanks(result);
}
