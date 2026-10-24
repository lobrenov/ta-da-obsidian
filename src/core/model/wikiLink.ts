import { imageExtensions } from "../storage/vault";
import { trimBlanks } from "../text";
import { titleOfPath } from "./item";

/** The parts of a link's inner text: `target#heading|alias` or `target#^block|alias`. */
export interface WikiLinkParts {
	target: string;
	heading: string | null;
	block: string | null;
	alias: string | null;
}

/**
 * Splits the text between `[[` and `]]`. The `|` splits first, then the first `#`; the target is trimmed of spaces
 * and tabs, and empty for the same file. A `\|` splits like `|` (the backslash goes). Null when there's neither a
 * target nor a heading or block. An empty heading, block or alias is none.
 */
export function wikiLinkParts(inner: string): WikiLinkParts | null {
	let rest = inner;
	let alias: string | null = null;
	let heading: string | null = null;
	let block: string | null = null;
	const bar = rest.indexOf("|");
	if (bar >= 0) {
		alias = rest.slice(bar + 1);
		rest = rest.slice(0, bar);
		if (rest.endsWith("\\")) rest = rest.slice(0, -1);
	}
	const hash = rest.indexOf("#");
	if (hash >= 0) {
		const fragment = rest.slice(hash + 1);
		if (fragment.startsWith("^")) block = fragment.slice(1);
		else heading = fragment;
		rest = rest.slice(0, hash);
	}
	const target = trimBlanks(rest);
	if (heading === "") heading = null;
	if (block === "") block = null;
	if (alias === "") alias = null;
	if (target === "" && (heading ?? block ?? "") === "") return null;
	return { target, heading, block, alias };
}

/**
 * An Obsidian-style link: `[[Title]]`, `[[Title|alias]]`, `[[Title#heading]]` or `[[folder/Title]]`. An embed is the
 * same with a leading `!`, for example `![[front.jpg]]`.
 */
export interface WikiLink {
	/** The link as written before any `#` or `|`, for example `folder/Title`. */
	readonly target: string;
	/** A block reference is a heading starting with `^`. */
	readonly heading: string | null;
	readonly alias: string | null;
}

/** Nil-safe constructor: null when `target` is empty. */
export function makeWikiLink(
	target: string,
	heading: string | null,
	block: string | null,
	alias: string | null,
): WikiLink | null {
	if (target === "") return null;
	return { target, heading: heading ?? (block !== null ? `^${block}` : null), alias };
}

/** Parses the text between `[[` and `]]`. Null for a link within the same file (`[[#heading]]`). */
export function readWikiLinkInner(inner: string): WikiLink | null {
	const parts = wikiLinkParts(inner);
	return parts && makeWikiLink(parts.target, parts.heading, parts.block, parts.alias);
}

/** Parses a whole `[[...]]` value, such as the `project` property. Surrounding spaces and tabs are allowed. */
export function readWikiLink(text: string): WikiLink | null {
	const trimmed = trimBlanks(text);
	const match = /^\[\[([^[\]\n]+)\]\]$/.exec(trimmed);
	return match?.[1] === undefined ? null : readWikiLinkInner(match[1]);
}

/** The title of the file the link points at: the target's last path component, without `.md`. */
export function linkTitle(link: WikiLink): string {
	return titleOfPath(link.target);
}

/** The image filename the target names, for example `front.jpg` for `attachments/front.jpg`; null when it isn't an image. */
export function attachmentName(link: WikiLink): string | null {
	const parts = link.target.split("/").filter((part) => part !== "");
	const name = parts[parts.length - 1] ?? "";
	const dot = name.lastIndexOf(".");
	if (dot < 0 || !imageExtensions.has(name.slice(dot + 1).toLowerCase())) return null;
	return name;
}
