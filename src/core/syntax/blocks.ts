import { isWhitespaceUnit, trimBlanks, trimWhitespace } from "../text";
import { isNumberChar, lineRanges, type Range, substring } from "./ranges";

/** The block-level classification of a run of lines. */
export type BlockKind =
	| "paragraph"
	| "heading"
	| "blockquote"
	| "list"
	| "fencedCode"
	| "indentedCode"
	| "html"
	| "blockLatex"
	| "table"
	| "thematicBreak"
	| "blank";

/** One block; `range` is the span of its lines, tiling the document with no gaps. */
export interface Block {
	kind: BlockKind;
	range: Range;
}

export interface ListContext {
	inList: boolean;
	lastIsList: boolean;
}

/**
 * Splits `text` into gap-free blocks: block structure first, inline content later. `prefix` is the list context of
 * the blocks before `text`.
 */
export function computeBlocks(text: string, prefix: ListContext = { inList: false, lastIsList: false }): Block[] {
	if (text.length === 0) return [];
	const lines = lineRanges(text);
	const lineTexts = lines.map((line) => substring(text, line));
	const lineText = (i: number): string => lineTexts[i] ?? "";
	const union = (from: number, to: number): Range => {
		const first = lines[from];
		const last = lines[to];
		if (!first || !last) throw new RangeError("line out of range");
		return { location: first.location, length: last.location + last.length - first.location };
	};

	const fenceCloseIndex = (start: number): number | null => {
		const open = fenceOpening(lineText(start));
		if (!open) return null;
		for (let scan = start + 1; scan < lines.length; scan++) {
			if (isFenceClose(lineText(scan), open)) return scan;
		}
		return null;
	};

	const htmlBlockEnd = (type: number, start: number): number => {
		if (type <= 5) {
			for (let scan = start; scan < lines.length; scan++) {
				if (htmlBlockCloses(lineText(scan), type)) return scan;
			}
			return lines.length - 1;
		}
		let end = start;
		while (end + 1 < lines.length && !isBlank(lineText(end + 1))) end++;
		return end;
	};

	const blockLatexCloseIndex = (start: number): number | null => {
		const open = trimWhitespace(lineText(start));
		if (open.slice(2).includes("$$")) return start;
		for (let j = start + 1; j < lines.length; j++) {
			if (lineText(j).includes("$$")) return j;
		}
		return null;
	};

	const blocks: Block[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lineText(i);

		if (isBlank(line)) {
			let end = i;
			while (end + 1 < lines.length && isBlank(lineText(end + 1))) end++;
			blocks.push({ kind: "blank", range: union(i, end) });
			i = end + 1;
		} else if (isIndentedCode(line) && !listContext(blocks, blocks.length, prefix)) {
			let end = i;
			for (let scan = i + 1; scan < lines.length; scan++) {
				const next = lineText(scan);
				if (isIndentedCode(next)) end = scan;
				else if (!isBlank(next)) break;
			}
			blocks.push({ kind: "indentedCode", range: union(i, end) });
			i = end + 1;
		} else if (isFence(line) && fenceCloseIndex(i) !== null) {
			const end = fenceCloseIndex(i) as number;
			blocks.push({ kind: "fencedCode", range: union(i, end) });
			i = end + 1;
		} else if (htmlBlockStart(line) !== null) {
			const end = htmlBlockEnd(htmlBlockStart(line) as number, i);
			blocks.push({ kind: "html", range: union(i, end) });
			i = end + 1;
		} else if (isThematicBreak(line)) {
			blocks.push({ kind: "thematicBreak", range: union(i, i) });
			i += 1;
		} else if (isHeading(line)) {
			blocks.push({ kind: "heading", range: union(i, i) });
			i += 1;
		} else if (isBlockquote(line)) {
			let end = i;
			while (end + 1 < lines.length && isBlockquote(lineText(end + 1))) end++;
			blocks.push({ kind: "blockquote", range: union(i, end) });
			i = end + 1;
		} else if (isListItem(line)) {
			let end = i;
			while (end + 1 < lines.length && isListItem(lineText(end + 1))) end++;
			blocks.push({ kind: "list", range: union(i, end) });
			i = end + 1;
		} else if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lineText(i + 1), line)) {
			let end = i + 1;
			while (end + 1 < lines.length && isTableRow(lineText(end + 1))) end++;
			blocks.push({ kind: "table", range: union(i, end) });
			i = end + 1;
		} else if (isBlockLatexOpen(line) && blockLatexCloseIndex(i) !== null) {
			const end = blockLatexCloseIndex(i) as number;
			blocks.push({ kind: "blockLatex", range: union(i, end) });
			i = end + 1;
		} else {
			// Paragraph: merge consecutive plain lines. A `===` or `---` underline makes it a setext heading.
			let end = i;
			let setext = false;
			while (end + 1 < lines.length) {
				const next = lineText(end + 1);
				if (isSetextUnderline(next)) {
					end++;
					setext = true;
					break;
				}
				if (isBlank(next)) break;
				// An indented line continues the paragraph, whatever it looks like.
				if (isIndentedCode(next)) {
					end++;
					continue;
				}
				if (isThematicBreak(next) || isHeading(next) || isBlockquote(next) || (isListItem(next) && !isEmptyListItem(next))) break;
				const type = htmlBlockStart(next);
				if (type !== null && type <= 6) break;
				// A table, a CLOSED code fence or a block-LaTeX run interrupts it; an unclosed opener stays part of it.
				if (isFence(next) && fenceCloseIndex(end + 1) !== null) break;
				if (isTableRow(next) && end + 2 < lines.length && isTableSeparator(lineText(end + 2), next)) break;
				if (isBlockLatexOpen(next) && blockLatexCloseIndex(end + 1) !== null) break;
				end++;
			}
			blocks.push({ kind: setext ? "heading" : "paragraph", range: union(i, end) });
			i = end + 1;
		}
	}
	return blocks;
}

