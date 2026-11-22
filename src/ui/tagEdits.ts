import type { App } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import type { Tag } from "../core/model/tag";
import { deleteTagInFile, type FileTagEdit, renameTagInFile } from "../core/writing/tagEditor";
import type { Writer } from "../Writer";

/** What a rename or delete did: the files that carried the tag (or a child), and those still carrying it. */
export interface TagEditResult {
	carriers: number;
	/** Files whose `tags:` couldn't be spliced, or that couldn't be read or written. */
	failed: number;
}

export function fileCount(count: number): string {
	return count === 1 ? "1 file" : `${count} files`;
}

/** The modal's count: every file the index has the tag or a child of it in, logged ones included. */
export function carrierCount(index: VaultIndex, tag: Tag): number {
	return index.pathsCarryingOrUnder(tag).length;
}

/** Renames a tag and its children in every file that carries one, in `tags:` and in the body. */
export function renameTagEverywhere(app: App, index: VaultIndex, writer: Pick<Writer, "apply">, tag: Tag, to: Tag): Promise<TagEditResult> {
	return editEverywhere(app, index, writer, tag, (text) => renameTagInFile(tag, to, text));
}

/** Deletes a tag and its children from every file that carries one, in `tags:` and in the body. */
export function deleteTagEverywhere(app: App, index: VaultIndex, writer: Pick<Writer, "apply">, tag: Tag): Promise<TagEditResult> {
	return editEverywhere(app, index, writer, tag, (text) => deleteTagInFile(tag, text));
}

/**
 * Writes each carrier once, in path order, one file at a time through the writer: an open file through its editor,
 * any other through `Vault.process`. A file the edit leaves as it was isn't written. A failure doesn't stop the rest.
 */
async function editEverywhere(app: App, index: VaultIndex, writer: Pick<Writer, "apply">, tag: Tag, edit: (text: string) => FileTagEdit): Promise<TagEditResult> {
	const paths = index.pathsCarryingOrUnder(tag);
	let failed = 0;
	for (const path of paths) {
		const file = app.vault.getFileByPath(path);
		if (!file) {
			failed++;
			continue;
		}
		let unspliceable = false;
		try {
			await writer.apply(file, (text) => {
				const edited = edit(text);
				unspliceable = edited.unspliceable;
				return edited.text === text ? null : edited.text;
			});
		} catch {
			failed++;
			continue;
		}
		if (unspliceable) failed++;
	}
	return { carriers: paths.length, failed };
}

/** The notice for files that still carry the tag; null when none do. It never names a file. */
export function failureMessage(tag: Tag, failed: number): string | null {
	if (failed === 0) return null;
	return failed === 1
		? `1 file still has “${tag.name}”. Ta Da can’t edit its tags property.`
		: `${failed} files still have “${tag.name}”. Ta Da can’t edit their tags property.`;
}
