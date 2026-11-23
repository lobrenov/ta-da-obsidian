import type { TFile } from "obsidian";
import { parseItem } from "../../core/parsing/parseItem";
import { click } from "../../core/writing/checklistEditor";
import type { Writer } from "../../Writer";

/**
 * Ticks the subtask line on `lineIndex` of `file` whose box still holds `marker`, as a click on a box does, through the
 * `Writer`. Resolves to whether the file changed; a line that has moved or changed is left alone.
 */
export function tickSubtask(writer: Pick<Writer, "apply">, file: TFile, lineIndex: number, marker: string): Promise<boolean> {
	return writer.apply(file, (text) => {
		const box = parseItem(text, file.path)?.checkboxes.find((entry) => entry.lineIndex === lineIndex && entry.marker === marker);
		return box ? click(box, text) : null;
	});
}
