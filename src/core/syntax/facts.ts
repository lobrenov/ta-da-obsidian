import { type WikiLinkParts, wikiLinkParts } from "../model/wikiLink";
import { isWhitespaceUnit, trimBlanks, trimWhitespace } from "../text";
import { computeBlocks, isTableRow, isTableSeparator } from "./blocks";
import { type BlockNode, type ListItem, parseDocument } from "./document";
import { type InlineNode, linkDestination, parseInlines } from "./inline";
import {
	intersectionLength,
	isLineTerminator,
	lineRange,
	locationInRange,
	maxRange,
	type Range,
	range,
	substring,
	unionRange,
} from "./ranges";
import { parseTable } from "./table";

export interface TaskFact {
	line: number;
	marker: string;
	/** The rest of the item's first line, trimmed, as written. */
	text: string;
	/** Where `[c]` is in the body (UTF-16). */
	box: Range;
}

export interface LinkFact {
	line: number;
	parts: WikiLinkParts;
	/** Where `[[...]]` is in the body (UTF-16). */
	range: Range;
}

export interface EmbedFact {
	line: number;
	target: string;
	heading: string | null;
	block: string | null;
	/** The `|`-separated parts after the target, as written. */
	segments: string[];
	range: Range;
}

export interface TagFact {
	line: number;
	/** Without `#`. */
	name: string;
}

/** What a markdown body holds that Ta Da reads: summary, tasks, links, embeds and tags. */
export interface MarkdownFacts {
	/** The first top-level paragraph's text, without inline markup. */
	summary: string | null;
	tasks: TaskFact[];
	links: LinkFact[];
	embeds: EmbedFact[];
	tags: TagFact[];
}

/** Reads `body` (no frontmatter); its first line is line `firstLineIndex`. */
export function scanFacts(body: string, firstLineIndex = 0): MarkdownFacts {
	const scanner = new FactScanner(body, firstLineIndex, null);
	scanner.scan();
	return scanner.facts;
}

class FactScanner {
	readonly facts: MarkdownFacts = { summary: null, tasks: [], links: [], embeds: [], tags: [] };
	/** UTF-16 offset where each line starts. */
	private readonly lineStarts: number[];
	/** Normalised labels of the reference definitions, the first of each. */
	private definitions: Set<string>;
	/** Where each definition is in the body, and from where a paragraph that starts with some goes on. */
	private definitionRanges: Range[] = [];
	private paragraphRest = new Map<number, number>();
	/** The syntax of the reference links and images found: `[` or `![`, and `][label]` or `]`. */
	private referenceSyntax: Range[] = [];
	/** A table cell's scan reads the document's definitions and holds none. */
	private readonly inheritsDefinitions: boolean;

	constructor(
		private readonly text: string,
		private readonly firstLineIndex: number,
		inherited: Set<string> | null,
	) {
		this.inheritsDefinitions = inherited !== null;
		this.definitions = inherited ?? new Set();
		const starts = [0];
		let cursor = 0;
		while (cursor < text.length) {
			cursor = maxRange(lineRange(text, cursor));
			if (cursor < text.length) starts.push(cursor);
		}
		this.lineStarts = starts;
	}

	scan(): void {
		const parsed = parseDocument(this.text, computeBlocks(this.text));
		if (!this.inheritsDefinitions) this.collectDefinitions(parsed);
		let previous: BlockNode | null = null;
		let afterBlank = false;
		for (const block of parsed) {
			this.scanBlock(block, previous, afterBlank);
			if (block.type === "blank") {
				afterBlank = true;
			} else {
				previous = block;
				afterBlank = false;
			}
		}
	}

