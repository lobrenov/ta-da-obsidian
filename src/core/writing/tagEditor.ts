import { isScalar, parseDocument } from "yaml";
import { isTagAncestor, readTag, type Tag } from "../model/tag";
import { parseItem } from "../parsing/parseItem";
import { splitFrontmatter } from "../parsing/frontmatterSplitter";
import { deleteInlineTags, renameInlineTags } from "../syntax/tagEdit";
import { trimBlanks } from "../text";
import {
	characters,
	hasPrefixCharacters,
	isBlank,
	isWhitespaceCharacter,
	splitOnCharacter,
} from "./characters";
import {
	closingFence,
	endingOf,
	flowItem,
	isContinuation,
	keyRange,
	type LineRange,
	scalar,
} from "./frontmatterEditor";
import { Lines } from "./lines";

/*
 * Adds and removes tags in `tags:` by splicing only that key's lines. `addTag` and `removeTag` never touch the body's
 * tags; `renameTag`, `deleteTag` and `renameTagInFile`, `deleteTagInFile` do.
 */

/**
 * Adds a tag to `tags:`, unless it's there already (ignoring case). A flow list stays flow and a block list stays
 * block; an empty key, or a string of comma-separated tags, becomes a flow list. A missing key is added as
 * `tags: [name]` after `createdDate`, or before the closing `---` without one. Text without frontmatter, and values
 * that can't be spliced safely (a block scalar, a string over several lines, a flow list over several lines with
 * comments), are left unchanged.
 */
export function addTag(tag: Tag, text: string): string {
	const file = new Lines(text);
	const closing = closingFence(file);
	if (closing === null) return text;
	const range = tagsRange(file, closing);
	if (!range) {
		const at = keyRange("createdDate", file, closing)?.end ?? closing;
		const ending = endingOf(file.lines[at - 1] as string);
		file.lines.splice(at, 0, `tags: [${flowItem(tag.name)}]${ending}`);
		return file.text;
	}
	const value = readTagsValue(file, range);
	if (!value || value.items.some((item) => itemTag(item)?.path === tag.path)) return text;
	switch (value.style.kind) {
		case "block": {
			const last = value.items[value.items.length - 1]?.line ?? range.start;
			const ending = endingOf(file.lines[last] as string);
			file.lines.splice(last + 1, 0, `${value.style.indent}- ${scalar(tag.name)}${ending}`);
			break;
		}
		default:
			replace(range, file, flowLine([...value.items.map((item) => item.raw), flowItem(tag.name)], value.suffix));
	}
	return file.text;
}

/**
 * Removes a tag from `tags:`, ignoring case, keeping the list's style. Removing the last one leaves `tags:` with no
 * value. A tag that isn't in `tags:`, or a value `addTag` leaves alone, leaves the text unchanged.
 */
export function removeTag(tag: Tag, text: string): string {
	const file = new Lines(text);
	const closing = closingFence(file);
	const range = closing === null ? null : tagsRange(file, closing);
	if (!range) return text;
	const value = readTagsValue(file, range);
	if (!value || !value.items.some((item) => itemTag(item)?.path === tag.path)) return text;
	const kept = value.items.filter((item) => itemTag(item)?.path !== tag.path);
	if (value.style.kind === "block" && kept.length > 0) {
		const removed = value.items.filter((item) => itemTag(item)?.path === tag.path);
		for (const line of removed.flatMap((item) => (item.line === undefined ? [] : [item.line])).reverse()) {
			file.lines.splice(line, 1);
		}
	} else if (kept.length === 0) {
		replace(range, file, `tags:${value.suffix}`);
	} else {
		replace(range, file, flowLine(kept.map((item) => item.raw), value.suffix));
	}
	return file.text;
}

/**
 * Renames a tag and its children in `tags:`, ignoring case: the tag's path becomes `to`'s and a child keeps the rest
 * of its path as written. An item that becomes equal (ignoring case) to one already in the list is dropped, so
 * renaming into an existing tag merges them. List style and quoting are kept as `addTag` does. Returns `text`
 * unchanged when `tags:` holds no match, and null when it carries the tag in a value that can't be spliced safely.
 */
export function renameTag(tag: Tag, to: Tag, text: string): string | null {
	const from = tagSegments(tag).length;
	return editTags(tag, text, (match) => readTag([...tagSegments(to), ...tagSegments(match).slice(from)].join("/")));
}

/**
 * Removes a tag and its children from `tags:`, ignoring case, as `removeTag` does. Returns `text` unchanged when
 * `tags:` holds no match, and null when it carries the tag in a value that can't be spliced safely.
 */
export function deleteTag(tag: Tag, text: string): string | null {
	return editTags(tag, text, () => null);
}

