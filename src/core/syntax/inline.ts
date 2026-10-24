import { isWhitespaceUnit, trimWhitespace } from "../text";
import {
	intersectionLength,
	isLetterChar,
	isNumberChar,
	locationInRange,
	maxRange,
	type Range,
	range,
	rangeContains,
	shift,
} from "./ranges";

/** A node in the inline tree, in document coordinates. */
export type InlineNode =
	| { type: "text"; range: Range }
	| { type: "code"; range: Range; content: Range }
	| { type: "tag"; range: Range; marker: Range }
	| { type: "emphasis"; range: Range; markers: Range[]; children: InlineNode[] }
	| { type: "link"; range: Range; textRange: Range; url: Range; markers: Range[]; children: InlineNode[] }
	| { type: "image"; range: Range; alt: Range; url: Range; markers: Range[] }
	| { type: "wikiLink"; range: Range; name: Range; id: Range | null; markers: Range[] }
	| { type: "imageEmbed"; range: Range; target: Range; markers: Range[] }
	| { type: "inlineLatex"; range: Range; content: Range; markers: Range[] }
	| { type: "escape"; range: Range; character: Range; marker: Range }
	| { type: "ext"; range: Range; contentRange: Range; markers: Range[]; children: InlineNode[] };

type Span =
	| { type: "code"; range: Range; content: Range }
	| { type: "emphasis"; range: Range; open: Range; close: Range }
	| { type: "link"; range: Range; textRange: Range; url: Range; markers: Range[] }
	| { type: "image"; range: Range; alt: Range; url: Range; markers: Range[] }
	| { type: "wikiLink"; range: Range; name: Range; id: Range | null; markers: Range[] }
	| { type: "imageEmbed"; range: Range; target: Range; markers: Range[] }
	| { type: "inlineLatex"; range: Range; content: Range; markers: Range[] }
	| { type: "escape"; range: Range; character: Range; marker: Range }
	| { type: "ext"; range: Range; contentRange: Range; markers: Range[] }
	| { type: "tag"; range: Range; marker: Range }
	| { type: "autolink"; range: Range; url: Range; markers: Range[] };

/** The registered inline syntax: GFM strikethrough and Obsidian highlight; `#tags` are read. */
interface InlineSyntax {
	open: number[];
	close: number[];
	rejectsCloserRun: boolean;
}

const syntaxes: InlineSyntax[] = [
	{ open: [0x7e, 0x7e], close: [0x7e, 0x7e], rejectsCloserRun: true },
	{ open: [0x3d, 0x3d], close: [0x3d, 0x3d], rejectsCloserRun: false },
];

const backtick = 0x60;
const asterisk = 0x2a;
const underscore = 0x5f;
const newline = 0x0a;
const bang = 0x21;
const lbracket = 0x5b;
const rbracket = 0x5d;
const lparen = 0x28;
const rparen = 0x29;
const pipe = 0x7c;
const backslash = 0x5c;
const dollar = 0x24;
const hash = 0x23;

type TagStart = "atBoundary" | "notAtBoundary";

/** Parses the inline content of `r` within `text`, returning nodes in absolute document coordinates. */
export function parseInlines(text: string, r: Range): InlineNode[] {
	return offsetNodes(parse(text.slice(r.location, maxRange(r)), "atBoundary"), r.location);
}

function parse(text: string, tags: TagStart | null): InlineNode[] {
	const len = text.length;
	if (len === 0) return [];

	let claimed: Span[] = scanCodeSpans(text, len);

	claimed = claimed.concat(scanEscapes(text, len, new ClaimedIndex(claimed)));
	claimed = claimed.concat(scanAutolinks(text, len, new ClaimedIndex(claimed)));
	claimed = claimed.concat(scanLinkFamily(text, len, new ClaimedIndex(claimed)));

	let tagSpans: Span[] = [];
	let tagsAfterDelimiters = new Set<number>();
	if (tags) {
		({ spans: tagSpans, afterDelimiters: tagsAfterDelimiters } = scanTags(
			text,
			len,
			new ClaimedIndex(claimed),
			tags === "atBoundary",
		));
	}

	const emphasis = resolveEmphasis(text, len, new ClaimedIndex(claimed.concat(tagSpans)));
	// A tag after `*` or `_` stands only when they open emphasis.
	if (tagsAfterDelimiters.size > 0) {
		const openers = new Set<number>();
		for (const span of emphasis) if (span.type === "emphasis") openers.add(maxRange(span.open));
		tagSpans = tagSpans.filter((span) => !(tagsAfterDelimiters.has(span.range.location) && !openers.has(span.range.location)));
	}

	return buildTree(range(0, len), claimed.concat(tagSpans, emphasis), text);
}

// MARK: Claimed spans

/** The already-claimed ranges, in a form the later passes can consult with a cursor. */
class ClaimedIndex {
	private ranges: Range[];
	private cursor = 0;

