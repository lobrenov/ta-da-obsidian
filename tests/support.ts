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
