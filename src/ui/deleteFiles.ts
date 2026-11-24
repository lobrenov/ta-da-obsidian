import { type App, Notice, type TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import { areaTrashMessage, areaTrashTitle, deletesPermanently, filesToTrash, projectDeleteMessage } from "../core/storage/trashPlan";
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

/** Deletes a project with its live tasks, after asking when Obsidian deletes permanently; an area, with its projects and their tasks and its own, after asking. */
export function deleteItem(app: App, index: VaultIndex, file: TFile): void {
	const item = index.get(file.path);
	const paths = filesToTrash(index, file.path);
	const trashOption = app.vault.getConfig?.("trashOption");
	const confirm = (): void => void trashPaths(app, paths);
	if (item?.properties.kind === "area") new DeleteAreaModal(app, areaTrashTitle(item), areaTrashMessage(index, item, trashOption), paths.length, confirm).open();
	else if (item?.properties.kind === "project" && deletesPermanently(trashOption)) new DeleteAreaModal(app, areaTrashTitle(item), projectDeleteMessage(index, item), paths.length, confirm).open();
	else confirm();
}