	constructor(spans: Span[]) {
		this.ranges = spans.map((span) => span.range).sort((a, b) => a.location - b.location);
	}

	/** A copy with its own cursor, as Swift's value semantics give a pass that takes the index by value. */
	copy(): ClaimedIndex {
		const clone = new ClaimedIndex([]);
		clone.ranges = this.ranges;
		clone.cursor = this.cursor;
		return clone;
	}

	private advance(idx: number): void {
		while (this.cursor < this.ranges.length && maxRange(this.ranges[this.cursor] as Range) <= idx) this.cursor++;
	}

	contains(idx: number): boolean {
		this.advance(idx);
		const current = this.ranges[this.cursor];
		return current !== undefined && locationInRange(idx, current);
	}

	overlaps(r: Range): boolean {
		this.advance(r.location);
		const current = this.ranges[this.cursor];
		return current !== undefined && current.location < maxRange(r);
	}

	overlapping(r: Range): Range[] {
		this.advance(r.location);
		const out: Range[] = [];
		for (let k = this.cursor; k < this.ranges.length && (this.ranges[k] as Range).location < maxRange(r); k++) {
			const candidate = this.ranges[k] as Range;
			if (intersectionLength(candidate, r) > 0) out.push(candidate);
		}
		return out;
	}
}

// MARK: 1. Code spans

function scanCodeSpans(text: string, len: number): Span[] {
	const spans: Span[] = [];
	let i = 0;
	while (i < len) {
		if (text.charCodeAt(i) !== backtick || isEscaped(i, text)) {
			i++;
			continue;
		}
		const runStart = i;
		let j = i;
		while (j < len && text.charCodeAt(j) === backtick) j++;
		const runLen = j - runStart;
		const close = closingBacktickRun(text, j, len, runLen);
		if (close === null) {
			i = j;
			continue;
		}
		const codeRange = range(runStart, close + runLen - runStart);
		spans.push({ type: "code", range: codeRange, content: strippedCodeContent(range(j, close - j), text) });
		i = close + runLen;
	}
	return spans;
}

function closingBacktickRun(text: string, from: number, len: number, runLen: number): number | null {
	let k = from;
	while (k < len) {
		if (text.charCodeAt(k) !== backtick || isEscaped(k, text)) {
			k++;
			continue;
		}
		const start = k;
		while (k < len && text.charCodeAt(k) === backtick) k++;
		if (k - start === runLen) return start;
	}
	return null;
}

function strippedCodeContent(raw: Range, text: string): Range {
	const space = 0x20;
	if (raw.length < 2 || text.charCodeAt(raw.location) !== space || text.charCodeAt(maxRange(raw) - 1) !== space) return raw;
	for (let k = raw.location; k < maxRange(raw); k++) if (text.charCodeAt(k) !== space) return range(raw.location + 1, raw.length - 2);
	return raw;
}

// MARK: 2b. Autolinks

function scanAutolinks(text: string, len: number, claimed: ClaimedIndex): Span[] {
	const spans: Span[] = [];
	let i = 0;
	while (i < len) {
		// Not a `<` that's escaped, or a link's `](<...>)` destination.
		if (
			text.charCodeAt(i) !== 0x3c ||
			claimed.contains(i) ||
			(i >= 2 && text.charCodeAt(i - 1) === 0x28 && text.charCodeAt(i - 2) === 0x5d)
		) {
			i++;
			continue;
		}
		let j = i + 1;
		while (j < len && text.charCodeAt(j) !== 0x3e && text.charCodeAt(j) !== 0x3c && text.charCodeAt(j) > 0x20) j++;
		if (j >= len || text.charCodeAt(j) !== 0x3e || j <= i + 1) {
			i++;
			continue;
		}
		const inner = text.slice(i + 1, j);
		const r = range(i, j + 1 - i);
		if (!isAutolinkTarget(inner) || claimed.overlaps(r)) {
			i++;
			continue;
		}
		spans.push({ type: "autolink", range: r, url: range(i + 1, j - i - 1), markers: [range(i, 1), range(j, 1)] });
		i = j + 1;
	}
	return spans;
}

const schemeAutolink = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*$/;
const emailAutolink =
	/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

function isAutolinkTarget(s: string): boolean {
	return schemeAutolink.test(s) || emailAutolink.test(s);
}

// MARK: 2. Backslash escapes

function scanEscapes(text: string, len: number, claimed: ClaimedIndex): Span[] {
	const spans: Span[] = [];
	let i = 0;
	while (i < len - 1) {
		if (text.charCodeAt(i) === backslash && !claimed.contains(i) && isAsciiPunctuationChar(text.charCodeAt(i + 1))) {
			spans.push({ type: "escape", range: range(i, 2), character: range(i + 1, 1), marker: range(i, 1) });
			i += 2;
		} else {
			i++;
		}
	}
	return spans;
}

