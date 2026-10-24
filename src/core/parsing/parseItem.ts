import type { Item, Warning } from "../model/item";
import { isNotePath, titleOfPath } from "../model/item";
import type { Properties } from "../model/item";
import { trimWhitespace } from "../text";
import { scanBody } from "./bodyScanner";
import { splitFrontmatter } from "./frontmatterSplitter";
import { readNoteProperties, readProperties } from "./propertyReader";

/**
 * Parses a file's text. A note when the text has no `type: task`, `type: project` or `type: area` and the path is a
 * note path; null when it's neither.
 */
export function parseItem(text: string, path: string): Item | null {
	const split = splitFrontmatter(text);
	let read: { properties: Properties; warnings: Warning[] } | null = null;
	if (split.yaml !== null) read = readProperties(split.yaml);
	if (read === null) {
		if (!isNotePath(path)) return null;
		read = readNoteProperties(split.yaml);
	}
	const body = scanBody(split.body, split.bodyFirstLineIndex);
	const boxLines = new Set(body.checkboxes.map((box) => box.lineIndex));
	const hasNote = splitOnLoneNewline(split.body).some((line, offset) => !boxLines.has(split.bodyFirstLineIndex + offset) && !isAllWhitespace(line));
	const bodyPaths = new Set(body.tags.map((tag) => tag.path));
	const frontmatterPaths = new Set(read.properties.tags.map((tag) => tag.path));
	return {
		path,
		title: titleOfPath(path),
		properties: read.properties,
		summary: body.summary,
		hasNote,
		checkboxes: body.checkboxes,
		links: body.links,
		embeds: body.embeds,
		tags: [
			...read.properties.tags.map((tag) => ({ tag, inFrontmatter: true, inBody: bodyPaths.has(tag.path) })),
			...body.tags.filter((tag) => !frontmatterPaths.has(tag.path)).map((tag) => ({ tag, inFrontmatter: false, inBody: true })),
		],
		warnings: read.warnings,
	};
}

function isAllWhitespace(line: string): boolean {
	return trimWhitespace(line) === "";
}

/** Splits on `\n` that isn't half of `\r\n`, as Swift's `split(separator: "\n")` leaves a `\r\n` character whole. */
function splitOnLoneNewline(text: string): string[] {
	const lines: string[] = [];
	let start = 0;
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) === 0x0a && !(i > 0 && text.charCodeAt(i - 1) === 0x0d)) {
			lines.push(text.slice(start, i));
			start = i + 1;
		}
	}
	lines.push(text.slice(start));
	return lines;
}
