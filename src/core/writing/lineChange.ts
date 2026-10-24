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
 * The one change that turns `before` into `after`, covering only the lines that differ: the lines the two texts share
 * at their start and end are left out. Null when the texts are equal. Lines are split at `\n`.
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
	const last = old.length - 1;
	const lastLength = (old[last] as string).length;

	// A line follows the changed lines: replace them with their line breaks.
	if (oldEnd < old.length) {
		return { from: { line: start, ch: 0 }, to: { line: oldEnd, ch: 0 }, text: inserted.map((line) => `${line}\n`).join("") };
	}
	// The changed lines run to the end of the text: take the line break before them.
	if (start > 0) {
		return {
			from: { line: start - 1, ch: (old[start - 1] as string).length },
			to: { line: last, ch: lastLength },
			text: inserted.map((line) => `\n${line}`).join(""),
		};
	}
	return { from: { line: 0, ch: 0 }, to: { line: last, ch: lastLength }, text: inserted.join("\n") };
}
