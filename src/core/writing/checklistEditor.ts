import { type Checkbox, checkboxState } from "../model/checkbox";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Changes one checkbox by replacing only the character between its brackets. Null when `marker` isn't in the
 * reference set, or the text no longer has `box` where it was scanned.
 */
export function setMarker(marker: string, box: Checkbox, text: string): string | null {
	if (checkboxState(marker) === null || marker.length !== 1 || marker.charCodeAt(0) > 0x7f) return null;
	if (box.marker.length !== 1 || box.marker.charCodeAt(0) > 0x7f) return null;
	// The box's column is a UTF-8 offset in its line, so the edit is made on the UTF-8 bytes.
	const bytes = encoder.encode(text);
	let lineStart = 0;
	for (let line = 0; line < box.lineIndex; line++) {
		const newline = bytes.indexOf(0x0a, lineStart);
		if (newline < 0) return null;
		lineStart = newline + 1;
	}
	const at = lineStart + box.column;
	if (
		box.column < 1 ||
		at + 1 >= bytes.length ||
		bytes[at - 1] !== 0x5b ||
		bytes[at] !== box.marker.charCodeAt(0) ||
		bytes[at + 1] !== 0x5d
	) {
		return null;
	}
	bytes[at] = marker.charCodeAt(0);
	return decoder.decode(bytes);
}

/** What a toggle sets: `x` for an open marker, a space for a done or cancelled one, nothing for an icon. */
export function toggledMarker(marker: string): string | null {
	switch (checkboxState(marker)) {
		case "open":
			return "x";
		case "done":
		case "cancelled":
			return " ";
		default:
			return null;
	}
}

/**
 * A click completes an open box (`[x]`) and reopens a done or cancelled one (`[ ]`). Null for icon-only boxes, which
 * ignore clicks, and for stale boxes.
 */
export function click(box: Checkbox, text: string): string | null {
	const marker = toggledMarker(box.marker);
	return marker === null ? null : setMarker(marker, box, text);
}