/**
 * Whether lines indented 4 columns after `blocks[0..<end]` continue a list (so aren't indented code): the last
 * non-blank block is a list, or a paragraph straight after one (a lazy line).
 */
function listContext(blocks: Block[], end: number, prefix: ListContext): boolean {
	let i = end - 1;
	while (i >= 0 && blocks[i]?.kind === "blank") i--;
	if (i < 0) return prefix.inList;
	switch (blocks[i]?.kind) {
		case "list":
			return true;
		case "paragraph":
			return i > 0 ? blocks[i - 1]?.kind === "list" : prefix.lastIsList;
		default:
			return false;
	}
}

// MARK: Line classification

export function isBlank(line: string): boolean {
	return trimWhitespace(line) === "";
}

export interface Fence {
	character: string;
	count: number;
}

function leadingSpaces(line: string): number {
	let count = 0;
	while (line[count] === " ") count++;
	return count;
}

/** An opening fence line: up to 3 spaces, then 3+ backticks (no backtick after) or 3+ tildes. */
export function fenceOpening(line: string): Fence | null {
	const indent = leadingSpaces(line);
	if (indent > 3) return null;
	const rest = line.slice(indent);
	const c = rest[0];
	if (c !== "`" && c !== "~") return null;
	let count = 0;
	while (rest[count] === c) count++;
	if (count < 3) return null;
	if (c === "`" && rest.slice(count).includes("`")) return null;
	return { character: c, count };
}

function isFence(line: string): boolean {
	return fenceOpening(line) !== null;
}

/** A closing fence for `open`: up to 3 spaces, at least as many of its character, then only whitespace. */
function isFenceClose(line: string, open: Fence): boolean {
	const indent = leadingSpaces(line);
	if (indent > 3) return false;
	const rest = line.slice(indent);
	let count = 0;
	while (rest[count] === open.character) count++;
	if (count < open.count) return false;
	for (let k = count; k < rest.length; k++) {
		if (!isWhitespaceUnit(rest.charCodeAt(k))) return false;
	}
	return true;
}

