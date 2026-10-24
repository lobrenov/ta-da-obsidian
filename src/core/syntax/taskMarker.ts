import { taskMarkers } from "../model/checkbox";

const markerUnits: ReadonlySet<number> = new Set(taskMarkers.map((marker) => marker.charCodeAt(0)));

export function isTaskMarker(code: number): boolean {
	return markerUnits.has(code);
}

/**
 * Where a list item's box starts after its marker, which ends at `markerEnd` (GFM: one to four spaces or tabs,
 * `[c]` with a marker `c`, then a space or tab). The `[`'s offset; null without a box.
 */
export function boxStart(text: string, markerEnd: number, end: number): number | null {
	const isSpace = (at: number): boolean => at < end && (text.charCodeAt(at) === 0x20 || text.charCodeAt(at) === 0x09);
	let box = markerEnd;
	while (box - markerEnd < 4 && isSpace(box)) box++;
	if (
		box > markerEnd &&
		box + 3 < end &&
		text.charCodeAt(box) === 0x5b &&
		text.charCodeAt(box + 2) === 0x5d &&
		isSpace(box + 3) &&
		isTaskMarker(text.charCodeAt(box + 1))
	) {
		return box;
	}
	return null;
}