	private scanBlock(block: BlockNode, previous: BlockNode | null, afterBlank: boolean): void {
		switch (block.type) {
			case "paragraph": {
				// Definitions at its start aren't its text.
				let region = block.range;
				let inlines = block.inlines;
				const rest = this.paragraphRest.get(block.range.location);
				if (rest !== undefined) {
					region = range(rest, maxRange(block.range) - rest);
					inlines = region.length > 0 ? parseInlines(this.text, region) : [];
				}
				if (region.length === 0) return;
				// First: the summary drops the syntax of the references it finds.
				this.collect(inlines, region, []);
				if (previous?.type === "blockquote" && !afterBlank) return; // a lazy line continues the quote
				if (previous?.type === "list" && !afterBlank) return; // a lazy line of the last item
				if (previous?.type === "list" && afterBlank && this.isIndented(block.range)) return; // a later paragraph of the item
				if (this.facts.summary === null) this.facts.summary = this.plainText(inlines);
				return;
			}
			case "heading":
				this.collect(block.inlines, block.range, []);
				return;
			case "blockquote": {
				this.addTasks(block.items);
				const tables = this.addQuotedTables(block.range);
				const skipped = tables.concat(this.definitionRanges);
				const kept = block.inlines.filter((node) => !skipped.some((r) => locationInRange(nodeStart(node), r)));
				this.collect(kept, block.range, skipped);
				return;
			}
			case "list":
				this.addTasks(block.items);
				for (const item of block.items) {
					if (!this.isDefinition(item.contentRange)) this.collect(item.inlines, item.contentRange, []);
				}
				return;
			case "table": {
				const rows: Range[] = [];
				let start = block.range.location;
				while (start < maxRange(block.range)) {
					const line = lineRange(this.text, start);
					let end = maxRange(line);
					while (end > line.location && isLineTerminator(this.text.charCodeAt(end - 1))) end--;
					if (trimBlanks(this.text.slice(line.location, end)) !== "") rows.push(range(line.location, end - line.location));
					start = maxRange(line);
				}
				this.addTable(rows);
				return;
			}
			default:
				return;
		}
	}

	// MARK: Blocks

	private line(location: number): number {
		let low = 0;
		let high = this.lineStarts.length - 1;
		while (low < high) {
			const mid = Math.floor((low + high + 1) / 2);
			if ((this.lineStarts[mid] as number) <= location) low = mid;
			else high = mid - 1;
		}
		return this.firstLineIndex + low;
	}

	private string(r: Range): string {
		return substring(this.text, r);
	}

	/** Whether `r` starts with 2 or more columns of indent (an item's content column). */
	private isIndented(r: Range): boolean {
		if (r.length <= 0) return false;
		const c = this.text.charCodeAt(r.location);
		const next = this.text.charCodeAt(r.location + 1);
		return c === 0x09 || (c === 0x20 && r.length > 1 && (next === 0x20 || next === 0x09));
	}

	private addTasks(items: ListItem[]): void {
		for (const item of items) {
			if (item.taskMarker === null || item.checkbox === null) continue;
			this.facts.tasks.push({
				line: this.line(item.range.location),
				marker: item.taskMarker,
				text: trimWhitespace(this.string(item.contentRange)),
				box: item.checkbox,
			});
		}
	}

	/** A table's lines, without their line breaks (and quote markers): the header, the delimiter row, the body rows. */
	private addTable(rows: Range[]): void {
		const table = parseTable(rows.map((row) => this.string(row)).join("\n"));
		if (!table || table.rowCount + 1 !== rows.length) return;
		// Each cell is read as a paragraph of its own, unescaped as the editor draws it.
		for (let row = 0; row < table.rowCount; row++) {
			const source = rows[row === 0 ? 0 : row + 1] as Range;
			const rowLine = this.line(source.location);
			const sources = this.cellSources(source);
			for (let column = 0; column < table.columnCount; column++) {
				const text = table.cell(row, column);
				const cellScanner = new FactScanner(text, rowLine, this.definitions);
				cellScanner.scan();
				const cell = cellScanner.facts;
				const cellSource = sources[column];
				if (!cellSource) continue;
				const toSource = this.sourceOffsets(text, cellSource);
				const mapped = (r: Range): Range => {
					const start = toSource[r.location] as number;
					return range(start, (toSource[maxRange(r) - 1] as number) + 1 - start);
				};
				for (const link of cell.links) {
					const r = mapped(link.range);
					this.facts.links.push({ ...link, range: r, line: this.line(r.location) });
				}
				for (const embed of cell.embeds) {
					const r = mapped(embed.range);
					this.facts.embeds.push({ ...embed, range: r, line: this.line(r.location) });
				}
				for (const tag of cell.tags) this.facts.tags.push({ ...tag, line: rowLine });
			}
		}
	}

