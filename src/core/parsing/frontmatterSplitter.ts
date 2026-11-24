/** A file split at its frontmatter. `block + body` is always the original text. */
export interface FrontmatterSplit {
	/** The text between the fences, or null when the file has no frontmatter. */
	yaml: string | null;
	/** From the opening `---` through the closing `---` line's line ending. Empty without frontmatter. */
	block: string;
	body: string;
	/** The 0-based file line the body starts on. */
	bodyFirstLineIndex: number;
}

/**
 * Frontmatter is a `---` first line (after an optional byte-order mark, which stays in the block) up to the next `---` line (trailing spaces allowed, LF or CRLF).
 * Without a closing fence the whole file is body.
 */
export function splitFrontmatter(text: string): FrontmatterSplit {
	const none: FrontmatterSplit = { yaml: null, block: "", body: text, bodyFirstLineIndex: 0 };
	let lineStart = 0;
	let lineIndex = 0;
	let yamlStart = -1;

	while (lineStart < text.length) {
		const newline = text.indexOf("\n", lineStart);
		const lineEnd = newline < 0 ? text.length : newline;
		const next = newline < 0 ? text.length : newline + 1;
		const fence = isFenceLine(text.slice(lineStart, lineEnd));

		if (lineIndex === 0) {
			if (!fence) return none;
			yamlStart = next;
		} else if (fence && yamlStart >= 0) {
			return {
				yaml: text.slice(yamlStart, lineStart),
				block: text.slice(0, next),
				body: text.slice(next),
				bodyFirstLineIndex: lineIndex + 1,
			};
		}
		lineStart = next;
		lineIndex++;
	}
	return none;
}

/** A `---` line, a leading byte-order mark dropped, trailing spaces, tabs and a CR allowed. */
export function isFenceLine(line: string): boolean {
	const start = line.startsWith("\uFEFF") ? 1 : 0;
	let end = line.length;
	while (end > start && (line[end - 1] === " " || line[end - 1] === "\t" || line[end - 1] === "\r")) end--;
	return line.slice(start, end) === "---";
}
