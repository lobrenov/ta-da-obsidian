import { boxStart } from "../syntax/taskMarker";

/*
 * Where a checkbox is in a line, for Add Subtask and Source mode: a list marker (`-`, `*`, `+`, `1.` or `1)`), one to
 * four spaces or tabs, then `[c]` with `c` from the reference set and a space or tab after it. Offsets are UTF-16
 * offsets in `text`; the syntax is ASCII, so in a line they are UTF-8 offsets too.
 */

const isSpace = (code: number): boolean => code === 0x20 || code === 0x09;

/** Where a line's list marker would start: after its indent and any `>` quote markers. */
export function markerStart(line: string): number {
	for (let at = 0; at < line.length; at++) {
		const code = line.charCodeAt(at);
		if (!isSpace(code) && code !== 0x3e) return at;
	}
	return line.length;
}

/** The end of a list marker at `start`, when one is there and a space or tab follows it. */
export function markerEnd(text: string, start: number): number | null {
	let at = start;
	const first = at < text.length ? text.charCodeAt(at) : -1;
	if (first === 0x2d || first === 0x2a || first === 0x2b) {
		at++;
	} else {
		while (at < text.length && at - start < 9 && text.charCodeAt(at) >= 0x30 && text.charCodeAt(at) <= 0x39) at++;
		const after = at < text.length ? text.charCodeAt(at) : -1;
		if (at === start || (after !== 0x2e && after !== 0x29)) return null;
		at++;
	}
	return at < text.length && isSpace(text.charCodeAt(at)) ? at : null;
}

/** The box after a list marker that ends at `markerEnd`: its marker and the marker's offset. */
export function box(text: string, afterMarkerEnd: number): { marker: string; offset: number } | null {
	if (afterMarkerEnd > text.length) return null;
	let lineEnd = afterMarkerEnd;
	while (lineEnd < text.length && text[lineEnd] !== "\n" && text[lineEnd] !== "\r") lineEnd++;
	const start = boxStart(text, afterMarkerEnd, lineEnd);
	if (start === null) return null;
	return { marker: text.charAt(start + 1), offset: start + 1 };
}