	/** The tables in a quote's content (a header row, a delimiter row, then rows). Returns the lines they cover. */
	private addQuotedTables(r: Range): Range[] {
		const lines = quoteLines(this.text, r);
		const covered: Range[] = [];
		let i = 0;
		while (i + 1 < lines.length) {
			const current = lines[i] as QuoteLine;
			const nextLine = lines[i + 1] as QuoteLine;
			const header = this.string(current.content);
			if (
				nextLine.level !== current.level ||
				!isTableRow(header) ||
				!isTableSeparator(this.string(nextLine.content), header)
			) {
				i++;
				continue;
			}
			let end = i + 2;
			while (end < lines.length && (lines[end] as QuoteLine).level === current.level && isTableRow(this.string((lines[end] as QuoteLine).content))) end++;
			this.addTable(lines.slice(i, end).map((line) => line.content));
			covered.push(unionRange(current.line, (lines[end - 1] as QuoteLine).line));
			i = end;
		}
		return covered;
	}

	/** Each cell's source in a table row, trimmed, split on the `|`s the table splits on. */
	private cellSources(row: Range): Range[] {
		const isSpace = (i: number): boolean => isBlankUnit(this.text.charCodeAt(i));
		let end = maxRange(row);
		let from = row.location;
		while (from < end && isSpace(from)) from++;
		while (end > from && isSpace(end - 1)) end--;
		const backslashes = (i: number): number => {
			let j = i;
			while (j > from && this.text.charCodeAt(j - 1) === 0x5c) j--;
			return i - j;
		};
		if (from < end && this.text.charCodeAt(from) === 0x7c) from++;
		if (end > from && this.text.charCodeAt(end - 1) === 0x7c && backslashes(end - 1) % 2 === 0) end--;
		const cells: Range[] = [];
		let cellStart = from;
		for (let i = from; i <= end; i++) {
			if (!(i === end || (this.text.charCodeAt(i) === 0x7c && backslashes(i) % 2 === 0))) continue;
			let a = cellStart;
			let b = i;
			while (a < b && isSpace(a)) a++;
			while (b > a && isSpace(b - 1)) b--;
			cells.push(range(a, b - a));
			cellStart = i + 1;
		}
		return cells;
	}

	/** For each UTF-16 offset in a cell's text, the offset in the source it was read from. */
	private sourceOffsets(cell: string, source: Range): number[] {
		const offsets: number[] = [];
		let i = source.location;
		const end = maxRange(source);
		for (let j = 0; j < cell.length; j++) {
			const c = cell.charCodeAt(j);
			while (i < end && this.text.charCodeAt(i) !== c && !(c === 0x0a && this.text.charCodeAt(i) === 0x3c)) i++;
			offsets.push(Math.min(i, end));
			if (c === 0x0a) while (i < end && this.text.charCodeAt(i) !== 0x3e) i++;
			i++;
		}
		return offsets;
	}

	// MARK: Inlines

	/** `region` is the text `nodes` were parsed from: where a reference link is looked for, outside `excluding`. */
	private collect(nodes: InlineNode[], region: Range | null, excluding: Range[]): void {
		if (region) this.addReferenceUses(nodes, region, excluding);
		for (const node of nodes) {
			switch (node.type) {
				case "wikiLink": {
					const parts = wikiLinkParts(this.innerText(node.markers));
					if (parts) this.facts.links.push({ line: this.line((node.markers[0] as Range).location), parts, range: node.range });
					break;
				}
				case "imageEmbed": {
					const pieces = this.innerText(node.markers).split("|");
					const first = pieces[0] as string;
					// A `\|` splits too, its backslash gone.
					const parts = wikiLinkParts(pieces.length > 1 && first.endsWith("\\") ? first.slice(0, -1) : first);
					if (parts) {
						this.facts.embeds.push({
							line: this.line((node.markers[0] as Range).location),
							target: parts.target,
							heading: parts.heading,
							block: parts.block,
							segments: pieces.slice(1),
							range: node.range,
						});
					}
					break;
				}
				case "tag": {
					const nameStart = maxRange(node.marker);
					this.facts.tags.push({
						line: this.line(node.range.location),
						name: this.string(range(nameStart, maxRange(node.range) - nameStart)),
					});
					break;
				}
				case "link":
					this.collect(node.children, null, []);
					break;
				case "emphasis":
				case "ext":
					this.collect(node.children, null, []);
					break;
				default:
					break;
			}
		}
	}

	private innerText(markers: Range[]): string {
		const start = maxRange(markers[0] as Range);
		return this.string(range(start, (markers[1] as Range).location - start));
	}