// MARK: 3. Link family

function scanLinkFamily(text: string, len: number, claimed: ClaimedIndex): Span[] {
	const hasDisallowedClaimedOverlap = (span: Span): boolean => {
		let inner: Range[];
		switch (span.type) {
			case "link":
				inner = [span.textRange, span.url];
				break;
			case "image":
				inner = [span.alt, span.url];
				break;
			case "wikiLink":
			case "imageEmbed":
				// A backslash in `[[...]]` is a character of it: an escape inside claims nothing.
				return claimed
					.overlapping(span.range)
					.some((r) => !(text.charCodeAt(r.location) === backslash && rangeContains(span.range, r)));
			default:
				return claimed.overlaps(span.range);
		}
		return claimed.overlapping(span.range).some((r) => !inner.some((i) => rangeContains(i, r)));
	};
	const brackets = bracketPairs(text, len, claimed);
	const spans: Span[] = [];
	let i = 0;
	while (i < len) {
		if (claimed.contains(i)) {
			i++;
			continue;
		}
		const span = matchClaimedSpan(text, len, i, brackets);
		if (span && !hasDisallowedClaimedOverlap(span)) {
			spans.push(span);
			i = maxRange(span.range);
		} else {
			i++;
		}
	}
	return spans;
}

function matchClaimedSpan(text: string, len: number, i: number, brackets: number[]): Span | null {
	const builtIn = matchBuiltIn(text, len, i, brackets);
	if (builtIn) return builtIn;
	const c = text.charCodeAt(i);
	for (const syntax of syntaxes) {
		if (syntax.open[0] === c) {
			const span = matchExtensionSpan(text, len, i, syntax);
			if (span) return span;
		}
	}
	return null;
}

function matchBuiltIn(text: string, len: number, i: number, brackets: number[]): Span | null {
	const c = text.charCodeAt(i);
	const c1 = peek(text, i + 1, len);
	const c2 = peek(text, i + 2, len);
	if (c === bang && c1 === lbracket && c2 === lbracket) return matchImageEmbed(text, len, i);
	if (c === lbracket && c1 === lbracket) return matchWikiLink(text, len, i);
	if (c === bang && c1 === lbracket) return matchImage(text, len, i, brackets);
	if (c === lbracket) return matchLink(text, len, i, brackets);
	if (c === dollar && c1 !== dollar) return matchInlineLatex(text, len, i);
	return null;
}

/** A delimited span (`~~strike~~`, `==highlight==`): closes at the first exact closer on the same line. */
function matchExtensionSpan(text: string, len: number, i: number, syntax: InlineSyntax): Span | null {
	const { open, close } = syntax;
	if (!matches(text, len, i, open)) return null;
	if (i > 0 && text.charCodeAt(i - 1) === open[0]) return null;
	const contentStart = i + open.length;
	const closeFirst = close[0];
	for (let k = contentStart; k < len; k++) {
		const ch = text.charCodeAt(k);
		if (ch === newline) return null;
		if (ch === closeFirst) {
			if (!matches(text, len, k, close)) return null;
			if (k === contentStart) return null;
			if (syntax.rejectsCloserRun) {
				const after = peek(text, k + close.length, len);
				if (after !== null && after === close[close.length - 1]) return null;
			}
			return {
				type: "ext",
				range: range(i, k + close.length - i),
				contentRange: range(contentStart, k - contentStart),
				markers: [range(i, open.length), range(k, close.length)],
			};
		}
	}
	return null;
}

function matches(text: string, len: number, i: number, chars: number[]): boolean {
	if (i + chars.length > len) return false;
	return chars.every((u, offset) => text.charCodeAt(i + offset) === u);
}

function peek(text: string, idx: number, len: number): number | null {
	return idx >= 0 && idx < len ? text.charCodeAt(idx) : null;
}

function matchImageEmbed(text: string, len: number, i: number): Span | null {
	const contentStart = i + 3;
	const close = closeDoubleBracket(text, len, contentStart);
	if (close === null) return null;
	return {
		type: "imageEmbed",
		range: range(i, close + 2 - i),
		target: range(contentStart, close - contentStart),
		markers: [range(i, 3), range(close, 2)],
	};
}

function matchWikiLink(text: string, len: number, i: number): Span | null {
	const contentStart = i + 2;
	let pipeIdx = -1;
	for (let k = contentStart; k < len; k++) {
		const ch = text.charCodeAt(k);
		if (ch === newline) return null;
		if (ch === pipe && pipeIdx === -1) pipeIdx = k;
		if (ch === rbracket) {
			if (peek(text, k + 1, len) !== rbracket) return null;
			const r = range(i, k + 2 - i);
			const markers = [range(i, 2), range(k, 2)];
			if (pipeIdx >= 0) {
				return {
					type: "wikiLink",
					range: r,
					name: range(contentStart, pipeIdx - contentStart),
					id: range(pipeIdx + 1, k - (pipeIdx + 1)),
					markers,
				};
			}
			return { type: "wikiLink", range: r, name: range(contentStart, k - contentStart), id: null, markers };
		}
	}
	return null;
}