/** What a rename or delete across a whole file gives: the text, and whether `tags:` held the tag where it can't be spliced (left as it was while the body is still edited). */
export interface FileTagEdit {
	text: string;
	unspliceable: boolean;
}

/** Renames a tag and its children in `tags:` and in the body's inline tags. The frontmatter's bytes are never touched by the body edit. */
export function renameTagInFile(tag: Tag, to: Tag, text: string): FileTagEdit {
	return applyToBody(renameTag(tag, to, text), text, (body) => renameInlineTags(tag.name, to.name, body));
}

/** Deletes a tag and its children from `tags:` and from the body's inline tags, as `renameTagInFile`. */
export function deleteTagInFile(tag: Tag, text: string): FileTagEdit {
	return applyToBody(deleteTag(tag, text), text, (body) => deleteInlineTags(tag.name, body));
}

function applyToBody(frontmatter: string | null, text: string, edit: (body: string) => string): FileTagEdit {
	const split = splitFrontmatter(frontmatter ?? text);
	return { text: split.block + edit(split.body), unspliceable: frontmatter === null };
}

const tagSegments = (tag: Tag): string[] => tag.name.split("/").filter((segment) => segment !== "");

/** Applies `transform` to each `tags:` item at `tag` or under it: its replacement, or null to remove it. */
function editTags(tag: Tag, text: string, transform: (tag: Tag) => Tag | null): string | null {
	const file = new Lines(text);
	const closing = closingFence(file);
	const range = closing === null ? null : tagsRange(file, closing);
	if (closing === null || !range) return text;
	const matches = (other: Tag): boolean => other.path === tag.path || isTagAncestor(tag, other);
	const value = readTagsValue(file, range);
	if (!value) return parseItem(text, "x.md")?.properties.tags.some(matches) ? null : text;
	const isMatch = value.items.map((item) => {
		const found = itemTag(item);
		return found !== null && matches(found);
	});
	if (!isMatch.includes(true)) return text;
	const indent = value.style.kind === "block" ? value.style.indent : null;
	const seen = new Set(value.items.flatMap((item, i) => (isMatch[i] ? [] : (itemTag(item)?.path ?? []))));
	const results: (string | null)[] = value.items.map((item, i) => {
		const old = itemTag(item);
		if (!isMatch[i] || old === null) return item.raw;
		const replacement = transform(old);
		if (replacement === null || seen.has(replacement.path)) return null;
		seen.add(replacement.path);
		return replacement.name === old.name ? item.raw : indent === null ? flowItem(replacement.name) : scalar(replacement.name);
	});
	if (results.every((result, i) => result === (value.items[i] as TagsItem).raw)) return text;
	if (indent !== null && results.some((result) => result !== null)) {
		for (let i = value.items.length - 1; i >= 0; i--) {
			const item = value.items[i] as TagsItem;
			const result = results[i] as string | null;
			if (item.line === undefined || result === item.raw) continue;
			if (result === null) file.lines.splice(item.line, 1);
			else file.lines[item.line] = `${indent}- ${result}${item.tail ?? ""}${endingOf(file.lines[item.line] as string)}`;
		}
	} else if (results.every((result) => result === null)) {
		replace(range, file, `tags:${value.suffix}`);
	} else {
		replace(range, file, flowLine(results.filter((result): result is string => result !== null), value.suffix));
	}
	return file.text;
}

/** The `tags:` key's lines, as `keyRange` finds them, also past blank lines followed by more of the value. */
function tagsRange(file: Lines, closing: number): LineRange | null {
	const range = keyRange("tags", file, closing);
	if (!range) return null;
	let end = range.end;
	let next = range.end;
	while (next < closing) {
		const line = Lines.content(file.lines[next] as string);
		next++;
		if (isBlank(line)) continue;
		if (!isContinuation(line)) break;
		end = next;
	}
	return { start: range.start, end };
}

function replace(range: LineRange, file: Lines, line: string): void {
	const ending = endingOf(file.lines[range.end - 1] as string);
	file.lines.splice(range.start, range.end - range.start, line + ending);
}

function flowLine(items: string[], suffix: string): string {
	return `tags: [${items.join(", ")}]${suffix}`;
}

// The value as written

type Style = { kind: "flow" } | { kind: "block"; indent: string } | { kind: "string" } | { kind: "empty" };

interface TagsItem {
	/** The item as written, quotes included. */
	raw: string;
	/** The file line of a block item. */
	line?: number;
	/** What follows a block item's scalar on its line: spaces and a comment. */
	tail?: string;
}

interface TagsValue {
	style: Style;
	items: TagsItem[];
	/** What follows the value on the key's line, such as a comment, or a flow list's `]`. */
	suffix: string;
}

function itemTag(item: TagsItem): Tag | null {
	const text = composeScalar(item.raw);
	return text === null ? null : readTag(text);
}