	// MARK: Reference links

	private isDefinition(r: Range): boolean {
		return this.definitionRanges.some((d) => locationInRange(r.location, d));
	}

	/** A label as CommonMark matches it: case-folded, with whitespace runs collapsed and trimmed. */
	private static normalised(label: string): string {
		return label
			.split(/[\s\u0085]+/)
			.filter((part) => part !== "")
			.join(" ")
			.toLowerCase()
			.replace(/ß/g, "ss");
	}

	/**
	 * The definitions that start a paragraph: a top-level one, a list item's, a quote's or a quoted item's. A
	 * paragraph that continues a list item or a quote (lazy) doesn't start one.
	 */
	private collectDefinitions(blocks: BlockNode[]): void {
		let previous: BlockNode | null = null;
		let afterBlank = false;
		for (const block of blocks) {
			switch (block.type) {
				case "paragraph": {
					const lazy = !afterBlank && (previous?.type === "blockquote" || previous?.type === "list");
					if (!lazy) this.addDefinitions(this.lines(block.range), block.range.location);
					break;
				}
				case "blockquote": {
					let run: Range[] = [];
					let level = 0;
					const flush = (): void => {
						if (run.length > 0) this.addDefinitions(run, null);
						run = [];
					};
					for (const line of quoteLines(this.text, block.range)) {
						const blank = trimBlanks(this.string(line.content)) === "";
						if (blank || line.level !== level) flush();
						if (!blank) {
							run.push(line.content);
							level = line.level;
						}
					}
					flush();
					for (const item of block.items) this.addDefinitions([item.contentRange], null);
					break;
				}
				case "list":
					for (const item of block.items) this.addDefinitions([item.contentRange], null);
					break;
				default:
					break;
			}
			if (block.type === "blank") {
				afterBlank = true;
			} else {
				previous = block;
				afterBlank = false;
			}
		}
	}

	/** The lines of `r` without their line breaks. */
	private lines(r: Range): Range[] {
		const out: Range[] = [];
		let start = r.location;
		while (start < maxRange(r)) {
			const full = lineRange(this.text, start);
			const lineEnd = Math.min(maxRange(full), maxRange(r));
			const lineStart = Math.max(full.location, r.location);
			let end = lineEnd;
			while (end > lineStart && isLineTerminator(this.text.charCodeAt(end - 1))) end--;
			out.push(range(lineStart, end - lineStart));
			start = lineEnd;
		}
		return out;
	}

	/**
	 * Reads the definitions at the start of `lines`, a paragraph's lines. `startsParagraph` is the paragraph's
	 * location when what follows the last one is its text.
	 */
	private addDefinitions(lines: Range[], startsParagraph: number | null): void {
		if (lines.length === 0) return;
		// The lines joined by `\n`, and where each starts in the body.
		const joined = lines.map((line) => this.string(line)).join("\n");
		const starts: number[] = [];
		let offset = 0;
		for (const line of lines) {
			starts.push(offset);
			offset += line.length + 1;
		}
		const source = (virtual: number): number => {
			let low = 0;
			let high = starts.length - 1;
			while (low < high) {
				const mid = Math.floor((low + high + 1) / 2);
				if ((starts[mid] as number) <= virtual) low = mid;
				else high = mid - 1;
			}
			return (lines[low] as Range).location + virtual - (starts[low] as number);
		};
		let at = 0;
		let lastEnd: number | null = null;
		while (at < joined.length) {
			const found = parseDefinition(joined, at);
			if (!found) break;
			const label = FactScanner.normalised(joined.slice(found.label.location, maxRange(found.label)));
			this.definitions.add(label);
			const r = range(source(at), source(Math.max(at, found.end - 1)) + 1 - source(at));
			this.definitionRanges.push(r);
			lastEnd = maxRange(r);
			at = found.end;
		}
		if (startsParagraph !== null && lastEnd !== null) {
			// The paragraph goes on from the next line: the definition's range ends with its line break, or at the end.
			let rest = lastEnd;
			if (rest > 0 && isLineTerminator(this.text.charCodeAt(rest - 1))) {
				if (this.text.charCodeAt(rest - 1) === 0x0d && rest < this.text.length && this.text.charCodeAt(rest) === 0x0a) rest++;
			} else {
				rest = maxRange(lineRange(this.text, Math.min(rest, this.text.length - 1)));
			}
			this.paragraphRest.set(startsParagraph, rest);
		}
	}

