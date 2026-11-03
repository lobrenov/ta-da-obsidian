import { type App, Notice, type TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import { areaTrashMessage, areaTrashTitle, filesToTrash } from "../core/storage/trashPlan";
import { DeleteAreaModal } from "./DeleteAreaModal";

/**
 * Trashes each path's file as the user's Files and links setting says, the first path first. A file already gone is
 * skipped. The first failure stops the rest, so a project or area that can't move keeps its contents; one notice says
 * which file failed and how many didn't move.
 */
export async function trashPaths(app: App, paths: string[]): Promise<void> {
	for (const [at, path] of paths.entries()) {
		const file = app.vault.getFileByPath(path);
		if (!file) continue;
		try {
			await app.fileManager.trashFile(file);
		} catch (error) {
			const left = paths.length - at;
			new Notice(`Couldn't delete “${file.basename}”: ${error instanceof Error ? error.message : String(error)}. ${left === 1 ? "1 file" : `${left} files`} didn't move.`);
			return;
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