function matchImage(text: string, len: number, i: number, brackets: number[]): Span | null {
	const altStart = i + 2;
	const closeBracket = closingBracket(i + 1, brackets);
	if (closeBracket === null) return null;
	const closeParen = linkTail(text, len, closeBracket + 1);
	if (closeParen === null) return null;
	const urlStart = closeBracket + 2;
	return {
		type: "image",
		range: range(i, closeParen + 1 - i),
		alt: range(altStart, closeBracket - altStart),
		url: range(urlStart, closeParen - urlStart),
		markers: [range(i, 2), range(closeBracket, 1), range(closeBracket + 1, 1), range(closeParen, 1)],
	};
}

function matchLink(text: string, len: number, i: number, brackets: number[]): Span | null {
	const textStart = i + 1;
	const closeBracket = closingBracket(i, brackets);
	if (closeBracket === null) return null;
	const closeParen = linkTail(text, len, closeBracket + 1);
	if (closeParen === null) return null;
	// A link holds no link: the inner one stands and this `[` stays literal.
	for (let k = textStart; k < closeBracket; k++) {
		if (text.charCodeAt(k) === lbracket && (k > textStart ? text.charCodeAt(k - 1) !== bang : true) && peek(text, k + 1, len) !== lbracket) {
			const inner = closingBracket(k, brackets);
			if (inner !== null && inner < closeBracket && linkTail(text, len, inner + 1) !== null) return null;
		}
	}
	const urlStart = closeBracket + 2;
	return {
		type: "link",
		range: range(i, closeParen + 1 - i),
		textRange: range(textStart, closeBracket - textStart),
		url: range(urlStart, closeParen - urlStart),
		markers: [range(i, 1), range(closeBracket, 1), range(closeBracket + 1, 1), range(closeParen, 1)],
	};
}

/** `$ math $`: single dollars, content has no `$`, passes the math heuristic. */
function matchInlineLatex(text: string, len: number, i: number): Span | null {
	if (i > 0 && text.charCodeAt(i - 1) === dollar) return null;
	const contentStart = i + 1;
	for (let k = contentStart; k < len; k++) {
		const ch = text.charCodeAt(k);
		if (ch === newline) return null;
		if (ch === dollar) {
			if (k <= contentStart || peek(text, k + 1, len) === dollar) return null;
			const content = range(contentStart, k - contentStart);
			if (!isInlineMathContent(text.slice(content.location, maxRange(content)))) return null;
			return {
				type: "inlineLatex",
				range: range(i, k + 1 - i),
				content,
				markers: [range(i, 1), range(k, 1)],
			};
		}
	}
	return null;
}

function closeDoubleBracket(text: string, len: number, from: number): number | null {
	for (let k = from; k < len; k++) {
		const ch = text.charCodeAt(k);
		if (ch === newline) return null;
		if (ch === rbracket) return peek(text, k + 1, len) === rbracket ? k : null;
	}
	return null;
}

function closingBracket(open: number, brackets: number[]): number | null {
	const close = brackets[open];
	return open < brackets.length && close !== undefined && close >= 0 ? close : null;
}

/**
 * For each `[`, the `]` that closes it as CommonMark pairs brackets (innermost first, across line endings), ignoring
 * the claimed spans; -1 where there's none. Empty with no `[`.
 */
function bracketPairs(text: string, len: number, claimedIndex: ClaimedIndex): number[] {
	const claimed = claimedIndex.copy();
	let pairs: number[] = [];
	const open: number[] = [];
	for (let i = 0; i < len; i++) {
		const c = text.charCodeAt(i);
		if ((c !== lbracket && c !== rbracket) || claimed.contains(i)) continue;
		if (c === lbracket) {
			if (pairs.length === 0) pairs = new Array<number>(len).fill(-1);
			open.push(i);
		} else {
			const start = open.pop();
			if (start !== undefined) pairs[start] = i;
		}
	}
	return pairs;
}

/** Whitespace in a link's parentheses; after a line ending, the `>` markers of a quote. */
export function skipLinkBlanks(text: string, from: number, end: number): number {
	let k = from;
	while (k < end) {
		const c = text.charCodeAt(k);
		if (c === 0x20 || c === 0x09) {
			k++;
		} else if (c === 0x0a || c === 0x0d) {
			k++;
			let m = k;
			while (m < end && (text.charCodeAt(m) === 0x20 || text.charCodeAt(m) === 0x09)) m++;
			while (m < end && text.charCodeAt(m) === 0x3e) {
				m++;
				if (m < end && text.charCodeAt(m) === 0x20) m++;
				k = m;
			}
		} else {
			break;
		}
	}
	return k;
}