	/**
	 * Notes each `[text][label]`, `[text][]` and `[label]` in `region` (and its image forms) whose label a
	 * definition has, so the summary drops their syntax. What is opaque to them is what the inline nodes hold other
	 * than text, `excluding` and the definitions.
	 */
	private addReferenceUses(nodes: InlineNode[], region: Range, excluding: Range[]): void {
		if (this.definitions.size === 0 || region.length <= 0) return;
		const opaque = excluding.concat(this.definitionRanges).filter((r) => intersectionLength(r, region) > 0);
		const inlineLinks: Range[] = [];
		const walk = (list: InlineNode[]): void => {
			for (const node of list) {
				switch (node.type) {
					case "code":
					case "escape":
					case "wikiLink":
					case "imageEmbed":
					case "inlineLatex":
					case "tag":
					case "image":
						opaque.push(node.range);
						break;
					case "link":
						if (node.markers.length === 4) {
							// The text is read for references (a badge's image); the brackets and destination aren't.
							inlineLinks.push(node.range);
							opaque.push(node.markers[0] as Range);
							const second = node.markers[1] as Range;
							opaque.push(range(second.location, maxRange(node.range) - second.location));
							walk(node.children);
						} else {
							opaque.push(node.range);
						}
						break;
					case "emphasis":
						walk(node.children);
						break;
					case "ext":
						if (node.children.length === 0) opaque.push(node.range);
						else walk(node.children);
						break;
					case "text":
						break;
				}
			}
		};
		walk(nodes);
		// Sorted and merged, so a position is looked up by bisection.
		opaque.sort((a, b) => a.location - b.location);
		const merged: Range[] = [];
		for (const r of opaque) {
			const last = merged[merged.length - 1];
			if (last && r.location <= maxRange(last)) merged[merged.length - 1] = unionRange(last, r);
			else merged.push(r);
		}
		const isOpaque = (i: number): boolean => {
			let low = 0;
			let high = merged.length - 1;
			while (low <= high) {
				const mid = Math.floor((low + high) / 2);
				const m = merged[mid] as Range;
				if (i < m.location) high = mid - 1;
				else if (i >= maxRange(m)) low = mid + 1;
				else return true;
			}
			return false;
		};
		// Brackets pair as CommonMark pairs them, innermost first.
		const open: number[] = [];
		const pairs: { open: number; close: number }[] = [];
		const closeOf = new Map<number, number>();
		for (let i = region.location; i < maxRange(region); i++) {
			const c = this.text.charCodeAt(i);
			if ((c !== 0x5b && c !== 0x5d) || isOpaque(i)) continue;
			if (c === 0x5b) {
				open.push(i);
			} else {
				const start = open.pop();
				if (start !== undefined) {
					pairs.push({ open: start, close: i });
					closeOf.set(start, i);
				}
			}
		}
		const hasBracket = (from: number, to: number): boolean => {
			for (let k = from; k < to; k++) {
				const c = this.text.charCodeAt(k);
				if ((c === 0x5b || c === 0x5d) && !isOpaque(k)) return true;
			}
			return false;
		};
		const consumed = new Set<number>();
		const resolved: Range[] = [];
		for (const { open: start, close } of pairs) {
			if (consumed.has(start)) continue;
			let label: Range | null = null;
			let end = close;
			const next = close + 1;
			const labelClose = closeOf.get(next);
			if (next < maxRange(region) && this.text.charCodeAt(next) === 0x5b && labelClose !== undefined) {
				const written = range(next + 1, labelClose - next - 1);
				if (written.length === 0 && !hasBracket(start + 1, close)) {
					label = range(start + 1, close - start - 1); // collapsed
					end = labelClose;
				} else if (!isAllWhitespace(this.string(written)) && !hasBracket(written.location, maxRange(written))) {
					label = written; // full
					end = labelClose;
				} else if (!hasBracket(start + 1, close)) {
					label = range(start + 1, close - start - 1);
				}
			} else if (!hasBracket(start + 1, close)) {
				label = range(start + 1, close - start - 1); // shortcut
			}
			if (!label || isAllWhitespace(this.string(label)) || label.length > 999) continue;
			if (!this.definitions.has(FactScanner.normalised(this.string(label)))) continue;
			const isImage = start > region.location && this.text.charCodeAt(start - 1) === 0x21 && !isOpaque(start - 1);
			const whole = range(start, end + 1 - start);
			// A link holds no link.
			if (!isImage && inlineLinks.concat(resolved).some((r) => intersectionLength(r, whole) > 0 && r.location > start)) continue;
			if (end !== close) consumed.add(close + 1);
			if (!isImage) resolved.push(whole);
			this.referenceSyntax.push(range(isImage ? start - 1 : start, isImage ? 2 : 1));
			this.referenceSyntax.push(range(close, end + 1 - close));
		}
	}

