import type { TFile } from "obsidian";
import { parseItem } from "../../core/parsing/parseItem";
import { click, setMarker } from "../../core/writing/checklistEditor";
import type { Writer } from "../../Writer";

/** A listed line as the card drew it: where it was, what its box held and its text, which together find it again. */
export interface SubtaskTarget {
	lineIndex: number;
	marker: string;
	text: string;
}

/**
 * Sets the box of the subtask `target` in `file`: `done` ticks it as a click does, `cancelled` sets `-`, through the
 * `Writer`. The line is found by its line, marker and text all matching, so a line that has moved or changed is left
 * alone. Resolves to whether the file changed.
 */
export function markSubtask(writer: Pick<Writer, "apply">, file: TFile, target: SubtaskTarget, to: "done" | "cancelled"): Promise<boolean> {
	return writer.apply(file, (text) => {
		const box = parseItem(text, file.path)?.checkboxes.find((entry) => entry.lineIndex === target.lineIndex && entry.marker === target.marker && entry.text === target.text);
		if (!box) return null;
		return to === "done" ? click(box, text) : setMarker("-", box, text);
	});
}
