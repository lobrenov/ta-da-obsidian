import { identityKey, trimBlanks } from "../text";

/**
 * A tag, from `tags:` or an inline `#tag`. `/` nests: `home/garden` is a child of `home`.
 * Tags match by `path`, ignoring case; `name` keeps the spelling as written.
 */
export interface Tag {
	/** As written, without `#` or empty segments, for example `Home/Garden`. */
	readonly name: string;
	/** `name` lowercased: the tag's identity, for example `home/garden`. */
	readonly path: string;
}

/** Reads a tag as written: a leading `#` and empty segments are dropped. Null when nothing is left. */
export function readTag(text: string): Tag | null {
	let rest = trimBlanks(text);
	if (rest.startsWith("#")) rest = rest.slice(1);
	const segments = rest
		.split("/")
		.map((segment) => trimBlanks(segment))
		.filter((segment) => segment !== "");
	if (segments.length === 0) return null;
	const name = segments.join("/");
	return { name, path: identityKey(name) };
}

/** The tags without repeats of an earlier one's path. */
export function uniqueTags(tags: Tag[]): Tag[] {
	const seen = new Set<string>();
	return tags.filter((tag) => {
		if (seen.has(tag.path)) return false;
		seen.add(tag.path);
		return true;
	});
}