	private plainText(nodes: InlineNode[]): string {
		let out = "";
		const cuts = [...this.referenceSyntax].sort((a, b) => a.location - b.location);
		const walk = (list: InlineNode[]): void => {
			for (const node of list) {
				switch (node.type) {
					case "text": {
						// Without the syntax of a reference link or image, as for an inline one.
						let from = node.range.location;
						for (const cut of cuts) {
							if (intersectionLength(cut, node.range) <= 0) continue;
							const insideStart = Math.max(cut.location, node.range.location);
							const insideEnd = Math.min(maxRange(cut), maxRange(node.range));
							out += withoutHTML(this.string(range(from, insideStart - from)));
							from = insideEnd;
						}
						out += withoutHTML(this.string(range(from, maxRange(node.range) - from)));
						break;
					}
					case "wikiLink":
					case "imageEmbed":
					case "tag":
					case "inlineLatex":
						out += this.string(node.range);
						break;
					case "code":
						out += this.string(node.content);
						break;
					case "escape":
						out += this.string(node.character);
						break;
					case "image":
						out += this.string(node.alt);
						break;
					case "emphasis":
					case "link":
						walk(node.children);
						break;
					case "ext":
						if (node.children.length === 0) out += this.string(node.range);
						else walk(node.children);
						break;
				}
			}
		};
		walk(nodes);
		return joinLines(out);
	}
}

/** Lines split on newlines (empty ones dropped), each trimmed, joined by a space. */
function joinLines(text: string): string {
	const pieces = text.split(/\r\n|[\n\r\v\f\u0085\u2028\u2029]/).filter((piece) => piece !== "");
	return trimBlanks(pieces.map((piece) => trimBlanks(piece)).join(" "));
}

function isAllWhitespace(text: string): boolean {
	for (let i = 0; i < text.length; i++) if (!isWhitespaceUnit(text.charCodeAt(i))) return false;
	return true;
}

/** Foundation's `CharacterSet.whitespaces` for one UTF-16 unit. */
function isBlankUnit(c: number): boolean {
	return c === 0x20 || c === 0x09 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x202f || c === 0x205f || c === 0x3000;
}

function nodeStart(node: InlineNode): number {
	return node.range.location;
}

// MARK: Quote lines

interface QuoteLine {
	/** The line, newline included. */
	line: Range;
	/** After the markers, without the newline. */
	content: Range;
	/** The number of `>`. */
	level: number;
}

/** The lines of the blockquote at `r`: up to three spaces or tabs, then `>`s, each with an optional space or tab. */
function quoteLines(text: string, r: Range): QuoteLine[] {
	const lines: QuoteLine[] = [];
	let lineStart = r.location;
	while (lineStart < maxRange(r)) {
		const line = lineRange(text, lineStart);
		lines.push(parseQuoteLine(text, line));
		lineStart = maxRange(line);
	}
	return lines;
}

function parseQuoteLine(text: string, line: Range): QuoteLine {
	const lineEnd = maxRange(line);
	let i = line.location;
	let indent = 0;
	while (i < lineEnd && indent < 3 && (text.charCodeAt(i) === 0x20 || text.charCodeAt(i) === 0x09)) {
		i++;
		indent++;
	}
	let level = 0;
	let j = i;
	while (j < lineEnd && text.charCodeAt(j) === 0x3e) {
		level++;
		j++;
		if (j < lineEnd && (text.charCodeAt(j) === 0x20 || text.charCodeAt(j) === 0x09)) j++;
	}
	let textEnd = lineEnd;
	while (textEnd > line.location && (text.charCodeAt(textEnd - 1) === 0x0a || text.charCodeAt(textEnd - 1) === 0x0d)) textEnd--;
	const contentStart = Math.min(j, textEnd);
	return { line, content: range(contentStart, textEnd - contentStart), level };
}

