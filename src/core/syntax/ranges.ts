/** A span of UTF-16 code units: Foundation's `NSRange`. JavaScript strings index the same units. */
export interface Range {
	location: number;
	length: number;
}

export function range(location: number, length: number): Range {
	return { location, length };
}

export function maxRange(r: Range): number {
	return r.location + r.length;
}

export function locationInRange(location: number, r: Range): boolean {
	return location >= r.location && location < maxRange(r);
}

export function intersectionLength(a: Range, b: Range): number {
	return Math.max(0, Math.min(maxRange(a), maxRange(b)) - Math.max(a.location, b.location));
}

export function unionRange(a: Range, b: Range): Range {
	const start = Math.min(a.location, b.location);
	return { location: start, length: Math.max(maxRange(a), maxRange(b)) - start };
}

export function rangeContains(outer: Range, inner: Range): boolean {
	return inner.location >= outer.location && maxRange(inner) <= maxRange(outer);
}

export function shift(r: Range, by: number): Range {
	return { location: r.location + by, length: r.length };
}

export function sameRange(a: Range, b: Range): boolean {
	return a.location === b.location && a.length === b.length;
}

/** `\n`, `\r`, U+2028, U+2029 and U+0085: the line terminators of `NSString.lineRange`, with `\r\n` as one. */
export function isLineTerminator(code: number): boolean {
	return code === 0x0a || code === 0x0d || code === 0x2028 || code === 0x2029 || code === 0x85;
}

/** The line containing `location`, its terminator included: `NSString.lineRange(for: NSRange(location:, length: 0))`. */
export function lineRange(text: string, location: number): Range {
	let start = Math.min(location, text.length);
	if (start < text.length && text.charCodeAt(start) === 0x0a && start > 0 && text.charCodeAt(start - 1) === 0x0d) {
		start--;
	}
	while (start > 0 && !isLineTerminator(text.charCodeAt(start - 1))) start--;
	let end = Math.min(location, text.length);
	while (end < text.length && !isLineTerminator(text.charCodeAt(end))) end++;
	if (end < text.length) {
		end += text.charCodeAt(end) === 0x0d && text.charCodeAt(end + 1) === 0x0a ? 2 : 1;
	}
	return { location: start, length: end - start };
}

/** The ranges of every line of `text`, terminators included. */
export function lineRanges(text: string): Range[] {
	const lines: Range[] = [];
	let cursor = 0;
	while (cursor < text.length) {
		const line = lineRange(text, cursor);
		lines.push(line);
		cursor = maxRange(line);
	}
	return lines;
}

export function substring(text: string, r: Range): string {
	return text.slice(r.location, maxRange(r));
}

/** Unicode `Character.isNumber` for the first scalar: numeric type decimal, digit or numeric. */
const cjkNumerals = "〇一二三四五六七八九十百千万亿兆零";
export function isNumberChar(char: string): boolean {
	return /^\p{N}/u.test(char) || cjkNumerals.includes(char.slice(0, 1));
}

/** Unicode `Character.isLetter` for the first scalar: the Alphabetic property. */
export function isLetterChar(char: string): boolean {
	return /^\p{Alphabetic}/u.test(char);
}
