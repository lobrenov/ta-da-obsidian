import { splitFrontmatter } from "../../core/parsing/frontmatterSplitter";
import type { Kind } from "../../core/model/item";

/**
 * Whether the Reading view section starting at `lineStart` carries the header: the first section after the
 * frontmatter, or the frontmatter's own section when the file has no body.
 */
export function ownsHeader(text: string, lineStart: number): boolean {
	const { bodyFirstLineIndex } = splitFrontmatter(text);
	const lines = text.split("\n");
	const blank = (line: string): boolean => line.trim() === "";
	if (lineStart < bodyFirstLineIndex) return lines.slice(bodyFirstLineIndex).every(blank);
	return lines.slice(bodyFirstLineIndex, lineStart).every(blank);
}

/** The kind a post-processor's `ctx.frontmatter` declares, for a file the index hasn't read yet. */
export function kindOfFrontmatter(frontmatter: unknown): Kind | undefined {
	const type = typeof frontmatter === "object" && frontmatter !== null ? (frontmatter as { type?: unknown }).type : undefined;
	const name = typeof type === "string" ? type.trim().toLowerCase() : "";
	return name === "task" || name === "project" || name === "area" ? name : undefined;
}