export interface LinkDestination {
	range: Range;
	angle: boolean;
	next: number;
}

/**
 * The destination after `from` (a link's `(` and its leading blanks): its content, whether it's in `<...>`, and where
 * it ends. A destination holds no line ending and, outside `<...>`, no space; its parens balance.
 */
export function linkDestination(text: string, from: number, end: number): LinkDestination | null {
	const escapes = (k: number): boolean =>
		text.charCodeAt(k) === backslash && k + 1 < end && isAsciiPunctuationChar(text.charCodeAt(k + 1));
	const start = skipLinkBlanks(text, from, end);
	if (start >= end) return null;
	let k = start;
	if (text.charCodeAt(start) === 0x3c) {
		k++;
		while (k < end) {
			const c = text.charCodeAt(k);
			if (escapes(k)) {
				k += 2;
				continue;
			}
			if (c === 0x3e) return { range: range(start + 1, k - start - 1), angle: true, next: k + 1 };
			if (c === 0x3c || c === 0x0a || c === 0x0d) return null;
			k++;
		}
		return null;
	}
	let depth = 0;
	while (k < end) {
		const c = text.charCodeAt(k);
		if (escapes(k)) {
			k += 2;
			continue;
		}
		if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) break;
		if (c === 0x28) {
			depth++;
		} else if (c === 0x29) {
			if (depth === 0) break;
			depth--;
		}
		k++;
	}
	if (depth !== 0 || k <= start) return null;
	return { range: range(start, k - start), angle: false, next: k };
}

/**
 * The `)` closing a link's `(` at `open`: a destination, then blanks and an optional title (`"..."`, `'...'` or
 * `(...)`, after at least one blank), which may be on the next line.
 */
function linkTail(text: string, len: number, open: number): number | null {
	if (peek(text, open, len) !== lparen) return null;
	const destination = linkDestination(text, open + 1, len);
	if (!destination || destination.range.length <= 0) return null;
	let k = skipLinkBlanks(text, destination.next, len);
	if (k > destination.next && k < len && [0x22, 0x27, 0x28].includes(text.charCodeAt(k))) {
		const closer = text.charCodeAt(k) === 0x28 ? 0x29 : text.charCodeAt(k);
		k++;
		while (k < len && text.charCodeAt(k) !== closer) {
			if (text.charCodeAt(k) === backslash) k++;
			else if (closer === 0x29 && text.charCodeAt(k) === 0x28) return null;
			k++;
		}
		if (k >= len) return null;
		k = skipLinkBlanks(text, k + 1, len);
	}
	return peek(text, k, len) === rparen ? k : null;
}

// MARK: Inline math heuristic

function isInlineMathContent(content: string): boolean {
	const trimmed = trimWhitespace(content);
	if (trimmed === "") return false;
	if (isCurrencyLike(trimmed)) return false;
	const mathy = mathyCharCount(trimmed);
	if (mathy === 0) return [...trimmed].length <= 3 && isAllAsciiLetters(trimmed);
	let tokens = 0;
	for (const token of trimmed.split(/[\s\u0085]+/)) if (token !== "") tokens++;
	if (mathy >= 3) return tokens <= 120;
	if (mathy === 2) return tokens <= 40;
	return tokens <= 6;
}

/** A plain signed, thousands-grouped or decimal number (`50`, `1,000.50`, `-5`), so currency isn't math. */
function isCurrencyLike(s: string): boolean {
	const n = s.length;
	const digit = (x: number): boolean => x >= 0 && x < n && s.charCodeAt(x) >= 0x30 && s.charCodeAt(x) <= 0x39;
	let i = 0;
	if (i < n && (s.charCodeAt(i) === 0x2b || s.charCodeAt(i) === 0x2d)) i++;
	if (!digit(i)) return false;
	let sawDigit = false;
	while (i < n) {
		if (digit(i)) {
			sawDigit = true;
			i++;
		} else if (s.charCodeAt(i) === 0x2c && digit(i + 1) && digit(i + 2) && digit(i + 3) && !digit(i + 4)) {
			i += 4;
		} else {
			break;
		}
	}
	if (!sawDigit) return false;
	if (i < n && s.charCodeAt(i) === 0x2e) {
		i++;
		if (!digit(i)) return false;
		while (digit(i)) i++;
	}
	return i === n;
}

const mathy: ReadonlySet<number> = new Set([0x5c, 0x5e, 0x5f, 0x7b, 0x7d, 0x3d, 0x2b, 0x2d, 0x2a, 0x2f, 0x3c, 0x3e]);

function mathyCharCount(s: string): number {
	let count = 0;
	for (let i = 0; i < s.length; i++) if (mathy.has(s.charCodeAt(i))) count++;
	return count;
}

function isAllAsciiLetters(s: string): boolean {
	return /^[A-Za-z]+$/.test(s);
}

