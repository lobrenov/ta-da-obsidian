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
 * Frontmatter is a `---` first line up to the next `---` line (trailing spaces allowed, LF or CRLF).
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

function isFenceLine(line: string): boolean {
	let end = line.length;
	while (end > 0 && (line[end - 1] === " " || line[end - 1] === "\t" || line[end - 1] === "\r")) end--;
	return line.slice(0, end) === "---";
}
