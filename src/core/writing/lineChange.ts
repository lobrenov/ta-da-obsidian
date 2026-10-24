/** A position in a text: 0-based line, and offset in that line. */
export interface LinePosition {
	line: number;
	ch: number;
}

/** A replacement of the text between two positions, shaped as Obsidian's `EditorChange`. */
export interface LineChange {
	from: LinePosition;
	to: LinePosition;
	text: string;
}

/**
 * The one change that turns `before` into `after`, covering only what differs: the lines the two texts share at their
 * start and end are left out, and so are the characters shared at the start of the first changed line and the end of
 * the last, so a caret inside a changed line keeps its place. Null when the texts are equal. Lines are split at `\n`.
 */
export function lineChange(before: string, after: string): LineChange | null {
	if (before === after) return null;
	const old = before.split("\n");
	const next = after.split("\n");
	const limit = Math.min(old.length, next.length);
	let start = 0;
	while (start < limit && old[start] === next[start]) start++;
	let tail = 0;
	while (tail < limit - start && old[old.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
	const oldEnd = old.length - tail;
	const inserted = next.slice(start, next.length - tail);

	// A line follows the changed lines: replace them with their line breaks. Otherwise the changed lines run to the
	// end of the text, and the line break before them goes with them.
	let from: number;
	let to: number;
	let text: string;
	if (oldEnd < old.length) {
		from = offsetOf(old, start, 0);
		to = offsetOf(old, oldEnd, 0);
		text = inserted.map((line) => `${line}\n`).join("");
	} else if (start > 0) {
		from = offsetOf(old, start - 1, (old[start - 1] as string).length);
		to = before.length;
		text = inserted.map((line) => `\n${line}`).join("");
	} else {
		from = 0;
		to = before.length;
		text = inserted.join("\n");
	}

	// Trim what the replaced text and the new text share at their ends, without splitting a surrogate pair.
	const replaced = before.slice(from, to);
	const room = Math.min(replaced.length, text.length);
	let prefix = 0;
	while (prefix < room && replaced[prefix] === text[prefix]) prefix++;
	if (prefix > 0 && isHighSurrogate(replaced.charCodeAt(prefix - 1))) prefix--;
	let suffix = 0;
	while (suffix < room - prefix && replaced[replaced.length - 1 - suffix] === text[text.length - 1 - suffix]) suffix++;
	if (suffix > 0 && isLowSurrogate(replaced.charCodeAt(replaced.length - suffix))) suffix--;

	return {
		from: positionOf(old, from + prefix),
		to: positionOf(old, to - suffix),
		text: text.slice(prefix, text.length - suffix),
	};
}

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

function offsetOf(lines: string[], line: number, ch: number): number {
	let offset = ch;
	for (let index = 0; index < line; index++) offset += (lines[index] as string).length + 1;
	return offset;
}

function positionOf(lines: string[], offset: number): LinePosition {
	let rest = offset;
	for (let line = 0; line < lines.length; line++) {
		const length = (lines[line] as string).length;
		if (rest <= length) return { line, ch: rest };
		rest -= length + 1;
	}
	return { line: lines.length - 1, ch: (lines[lines.length - 1] as string).length };
}