// MARK: 4. Emphasis

interface DelimRun {
	char: number;
	originalLength: number;
	leftEdge: number;
	rightEdge: number;
	canOpen: boolean;
	canClose: boolean;
	lineIdx: number;
}

const remaining = (run: DelimRun): number => run.rightEdge - run.leftEdge;

function resolveEmphasis(text: string, len: number, claimed: ClaimedIndex): Span[] {
	const runs = collectDelimiterRuns(text, len, claimed);
	if (runs.length === 0) return [];
	const stack: number[] = [];
	const spans: Span[] = [];
	runs.forEach((run, idx) => {
		if (run.canClose) closeAgainstStack(idx, runs, stack, spans);
		if (run.canOpen && remaining(run) > 0) stack.push(idx);
	});
	return spans;
}

function collectDelimiterRuns(text: string, len: number, claimed: ClaimedIndex): DelimRun[] {
	const runs: DelimRun[] = [];
	let lineIdx = 0;
	let i = 0;
	while (i < len) {
		const c = text.charCodeAt(i);
		if (c === newline) {
			lineIdx++;
			i++;
			continue;
		}
		if ((c !== asterisk && c !== underscore) || claimed.contains(i)) {
			i++;
			continue;
		}
		let j = i;
		while (j < len && text.charCodeAt(j) === c) j++;

		const before = i - 1;
		const after = j;
		const beforeWs = isWhitespaceOrBoundary(before, text, len);
		const beforePunct = isAsciiPunctuation(before, text, len);
		const afterWs = isWhitespaceOrBoundary(after, text, len);
		const afterPunct = isAsciiPunctuation(after, text, len);
		const leftFlanking = !afterWs && (!afterPunct || beforeWs || beforePunct);
		const rightFlanking = !beforeWs && (!beforePunct || afterWs || afterPunct);

		let canOpen: boolean;
		let canClose: boolean;
		if (c === underscore) {
			canOpen = leftFlanking && (!rightFlanking || beforePunct);
			canClose = rightFlanking && (!leftFlanking || afterPunct);
		} else {
			canOpen = leftFlanking;
			canClose = rightFlanking;
		}
		runs.push({ char: c, originalLength: j - i, leftEdge: i, rightEdge: j, canOpen, canClose, lineIdx });
		i = j;
	}
	return runs;
}

function closeAgainstStack(closerIdx: number, runs: DelimRun[], stack: number[], spans: Span[]): void {
	const closer = runs[closerIdx] as DelimRun;
	let sp = stack.length - 1;
	while (sp >= 0 && remaining(closer) > 0) {
		const openerIdx = stack[sp] as number;
		const opener = runs[openerIdx] as DelimRun;
		if (opener.char !== closer.char) {
			sp--;
			continue;
		}
		if (opener.lineIdx !== closer.lineIdx) {
			stack.splice(sp, 1);
			sp--;
			continue;
		}
		const avail = Math.min(remaining(opener), remaining(closer));
		if (avail === 0) {
			stack.splice(sp, 1);
			sp--;
			continue;
		}
		const openerBoth = opener.canOpen && opener.canClose;
		const closerBoth = closer.canOpen && closer.canClose;
		if (openerBoth || closerBoth) {
			const sum = opener.originalLength + closer.originalLength;
			const bothMod3 = opener.originalLength % 3 === 0 && closer.originalLength % 3 === 0;
			if (sum % 3 === 0 && !bothMod3) {
				sp--;
				continue;
			}
		}
		const matchLen = avail >= 3 ? 3 : avail >= 2 ? 2 : 1;
		const openerMarkerStart = opener.rightEdge - matchLen;
		const closerMarkerStart = closer.leftEdge;
		spans.push({
			type: "emphasis",
			range: range(openerMarkerStart, closerMarkerStart + matchLen - openerMarkerStart),
			open: range(openerMarkerStart, matchLen),
			close: range(closerMarkerStart, matchLen),
		});
		opener.rightEdge -= matchLen;
		closer.leftEdge += matchLen;
		if (remaining(opener) === 0) stack.splice(sp, 1);
		sp--;
	}
}

// MARK: 5. Containment tree

function buildTree(region: Range, spans: Span[], text: string): InlineNode[] {
	// Spans are non-overlapping or properly nested, so ordering by start ascending and length descending puts every
	// span immediately after the one that contains it.
	const ordered = spans
		.filter((span) => rangeContains(region, span.range))
		.sort((a, b) => (a.range.location === b.range.location ? b.range.length - a.range.length : a.range.location - b.range.location));
	const cursor = { value: 0 };
	return buildLevel(region, ordered, cursor, text);
}

