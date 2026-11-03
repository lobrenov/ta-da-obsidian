import { isWhitespaceUnit, lowercased } from "../text";

export { lowercased };

/*
 * Swift's `Character` is an extended grapheme cluster, and its `isWhitespace`, `isNewline` and `isLetter` read the
 * cluster's first scalar. The writers compare and drop whole clusters, so they work on arrays of them. `"\r\n"` is
 * one cluster.
 */

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** The text's characters, as Swift's `String` iterates them. */
export function characters(text: string): string[] {
	// ASCII has no multi-unit clusters but CR LF.
	if (!/[^\p{ASCII}]/u.test(text) && !text.includes("\r\n")) return Array.from(text);
	return Array.from(segmenter.segment(text), (part) => part.segment);
}

/** Whether a character boundary falls at the UTF-16 offset. */
function isBoundary(text: string, index: number): boolean {
	if (index <= 0 || index >= text.length) return true;
	const before = text.charCodeAt(index - 1);
	const after = text.charCodeAt(index);
	if (before < 0x300 && after < 0x300) return !(before === 0x0d && after === 0x0a);
	return segmenter.segment(text).containing(index)?.index === index;
}

/** Swift's `hasPrefix`: the prefix must end on a character boundary. */
export function hasPrefixCharacters(text: string, prefix: string): boolean {
	return text.startsWith(prefix) && isBoundary(text, prefix.length);
}

/** Swift's `contains` for a string: the match must start and end on character boundaries. */
export function includesCharacters(text: string, needle: string): boolean {
	let from = 0;
	for (;;) {
		const at = text.indexOf(needle, from);
		if (at < 0) return false;
		if (isBoundary(text, at) && isBoundary(text, at + needle.length)) return true;
		from = at + 1;
	}
}

/** `Character.isWhitespace`: the first scalar has the White_Space property. */
export function isWhitespaceCharacter(character: string): boolean {
	return isWhitespaceUnit(character.charCodeAt(0));
}

/** `Character.isNewline`: the first scalar is a line break (LF, VT, FF, CR, NEL, LS or PS). */
export function isNewlineCharacter(character: string): boolean {
	const code = character.codePointAt(0) ?? -1;
	return (code >= 0x0a && code <= 0x0d) || code === 0x85 || code === 0x2028 || code === 0x2029;
}

/** `Character.isLetter`: the first scalar is alphabetic. */
export function isLetterCharacter(character: string): boolean {
	return /^\p{Alphabetic}/u.test(character);
}

/** Whether every character is whitespace; true for no characters. */
export function isBlank(text: string): boolean {
	return characters(text).every(isWhitespaceCharacter);
}

/** Drops whitespace characters, line breaks included, from both ends: `drop(while: \.isWhitespace)` from each side. */
export function trimWhitespaceCharacters(text: string): string {
	const parts = characters(text);
	let start = 0;
	let end = parts.length;
	while (start < end && isWhitespaceCharacter(parts[start] as string)) start++;
	while (end > start && isWhitespaceCharacter(parts[end - 1] as string)) end--;
	return parts.slice(start, end).join("");
}

/** `split(separator:)` on one character, dropping empty pieces. */
export function splitOnCharacter(text: string, separator: string): string[] {
	const pieces: string[] = [];
	let current = "";
	for (const character of characters(text)) {
		if (character === separator) {
			if (current !== "") pieces.push(current);
			current = "";
		} else {
			current += character;
		}
	}
	if (current !== "") pieces.push(current);
	return pieces;
}