/** A line indented 4 or more columns (a tab reaches the next multiple of 4), with content. */
export function isIndentedCode(line: string): boolean {
	let column = 0;
	for (const c of line) {
		if (c === " ") column += 1;
		else if (c === "\t") column += 4 - (column % 4);
		else break;
		if (column >= 4) return !isBlank(line);
	}
	return false;
}

/** A setext underline: up to 3 spaces, a run of `=` or of `-`, then only whitespace. */
function isSetextUnderline(line: string): boolean {
	if (leadingSpaces(line) > 3) return false;
	const t = trimWhitespace(line);
	const first = t[0];
	if (first !== "=" && first !== "-") return false;
	for (const c of t) if (c !== first) return false;
	return true;
}

const htmlRawTags = ["script", "pre", "style", "textarea"];
const htmlBlockTags: ReadonlySet<string> = new Set([
	"address", "article", "aside", "base", "basefont", "blockquote", "body", "caption", "center", "col",
	"colgroup", "dd", "details", "dialog", "dir", "div", "dl", "dt", "fieldset", "figcaption", "figure",
	"footer", "form", "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html",
	"iframe", "legend", "li", "link", "main", "menu", "menuitem", "nav", "noframes", "ol", "optgroup",
	"option", "p", "param", "search", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead",
	"title", "tr", "track", "ul",
]);

/** Foundation's `CharacterSet.newlines`. */
function trimNewlines(text: string): string {
	const isNewline = (code: number): boolean => (code >= 0x0a && code <= 0x0d) || code === 0x85 || code === 0x2028 || code === 0x2029;
	let start = 0;
	let end = text.length;
	while (start < end && isNewline(text.charCodeAt(start))) start++;
	while (end > start && isNewline(text.charCodeAt(end - 1))) end--;
	return text.slice(start, end);
}

/** The CommonMark HTML block type (1 to 7) a line opens, if any. */
export function htmlBlockStart(line: string): number | null {
	const indent = leadingSpaces(line);
	if (indent > 3) return null;
	const rest = trimNewlines(line.slice(indent));
	if (!rest.startsWith("<")) return null;
	const lower = rest.toLowerCase();
	for (const tag of htmlRawTags) {
		if (lower.startsWith(`<${tag}`)) {
			const after = lower[tag.length + 1];
			if (after === undefined || after === " " || after === "\t" || after === ">") return 1;
		}
	}
	if (rest.startsWith("<!--")) return 2;
	if (rest.startsWith("<?")) return 3;
	if (rest.startsWith("<![CDATA[")) return 5;
	if (rest.startsWith("<!") && /^[A-Za-z]/.test(rest.slice(2, 3))) return 4;
	const open = lower.startsWith("</") ? 2 : 1;
	const name = /^[a-z0-9-]*/.exec(lower.slice(open))?.[0] ?? "";
	if (htmlBlockTags.has(name)) {
		const after = lower.slice(open + name.length);
		if (after === "" || after.startsWith(" ") || after.startsWith("\t") || after.startsWith(">") || after.startsWith("/>")) {
			return 6;
		}
	}
	if (isCompleteTagLine(rest)) return 7;
	return null;
}

const completeTagLine =
	/^(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)\s*$/;

/** An open or closing tag, then only whitespace (type 7). */
function isCompleteTagLine(line: string): boolean {
	return completeTagLine.test(line);
}

/** Whether `line` ends an HTML block of `type` (1 to 5). */
function htmlBlockCloses(line: string, type: number): boolean {
	switch (type) {
		case 1: {
			const lower = line.toLowerCase();
			return htmlRawTags.some((tag) => lower.includes(`</${tag}>`));
		}
		case 2:
			return line.includes("-->");
		case 3:
			return line.includes("?>");
		case 4:
			return line.includes(">");
		default:
			return line.includes("]]>");
	}
}

