import type { SettingsFiles } from "../src/settingsData";
import type { Item } from "../src/core/model/item";
import { parseItem } from "../src/core/parsing/parseItem";

/** An item from frontmatter lines and an optional body. */
export function makeItem(path: string, frontmatter: string, body = ""): Item {
	const item = parseItem(`---\n${frontmatter}\n---\n${body}`, path);
	if (!item) throw new Error(`Not a Ta Da file: ${path}`);
	return item;
}

export function titles(items: Item[]): string[] {
	return items.map((item) => item.title);
}

/** Vault files in memory, by path, for a `SettingsStore`; `update` reads and writes the way the real files do. */
export function memoryFiles(initial: Record<string, string> = {}): SettingsFiles & { files: Map<string, string> } {
	const files = new Map(Object.entries(initial));
	return {
		files,
		configDir: ".obsidian",
		read: async (path) => files.get(path) ?? null,
		update: async (path, change) => void files.set(path, change(files.get(path) ?? null)),
	};
}
