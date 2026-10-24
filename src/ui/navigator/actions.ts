import { Notice, type TFile } from "obsidian";
import type { LocalDate } from "../../core/model/localDate";
import type { Status } from "../../core/model/status";
import type { Writer } from "../../Writer";
import { statusEdit } from "../header/edits";

/**
 * Sets a file's status through the writer. The edit reads the status from the text it's given, so a file already at
 * `status` is left alone. Resolves once the write is done.
 */
export function applyStatus(writer: Writer, file: TFile, status: Status, today: LocalDate): Promise<void> {
	return writer
		.apply(file, statusEdit(status, file.path, today))
		.then(() => undefined)
		.catch((error: unknown) => {
			new Notice(`Couldn't set the status: ${error instanceof Error ? error.message : String(error)}`);
		});
}
