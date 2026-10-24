/** Unicode space separators and tab: Foundation's `CharacterSet.whitespaces`. */
const blank = "[ \\t\\u00a0\\u1680\\u2000-\\u200a\\u202f\\u205f\\u3000]";
const edges = new RegExp(`^${blank}+|${blank}+$`, "g");

/** Trims spaces, tabs and other Unicode space separators, not line breaks. */
export function trimBlanks(text: string): string {
	return text.replace(edges, "");
}

/** `Character.isWhitespace` for one UTF-16 unit: whitespace and line breaks. */
export function isWhitespaceUnit(code: number): boolean {
	return (
		(code >= 0x09 && code <= 0x0d) ||
		code === 0x20 ||
		code === 0x85 ||
		code === 0xa0 ||
		code === 0x1680 ||
		(code >= 0x2000 && code <= 0x200a) ||
		code === 0x2028 ||
		code === 0x2029 ||
		code === 0x202f ||
		code === 0x205f ||
		code === 0x3000
	);
}

/** Foundation's `trimmingCharacters(in: .whitespacesAndNewlines)`. */
export function trimWhitespace(text: string): string {
	let start = 0;
	let end = text.length;
	while (start < end && isWhitespaceUnit(text.charCodeAt(start))) start++;
	while (end > start && isWhitespaceUnit(text.charCodeAt(end - 1))) end--;
	return text.slice(start, end);
}

/** Code-unit order, as Swift's `String <` for the paths used here. */
export function compareCodeUnits(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** A name's identity: canonically equivalent spellings match, as Swift's `String` equality does, ignoring case. */
export function identityKey(text: string): string {
	return lowercased(text.normalize("NFC"));
}

/** Swift's `lowercased()`: each scalar on its own, with no context rules such as final sigma. */
export function lowercased(text: string): string {
	return Array.from(text, (scalar) => scalar.toLowerCase()).join("");
}
