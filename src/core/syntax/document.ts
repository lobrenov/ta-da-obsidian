import { type Block, computeBlocks, isListItem } from "./blocks";
import { type InlineNode, parseInlines } from "./inline";
import { lineRange, maxRange, type Range, range } from "./ranges";
import { boxStart } from "./taskMarker";

/** One list-item line: marker run, optional GFM checkbox, and the text after them. */
export interface ListItem {
	/** The item's full line, line ending included. */
	range: Range;
	/** The character between the brackets, null without a checkbox. */
	taskMarker: string | null;
	checkbox: Range | null;
	/** The text after the marker (and checkbox). */
	contentRange: Range;
	inlines: InlineNode[];
}

/** A top-level block with its inline children, in document coordinates. */
export type BlockNode =
	| { type: "paragraph"; range: Range; inlines: InlineNode[] }
	| { type: "heading"; range: Range; inlines: InlineNode[] }
	| { type: "blockquote"; range: Range; inlines: InlineNode[]; items: ListItem[] }
	| { type: "list"; range: Range; items: ListItem[] }
	| { type: "table"; range: Range }
	| { type: "blank"; range: Range }
	| { type: "opaque"; range: Range };

const space = 0x20;
const tab = 0x09;
const hash = 0x23;

/** Builds the document tree from `text`'s blocks. */
export function parseDocument(text: string, blocks: Block[] = computeBlocks(text)): BlockNode[] {
	return blocks.map((block) => nodeFor(block, text));
}

function nodeFor(block: Block, text: string): BlockNode {
	switch (block.kind) {
		case "paragraph":
			return { type: "paragraph", range: block.range, inlines: parseInlines(text, block.range) };
		case "heading":
			return { type: "heading", range: block.range, inlines: headingInlines(block.range, text) };
		case "blockquote":
			return {
				type: "blockquote",
				range: block.range,
				inlines: parseInlines(text, block.range),
				items: quotedListItems(block.range, text),
			};
		case "list":
			return { type: "list", range: block.range, items: listItems(block.range, text) };
		case "table":
			return { type: "table", range: block.range };
		case "blank":
			return { type: "blank", range: block.range };
		default:
			return { type: "opaque", range: block.range };
	}
}

function isLineBreak(c: number): boolean {
	return c === 0x0a || c === 0x0d;
}

/** ATX heading content after its `#`s and spaces; a setext heading's lines above its underline. */
function headingInlines(r: Range, text: string): InlineNode[] {
	const end = maxRange(r);
	const firstLine = lineRange(text, r.location);
	if (maxRange(firstLine) < end) {
		const underline = lineRange(text, end - 1);
		let contentEnd = underline.location;
		while (contentEnd > r.location && isLineBreak(text.charCodeAt(contentEnd - 1))) contentEnd--;
		return parseInlines(text, range(r.location, contentEnd - r.location));
	}
	let i = r.location;
	while (i < end && (text.charCodeAt(i) === space || text.charCodeAt(i) === tab)) i++;
	while (i < end && text.charCodeAt(i) === hash) i++;
	let contentStart = i;
	while (contentStart < end && text.charCodeAt(contentStart) === space) contentStart++;
	let contentEnd = end;
	while (contentEnd > contentStart && isLineBreak(text.charCodeAt(contentEnd - 1))) contentEnd--;
	return parseInlines(text, range(contentStart, contentEnd - contentStart));
}

/** Splits a list block into physical items. */
function listItems(r: Range, text: string): ListItem[] {
	const items: ListItem[] = [];
	let cursor = r.location;
	const end = maxRange(r);
	while (cursor < end) {
		const line = lineRange(text, cursor);
		items.push(listItem(line, text, null, true));
		cursor = maxRange(line);
	}
	return items;
}

/** The list items on a quote's lines. Each line's `>` markers (each with an optional space or tab) come off first. */
function quotedListItems(r: Range, text: string): ListItem[] {
	const items: ListItem[] = [];
	let lineStart = r.location;
	while (lineStart < maxRange(r)) {
		const line = lineRange(text, lineStart);
		lineStart = maxRange(line);
		let i = line.location;
		let indent = 0;
		while (i < lineStart && indent < 3 && (text.charCodeAt(i) === space || text.charCodeAt(i) === tab)) {
			i++;
			indent++;
		}
		if (i >= lineStart || text.charCodeAt(i) !== 0x3e) continue;
		while (i < lineStart && text.charCodeAt(i) === 0x3e) {
			i++;
			if (i < lineStart && (text.charCodeAt(i) === space || text.charCodeAt(i) === tab)) i++;
		}
		if (!isListItem(text.slice(i, lineStart))) continue;
		items.push(listItem(line, text, i, false));
	}
	return items;
}

/** Parses one list-item line: indent, marker, optional task checkbox, inline content. */
function listItem(line: Range, text: string, from: number | null, scoped: boolean): ListItem {
	const end = maxRange(line);
	let i = from ?? line.location;
	while (i < end && (text.charCodeAt(i) === space || text.charCodeAt(i) === tab)) i++;
	const c = i < end ? text.charCodeAt(i) : 0;
	if (c === 0x2d || c === 0x2a || c === 0x2b) {
		i++;
	} else {
		let digits = 0;
		while (i < end && text.charCodeAt(i) >= 0x30 && text.charCodeAt(i) <= 0x39 && digits < 9) {
			i++;
			digits++;
		}
		if (i < end) i++;
	}
	const box = boxStart(text, i, end);
	if (i < end && (text.charCodeAt(i) === space || text.charCodeAt(i) === tab)) i++;
	let checkbox: Range | null = null;
	let taskMarker: string | null = null;
	if (box !== null) {
		checkbox = range(box, 3);
		taskMarker = text.charAt(box + 1);
		i = box + 4;
	}
	let contentEnd = end;
	while (contentEnd > i && isLineBreak(text.charCodeAt(contentEnd - 1))) contentEnd--;
	const contentRange = range(i, Math.max(0, contentEnd - i));
	return {
		range: line,
		taskMarker,
		checkbox,
		contentRange,
		inlines: scoped ? parseInlines(text, contentRange) : [],
	};
}