/** The string a YAML text is as a scalar, with quotes read; null for anything else, or invalid YAML. */
function composeScalar(yaml: string): string | null {
	const doc = parseDocument(yaml, { schema: "failsafe", resolveKnownTags: false });
	if (doc.errors.length > 0 || !isScalar(doc.contents)) return null;
	return String(doc.contents.value);
}

/** The `tags:` key's value as written, read item by item so items keep their spelling and quoting. Null when it can't be spliced safely. */
function readTagsValue(file: Lines, range: LineRange): TagsValue | null {
	const line = Lines.content(file.lines[range.start] as string).slice("tags:".length);
	const comment = commentStart(line);
	const value = trimBlanks(line.slice(0, comment ?? line.length));
	const continuation = file.lines.slice(range.start + 1, range.end).map((entry) => Lines.content(entry));
	if (hasPrefixCharacters(value, "[")) {
		if (range.end - range.start > 1 && (comment !== null || continuation.some((entry) => commentStart(entry) !== null))) {
			return null;
		}
		const joined = [line, ...continuation.map((entry) => trimBlanks(entry))].join(" ");
		const parts = characters(joined);
		const open = parts.indexOf("[");
		const flow = flowItems(parts.slice(open < 0 ? parts.length : open).join(""));
		if (flow === null) return null;
		return { style: { kind: "flow" }, items: flow.items.map((raw) => ({ raw })), suffix: flow.suffix };
	}
	const suffix = comment === null ? "" : ` ${line.slice(comment)}`;
	if (value === "" || ["~", "null", "Null", "NULL"].includes(value)) {
		let style: Style = { kind: "empty" };
		const items: TagsItem[] = [];
		continuation.forEach((content, offset) => {
			const parts = characters(content);
			let indentLength = 0;
			while (parts[indentLength] === " " || parts[indentLength] === "\t") indentLength++;
			const indent = parts.slice(0, indentLength).join("");
			const rest = parts.slice(indentLength).join("");
			if (!(rest === "-" || hasPrefixCharacters(rest, "- "))) return;
			if (style.kind === "empty") style = { kind: "block", indent };
			const body = rest.slice(1);
			const comment = commentStart(body);
			const scalarText = body.slice(0, comment ?? body.length);
			const raw = trimBlanks(scalarText);
			const tail = scalarText.slice(scalarText.indexOf(raw) + raw.length) + (comment === null ? "" : body.slice(comment));
			if (raw !== "") items.push({ raw, line: range.start + 1 + offset, tail });
		});
		return { style, items, suffix };
	}
	if (range.end - range.start !== 1 || hasPrefixCharacters(value, "|") || hasPrefixCharacters(value, ">")) return null;
	const text = composeScalar(value) ?? value;
	const items = splitOnCharacter(text, ",")
		.map((piece) => trimBlanks(piece))
		.filter((piece) => piece !== "")
		.map((piece) => ({ raw: flowItem(piece) }));
	return { style: { kind: "string" }, items, suffix };
}

/** Where a YAML comment starts in a line: a `#` at the start or after whitespace, outside quotes. */
function commentStart(line: string): number | null {
	const parts = characters(line);
	let quote: string | null = null;
	let previous = " ";
	let offset = 0;
	let index = 0;
	const advance = (): void => {
		offset += (parts[index] as string).length;
		index++;
	};
	while (index < parts.length) {
		const c = parts[index] as string;
		if (quote !== null) {
			if (c === "\\" && quote === '"') advance();
			else if (c === quote) quote = null;
		} else if (c === '"' || c === "'") {
			quote = c;
		} else if (c === "#" && isWhitespaceCharacter(previous)) {
			return offset;
		}
		previous = c;
		if (index < parts.length) advance();
	}
	return null;
}

/** The items between `[` and its `]`, split at commas outside quotes and brackets, and the text after `]`. Null when there's no `]`. */
function flowItems(text: string): { items: string[]; suffix: string } | null {
	const parts = characters(text);
	const items: string[] = [];
	let current = "";
	let depth = 0;
	let quote: string | null = null;
	let index = 1;
	while (index < parts.length) {
		const c = parts[index] as string;
		index++;
		if (quote !== null) {
			current += c;
			if (c === "\\" && quote === '"' && index < parts.length) {
				current += parts[index] as string;
				index++;
			} else if (c === quote) {
				quote = null;
			}
			continue;
		}
		if (c === '"' || c === "'") {
			quote = c;
			current += c;
		} else if (c === "[" || c === "{") {
			depth++;
			current += c;
		} else if ((c === "]" || c === ",") && depth === 0) {
			const item = trimBlanks(current);
			if (item !== "") items.push(item);
			current = "";
			if (c === "]") return { items, suffix: parts.slice(index).join("") };
		} else if (c === "]" || c === "}") {
			depth--;
			current += c;
		} else {
			current += c;
		}
	}
	return null;
}