// MARK: Reference definitions

interface Definition {
	label: Range;
	end: number;
}

/**
 * A definition (`[label]: destination "title"`) at `start`, a line's start in `text`: its label's range, and where
 * it ends: after the line its last part is on.
 */
function parseDefinition(text: string, start: number): Definition | null {
	const length = text.length;
	const isBlank = (c: number): boolean => c === 0x20 || c === 0x09;
	const lineEnd = (from: number): number => {
		let j = from;
		while (j < length && text.charCodeAt(j) !== 0x0a) j++;
		return j;
	};
	const onlyBlanks = (from: number, to: number): boolean => {
		for (let k = from; k < to; k++) if (!isBlank(text.charCodeAt(k))) return false;
		return true;
	};
	let k = start;
	while (k < length && k - start < 3 && text.charCodeAt(k) === 0x20) k++;
	if (k >= length || text.charCodeAt(k) !== 0x5b) return null;
	let j = k + 1;
	const labelStart = j;
	while (j < length) {
		const c = text.charCodeAt(j);
		if (c === 0x5c && j + 1 < length) {
			j += 2;
			continue;
		}
		if (c === 0x5b) return null;
		if (c === 0x5d) break;
		j++;
	}
	if (
		j >= length ||
		j - labelStart > 999 ||
		j + 1 >= length ||
		text.charCodeAt(j + 1) !== 0x3a ||
		isAllWhitespace(text.slice(labelStart, j))
	) {
		return null;
	}
	// Blanks, with one line ending at most, then the destination.
	let m = j + 2;
	while (m < length && isBlank(text.charCodeAt(m))) m++;
	if (m < length && text.charCodeAt(m) === 0x0a) {
		m++;
		while (m < length && isBlank(text.charCodeAt(m))) m++;
	}
	if (m >= length) return null;
	const destination = linkDestination(text, m, length);
	if (!destination) return null;
	const destinationLineEnd = lineEnd(destination.next);
	const label = range(labelStart, j - labelStart);
	// A title follows after a blank, on the same line or the next, and ends its line.
	let t = destination.next;
	while (t < length && isBlank(text.charCodeAt(t))) t++;
	if (t > destination.next && t < length && text.charCodeAt(t) === 0x0a) {
		t++;
		while (t < length && isBlank(text.charCodeAt(t))) t++;
	}
	if (t > destination.next && t < length && [0x22, 0x27, 0x28].includes(text.charCodeAt(t))) {
		const closer = text.charCodeAt(t) === 0x28 ? 0x29 : text.charCodeAt(t);
		let q = t + 1;
		while (q < length && text.charCodeAt(q) !== closer) {
			if (text.charCodeAt(q) === 0x5c) q++;
			else if (closer === 0x29 && text.charCodeAt(q) === 0x28) break;
			q++;
		}
		if (q < length && text.charCodeAt(q) === closer) {
			const end = lineEnd(q + 1);
			if (onlyBlanks(q + 1, end)) return { label, end: Math.min(end + 1, length) };
		}
	}
	if (!onlyBlanks(destination.next, destinationLineEnd)) return null;
	return { label, end: Math.min(destinationLineEnd + 1, length) };
}

// MARK: HTML in text

const htmlTag = /<!--.*?-->|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/gs;
const entity = /&(?:#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g;
const namedEntities: Readonly<Record<string, string>> = {
	amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®",
	trade: "™", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};

function scalarString(value: number): string | null {
	if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return null;
	return String.fromCodePoint(value);
}

/** Text with inline HTML tags dropped and character references decoded. */
function withoutHTML(text: string): string {
	if (!text.includes("<") && !text.includes("&")) return text;
	const s = text.replace(htmlTag, "");
	return s.replace(entity, (match) => {
		const body = match.slice(1, -1);
		let decoded: string | null;
		if (body.startsWith("#x") || body.startsWith("#X")) decoded = scalarString(Number.parseInt(body.slice(2), 16));
		else if (body.startsWith("#")) decoded = scalarString(Number.parseInt(body.slice(1), 10));
		else decoded = namedEntities[body] ?? null;
		return decoded ?? match;
	});
}

