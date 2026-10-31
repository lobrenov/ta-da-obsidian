import { type App, Notice, type TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import { areaTrashMessage, areaTrashTitle, filesToTrash } from "../core/storage/trashPlan";
import { DeleteAreaModal } from "./DeleteAreaModal";

/** Moves each path's file to `.trash/` (Obsidian numbers a taken name), the first path first. A file already gone is skipped; a failure is a notice and the rest still go. */
export async function trashPaths(app: App, paths: string[]): Promise<void> {
	for (const path of paths) {
		const file = app.vault.getFileByPath(path);
		if (!file) continue;
		try {
			await app.vault.trash(file, false);
		} catch (error) {
			new Notice(`Couldn't delete “${file.basename}”: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}

/** Deletes a project with its live tasks; an area, with its projects and their tasks and its own, after asking. */
export function deleteItem(app: App, index: VaultIndex, file: TFile): void {
	const item = index.get(file.path);
	const paths = filesToTrash(index, file.path);
	if (item?.properties.kind !== "area") {
		void trashPaths(app, paths);
		return;
	}
	new DeleteAreaModal(app, areaTrashTitle(item), areaTrashMessage(index, item), paths.length, () => void trashPaths(app, paths)).open();
}