function buildLevel(region: Range, ordered: Span[], cursor: { value: number }, text: string): InlineNode[] {
	const result: InlineNode[] = [];
	let textStart = region.location;

	while (cursor.value < ordered.length) {
		const span = ordered[cursor.value] as Span;
		const fr = span.range;
		if (!rangeContains(region, fr)) break;
		cursor.value++;

		if (fr.location > textStart) result.push({ type: "text", range: range(textStart, fr.location - textStart) });
		switch (span.type) {
			case "code":
				result.push({ type: "code", range: span.range, content: span.content });
				break;
			case "emphasis": {
				const content = range(maxRange(span.open), span.close.location - maxRange(span.open));
				result.push({
					type: "emphasis",
					range: span.range,
					markers: [span.open, span.close],
					children: buildLevel(content, ordered, cursor, text),
				});
				break;
			}
			case "link":
				result.push({
					type: "link",
					range: span.range,
					textRange: span.textRange,
					url: span.url,
					markers: span.markers,
					children: reparse(span.textRange, text, null),
				});
				break;
			case "autolink":
				result.push({
					type: "link",
					range: span.range,
					textRange: span.url,
					url: span.url,
					markers: span.markers,
					children: [{ type: "text", range: span.url }],
				});
				break;
			case "image":
				result.push({ type: "image", range: span.range, alt: span.alt, url: span.url, markers: span.markers });
				break;
			case "wikiLink":
				result.push({ type: "wikiLink", range: span.range, name: span.name, id: span.id, markers: span.markers });
				break;
			case "imageEmbed":
				result.push({ type: "imageEmbed", range: span.range, target: span.target, markers: span.markers });
				break;
			case "inlineLatex":
				result.push({ type: "inlineLatex", range: span.range, content: span.content, markers: span.markers });
				break;
			case "escape":
				result.push({ type: "escape", range: span.range, character: span.character, marker: span.marker });
				break;
			case "tag":
				result.push({ type: "tag", range: span.range, marker: span.marker });
				break;
			case "ext":
				result.push({
					type: "ext",
					range: span.range,
					contentRange: span.contentRange,
					markers: span.markers,
					children: reparse(span.contentRange, text, "notAtBoundary"),
				});
				break;
		}
		// Every span but emphasis is opaque, so nothing should remain inside one.
		while (cursor.value < ordered.length && rangeContains(fr, (ordered[cursor.value] as Span).range)) cursor.value++;
		textStart = maxRange(fr);
	}
	if (textStart < maxRange(region)) result.push({ type: "text", range: range(textStart, maxRange(region) - textStart) });
	return result;
}

/** Recursively parses a sub-range's content, offset back to absolute coordinates. */
function reparse(r: Range, text: string, tags: TagStart | null): InlineNode[] {
	return offsetNodes(parse(text.slice(r.location, maxRange(r)), tags), r.location);
}

// MARK: Helpers

function offsetNodes(nodes: InlineNode[], by: number): InlineNode[] {
	return nodes.map((node) => offsetNode(node, by));
}

function offsetNode(node: InlineNode, d: number): InlineNode {
	const s = (r: Range): Range => shift(r, d);
	switch (node.type) {
		case "text":
			return { type: "text", range: s(node.range) };
		case "code":
			return { type: "code", range: s(node.range), content: s(node.content) };
		case "emphasis":
			return { type: "emphasis", range: s(node.range), markers: node.markers.map(s), children: offsetNodes(node.children, d) };
		case "link":
			return {
				type: "link",
				range: s(node.range),
				textRange: s(node.textRange),
				url: s(node.url),
				markers: node.markers.map(s),
				children: offsetNodes(node.children, d),
			};
		case "image":
			return { type: "image", range: s(node.range), alt: s(node.alt), url: s(node.url), markers: node.markers.map(s) };
		case "wikiLink":
			return {
				type: "wikiLink",
				range: s(node.range),
				name: s(node.name),
				id: node.id ? s(node.id) : null,
				markers: node.markers.map(s),
			};
		case "imageEmbed":
			return { type: "imageEmbed", range: s(node.range), target: s(node.target), markers: node.markers.map(s) };
		case "inlineLatex":
			return { type: "inlineLatex", range: s(node.range), content: s(node.content), markers: node.markers.map(s) };
		case "escape":
			return { type: "escape", range: s(node.range), character: s(node.character), marker: s(node.marker) };
		case "tag":
			return { type: "tag", range: s(node.range), marker: s(node.marker) };
		case "ext":
			return {
				type: "ext",
				range: s(node.range),
				contentRange: s(node.contentRange),
				markers: node.markers.map(s),
				children: offsetNodes(node.children, d),
			};
	}
}

function isWhitespaceOrBoundary(idx: number, text: string, len: number): boolean {
	if (idx < 0 || idx >= len) return true;
	const c = text.charCodeAt(idx);
	return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
}

function isAsciiPunctuation(idx: number, text: string, len: number): boolean {
	return idx >= 0 && idx < len && isAsciiPunctuationChar(text.charCodeAt(idx));
}

