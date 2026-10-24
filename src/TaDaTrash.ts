import type { DataAdapter } from "obsidian";
import { trashFolder } from "./core/storage/vault";
import { trashedItems, type TrashedItem } from "./core/storage/trash";

/** The Ta Da files and notes in `.trash/`, which Obsidian's vault API hides, read through the adapter. */
export async function readTrash(adapter: DataAdapter): Promise<TrashedItem[]> {
	const files: { path: string; text: string }[] = [];
	const walk = async (folder: string): Promise<void> => {
		const listing = await adapter.list(folder).catch(() => ({ files: [], folders: [] }));
		await Promise.all([
			...listing.files
				.filter((path) => path.toLowerCase().endsWith(".md") && !isHidden(path))
				.map(async (path) => {
					const text = await adapter.read(path).catch(() => null);
					if (text !== null) files.push({ path, text });
				}),
			...listing.folders.filter((path) => !isHidden(path)).map(walk),
		]);
	};
	await walk(trashFolder);
	return trashedItems(files);
}

/** A hidden file or folder below `.trash/`. */
function isHidden(path: string): boolean {
	return path.split("/").slice(1).some((part) => part.startsWith("."));
}
