import type { LocalDate } from "../model/localDate";
import { isFenceLine } from "../parsing/frontmatterSplitter";
import {
	characters,
	hasPrefixCharacters,
	includesCharacters,
	isBlank,
	isLetterCharacter,
	isNewlineCharacter,
	isWhitespaceCharacter,
	lowercased,
} from "./characters";
import { Lines } from "./lines";

/** A value Ta Da writes into frontmatter, formatted per the writing rules in `docs/file-format.md`. */
export type PropertyValue =
	/** Written plain when YAML would read it back unchanged, otherwise double-quoted. */
	| { kind: "text"; value: string }
	/** Unquoted `YYYY-MM-DD`. */
	| { kind: "date"; value: LocalDate }
	/** `"[[Title]]"`. */
	| { kind: "link"; title: string }
	/** Block style with quoted items; `[]` when empty. */
	| { kind: "list"; items: string[] };

/** A half-open range of file lines. */
export interface LineRange {
	start: number;
	end: number;
}

/*
 * Edits one frontmatter key by splicing only its line(s). Everything else stays byte for byte.
 */

/**
 * Replaces the key's line(s), appends the key before the closing `---` if it's missing, or creates the frontmatter
 * block if there is none.
 */
export function setProperty(key: string, value: PropertyValue, text: string): string {
	const file = new Lines(text);
	const closing = closingFence(file);
	if (closing === null) {
		const ending = file.ending;
		return ["---", ...rendered(key, value), "---"].map((line) => line + ending).join("") + text;
	}
	const range = keyRange(key, file, closing);
	if (range) {
		const ending = endingOf(file.lines[range.start] as string);
		file.lines.splice(range.start, range.end - range.start, ...rendered(key, value).map((line) => line + ending));
	} else {
		const ending = endingOf(file.lines[closing - 1] as string);
		file.lines.splice(closing, 0, ...rendered(key, value).map((line) => line + ending));
	}
	return file.text;
}

/**
 * Inserts keys straight after the opening `---`, ahead of the others, or creates the frontmatter block if there is
 * none. Keys already in the block aren't checked.
 */
export function insertAtTop(keys: { key: string; value: PropertyValue }[], text: string): string {
	const file = new Lines(text);
	const lines = keys.flatMap(({ key, value }) => rendered(key, value));
	if (closingFence(file) === null) {
		const ending = file.ending;
		return ["---", ...lines, "---"].map((line) => line + ending).join("") + text;
	}
	const ending = endingOf(file.lines[0] as string);
	file.lines.splice(1, 0, ...lines.map((line) => line + ending));
	return file.text;
}

/** Whether the frontmatter has the key, with or without a value. */
export function hasProperty(key: string, text: string): boolean {
	const file = new Lines(text);
	const closing = closingFence(file);
	return closing !== null && keyRange(key, file, closing) !== null;
}

/** Whether the frontmatter has the key with something written after it, on its line or the lines below. */
export function hasValue(key: string, text: string): boolean {
	const file = new Lines(text);
	const closing = closingFence(file);
	const range = closing === null ? null : keyRange(key, file, closing);
	if (!range) return false;
	const value = Lines.content(file.lines[range.start] as string).slice(key.length + 1);
	return range.end - range.start > 1 || !isBlank(value);
}

/** Empties an existing key, leaving `key:`. A missing key stays missing. */
export function clearProperty(key: string, text: string): string {
	const file = new Lines(text);
	const closing = closingFence(file);
	const range = closing === null ? null : keyRange(key, file, closing);
	if (!range) return text;
	const ending = endingOf(file.lines[range.start] as string);
	file.lines.splice(range.start, range.end - range.start, `${key}:${ending}`);
	return file.text;
}

// Locating

/** The closing `---` line, when line 0 opens frontmatter. */
export function closingFence(file: Lines): number | null {
	const first = file.lines[0];
	if (first === undefined || !isFenceLine(Lines.content(first))) return null;
	for (let index = 1; index < file.lines.length; index++) {
		if (isFenceLine(Lines.content(file.lines[index] as string))) return index;
	}
	return null;
}

/** The unindented `key:` line plus its continuation lines (indented lines and `- ` items). */
export function keyRange(key: string, file: Lines, closing: number): LineRange | null {
	let start = 1;
	while (start < closing && !isKeyLine(Lines.content(file.lines[start] as string), key)) start++;
	if (start >= closing) return null;
	let end = start + 1;
	while (end < closing && isContinuation(Lines.content(file.lines[end] as string))) end++;
	return { start, end };
}

function isKeyLine(line: string, key: string): boolean {
	if (!hasPrefixCharacters(line, `${key}:`)) return false;
	const after = characters(line.slice(key.length + 1))[0];
	return after === undefined || after === " " || after === "\t";
}

export function isContinuation(line: string): boolean {
	const first = characters(line)[0];
	return first === " " || first === "\t" || line === "-" || hasPrefixCharacters(line, "- ");
}

/** A line's own ending: `\r\n`, `\n`, or none on a last line without one. */
export function endingOf(line: string): string {
	return !line.endsWith("\n") ? "" : line.endsWith("\r\n") ? "\r\n" : "\n";
}

// Formatting

function rendered(key: string, value: PropertyValue): string[] {
	switch (value.kind) {
		case "text":
			return [`${key}: ${scalar(value.value)}`];
		case "date":
			return [`${key}: ${value.value.toString()}`];
		case "link":
			return [`${key}: ${quoted(`[[${value.title}]]`)}`];
		case "list":
			return value.items.length === 0 ? [`${key}: []`] : [`${key}:`, ...value.items.map((item) => `  - ${quoted(item)}`)];
	}
}

const reserved: ReadonlySet<string> = new Set(["y", "n", "yes", "no", "on", "off", "true", "false", "null"]);

/** Plain when the text starts with a letter and YAML can't read it as anything but that string. */
export function scalar(text: string): string {
	const parts = characters(text);
	const first = parts[0];
	const last = parts[parts.length - 1];
	const plain =
		first !== undefined &&
		isLetterCharacter(first) &&
		last !== undefined &&
		!isWhitespaceCharacter(last) &&
		last !== ":" &&
		!includesCharacters(text, ": ") &&
		!includesCharacters(text, " #") &&
		!parts.some((part) => isNewlineCharacter(part) || part === "\t" || part === '"' || part === "'" || part === "\\") &&
		!reserved.has(lowercased(text));
	return plain ? text : quoted(text);
}

export function quoted(text: string): string {
	let escaped = "";
	for (const character of text) {
		switch (character) {
			case "\\":
				escaped += "\\\\";
				break;
			case '"':
				escaped += '\\"';
				break;
			case "\n":
				escaped += "\\n";
				break;
			case "\r":
				escaped += "\\r";
				break;
			case "\t":
				escaped += "\\t";
				break;
			default:
				escaped += character;
		}
	}
	return `"${escaped}"`;
}

const flowEnders: ReadonlySet<string> = new Set([",", "[", "]", "{", "}"]);

/** As `scalar`, also quoting the characters that end an item in a flow list. */
export function flowItem(text: string): string {
	return characters(text).some((part) => flowEnders.has(part)) ? quoted(text) : scalar(text);
}
