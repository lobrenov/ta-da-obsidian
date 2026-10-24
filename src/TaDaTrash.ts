import type { DataAdapter } from "obsidian";
import { trashFolder } from "./core/storage/vault";
import { trashedItems, type TrashedItem } from "./core/storage/trash";

/** How many adapter calls run at once. */
export const maxParallelReads = 8;

/** A function that runs the tasks given to it, at most `limit` at a time. */
function limited(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
	let running = 0;
	const waiting: (() => void)[] = [];
	return async (task) => {
		if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
		running++;
		try {
			return await task();
		} finally {
			running--;
			waiting.shift()?.();
		}
	};
}

/** The Ta Da files and notes in `.trash/`, which Obsidian's vault API hides, read through the adapter. */
export async function readTrash(adapter: DataAdapter): Promise<TrashedItem[]> {
	const files: { path: string; text: string }[] = [];
	const run = limited(maxParallelReads);
	const walk = async (folder: string): Promise<void> => {
		const listing = await run(() => adapter.list(folder)).catch(() => ({ files: [], folders: [] }));
		await Promise.all([
			...listing.files
				.filter((path) => path.toLowerCase().endsWith(".md") && !isHidden(path))
				.map(async (path) => {
					const text = await run(() => adapter.read(path)).catch(() => null);
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