export function isAsciiPunctuationChar(c: number): boolean {
	return (c >= 0x21 && c <= 0x2f) || (c >= 0x3a && c <= 0x40) || (c >= 0x5b && c <= 0x60) || (c >= 0x7b && c <= 0x7e);
}

/** A character is backslash-escaped when preceded by an odd run of `\`. */
function isEscaped(idx: number, text: string): boolean {
	let count = 0;
	for (let k = idx - 1; k >= 0 && text.charCodeAt(k) === backslash; k--) count++;
	return count % 2 === 1;
}

// MARK: Tags

/** The grapheme-like sequences of `text`: a code point with the combining marks and joiners after it. */
export function composedCharacters(text: string): string[] {
	const out: string[] = [];
	let i = 0;
	while (i < text.length) {
		const end = composedEnd(text, i);
		out.push(text.slice(i, end));
		i = end;
	}
	return out;
}

/** Where the composed character sequence starting at `index` ends. */
function composedEnd(text: string, index: number): number {
	let end = index + ((text.codePointAt(index) ?? 0) > 0xffff ? 2 : 1);
	while (end < text.length) {
		const next = text.codePointAt(end) as number;
		const width = next > 0xffff ? 2 : 1;
		if (next === 0x200d && end + width < text.length) {
			const joined = text.codePointAt(end + width) as number;
			end += width + (joined > 0xffff ? 2 : 1);
		} else if (/^\p{M}$/u.test(String.fromCodePoint(next)) || (next >= 0x1f3fb && next <= 0x1f3ff)) {
			end += width;
		} else {
			break;
		}
	}
	return end;
}

/** A character a tag's name may hold: a letter, a digit, `_`, `-` or `/`. */
export function isTagCharacter(c: string): boolean {
	return isLetterChar(c) || isNumberChar(c) || c === "_" || c === "-" || c === "/";
}

/** A tag's name (after `#`): tag characters, at least one of them neither a digit nor `/`. */
export function isTagName(name: string): boolean {
	const characters = composedCharacters(name);
	return characters.every(isTagCharacter) && characters.some((c) => !isNumberChar(c) && c !== "/");
}

/**
 * `#` at the text's start (when `startsAtBoundary`) or after whitespace, then letters, digits, `_`, `-` and `/`, with
 * at least one character that isn't a digit or `/`. Trailing `/`s stay out of the span. Escaped and claimed `#`s are
 * skipped. A `#` after a run of `*` or `_` takes the boundary of the run's start; such tags are also returned by
 * start, to keep only where the run opens emphasis, and leave as many trailing `_`s as the run had for its closer.
 */
function scanTags(
	text: string,
	len: number,
	claimed: ClaimedIndex,
	startsAtBoundary: boolean,
): { spans: Span[]; afterDelimiters: Set<number> } {
	const spans: Span[] = [];
	const afterDelimiters = new Set<number>();
	let i = 0;
	while (i < len) {
		if (text.charCodeAt(i) !== hash || claimed.contains(i)) {
			i++;
			continue;
		}
		const delimiters = tagBoundary(i, text, startsAtBoundary);
		if (!delimiters) {
			i++;
			continue;
		}
		let end = i + 1;
		let hasWord = false;
		while (end < len) {
			const composedStop = composedEnd(text, end);
			const c = text.slice(end, composedStop);
			if (!isTagCharacter(c)) break;
			if (!isNumberChar(c) && c !== "/") hasWord = true;
			end = composedStop;
		}
		const scanned = end;
		let underscores = delimiters.underscores;
		while (underscores > 0 && end > i + 1 && text.charCodeAt(end - 1) === underscore) {
			end--;
			underscores--;
		}
		while (end > i + 1 && text.charCodeAt(end - 1) === 0x2f) end--;
		const r = range(i, end - i);
		const name = text.slice(i + 1, end);
		if (hasWord && isTagName(name) && !claimed.overlaps(r)) {
			spans.push({ type: "tag", range: r, marker: range(i, 1) });
			if (delimiters.count > 0) afterDelimiters.add(i);
		}
		i = scanned;
	}
	return { spans, afterDelimiters };
}

/**
 * The run of `*` and `_` before `i` when whitespace or the text's start (when `startsAtBoundary`) comes before the
 * run; null when the `#` isn't at a boundary.
 */
function tagBoundary(i: number, text: string, startsAtBoundary: boolean): { count: number; underscores: number } | null {
	let k = i - 1;
	let underscores = 0;
	while (k >= 0 && (text.charCodeAt(k) === asterisk || text.charCodeAt(k) === underscore)) {
		if (text.charCodeAt(k) === underscore) underscores++;
		k--;
	}
	const atBoundary = k < 0 ? startsAtBoundary : isWhitespaceUnit(text.charCodeAt(k));
	return atBoundary ? { count: i - 1 - k, underscores } : null;
}