/** A solid run of 3+ of one of `- * _`, with optional surrounding whitespace. */
function isThematicBreak(line: string): boolean {
	const t = trimWhitespace(line);
	const first = t[0];
	if (t.length < 3 || (first !== "-" && first !== "*" && first !== "_")) return false;
	for (const c of t) if (c !== first) return false;
	return true;
}

/** 1 to 6 hashes after optional indent, then a space. */
export function isHeading(line: string): boolean {
	let i = 0;
	while (line[i] === " " || line[i] === "\t") i++;
	let hashes = 0;
	while (line[i] === "#") {
		hashes++;
		i++;
	}
	return hashes >= 1 && hashes <= 6 && line[i] === " ";
}

/** Up to 3 leading spaces or tabs, then a `>`. */
export function isBlockquote(line: string): boolean {
	let i = 0;
	while (i < 3 && (line[i] === " " || line[i] === "\t")) i++;
	return line[i] === ">";
}

function isNewlineChar(c: string): boolean {
	return c === "\n" || c === "\r" || c === "\v" || c === "\f" || c === "\u0085" || c === "\u2028" || c === "\u2029";
}

/** A list-item line: optional indent, a bullet or ordered marker, then a space or tab, or nothing (an empty item). */
export function isListItem(line: string): boolean {
	let i = 0;
	while (line[i] === " " || line[i] === "\t") i++;
	const first = line[i];
	if (first === undefined) return false;
	if (first === "-" || first === "*" || first === "+") {
		i++;
	} else if (isNumberChar(first)) {
		let digits = 0;
		while (i < line.length && isNumberChar(line[i] as string) && digits < 9) {
			i++;
			digits++;
		}
		const d = line[i];
		if (d !== "." && d !== ")") return false;
		i++;
	} else {
		return false;
	}
	const after = line[i];
	if (after === undefined) return true;
	return after === " " || after === "\t" || isNewlineChar(after);
}

/** A list-item line with nothing after its marker. It can't interrupt a paragraph. */
function isEmptyListItem(line: string): boolean {
	if (!isListItem(line)) return false;
	let i = 0;
	while (line[i] === " " || line[i] === "\t") i++;
	while (i < line.length && isNumberChar(line[i] as string)) i++;
	i++;
	for (; i < line.length; i++) {
		const c = line[i] as string;
		if (c !== " " && c !== "\t" && !isNewlineChar(c)) return false;
	}
	return true;
}

/** A row's cells, split on unescaped pipes, without the outer ones. */
function tableCells(line: string): string[] {
	let t = trimWhitespace(line);
	if (t.startsWith("|")) t = t.slice(1);
	if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1);
	const cells: string[] = [];
	let start = 0;
	let escaped = false;
	for (let i = 0; i < t.length; i++) {
		if (escaped) {
			escaped = false;
			continue;
		}
		if (t[i] === "\\") {
			escaped = true;
		} else if (t[i] === "|") {
			cells.push(t.slice(start, i));
			start = i + 1;
		}
	}
	cells.push(t.slice(start));
	return cells;
}

/** A GFM table row: any line holding an unescaped `|`; the outer pipes are optional. */
export function isTableRow(line: string): boolean {
	if (tableCells(line).length > 1) return true;
	const t = trimWhitespace(line);
	return t.length >= 2 && t.startsWith("|") && t.endsWith("|");
}

/** A GFM delimiter row: cells of `:?-+:?`, outer pipes optional, as many cells as `header`. */
export function isTableSeparator(line: string, header: string): boolean {
	const t = trimWhitespace(line);
	if (!t.includes("|")) return false;
	const cells = tableCells(line);
	if (cells.length === 0 || cells.length !== tableCells(header).length) return false;
	return cells.every((cell) => {
		const c = trimBlanks(cell);
		const dashes = c.replace(/^:+/, "").replace(/:+$/, "");
		return dashes !== "" && /^-+$/.test(dashes) && (c.match(/:/g)?.length ?? 0) <= 2;
	});
}

function isBlockLatexOpen(line: string): boolean {
	return trimWhitespace(line).startsWith("$$");
}
