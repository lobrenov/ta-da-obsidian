import { type Checkbox, checkboxState } from "../model/checkbox";
import { readTag, type Tag, uniqueTags } from "../model/tag";
import { makeWikiLink, type WikiLink } from "../model/wikiLink";
import { scanFacts } from "../syntax/facts";
import { parseInlineAttributes, strippedOf } from "./inlineAttributes";

/** What a file's body contributes to its item. */
export interface BodyScan {
	/** The first top-level paragraph as plain text. */
	summary: string | null;
	/** Every checkbox at any depth, in document order. Items in code blocks aren't list items, so they're skipped. */
	checkboxes: Checkbox[];
	/** Every `[[...]]` in the body's text, skipping code and HTML. */
	links: WikiLink[];
	/** Every `![[...]]`, as `links` finds them. */
	embeds: WikiLink[];
	/** Every inline `#tag`, first spelling kept, in order. Code, HTML, links' text and `[[...]]` hold none. */
	tags: Tag[];
}

const encoder = new TextEncoder();

/**
 * Reads a body with the grammar the spec states.
 * @param firstLineIndex the file line the body starts on, so checkbox lines are file lines.
 */
export function scanBody(body: string, firstLineIndex = 0): BodyScan {
	const facts = scanFacts(body, firstLineIndex);
	// Lines as the writers split them: on `\n` only.
	const newlines: number[] = [];
	if (facts.tasks.length > 0) {
		for (let i = 0; i < body.length; i++) if (body.charCodeAt(i) === 0x0a) newlines.push(i);
	}
	const lineStart = (line: number): number => (line === 0 ? 0 : (newlines[line - 1] as number) + 1);
	const lines = facts.tasks.map((task) => {
		const marker = task.box.location + 1;
		let low = 0;
		let high = newlines.length;
		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			if ((newlines[mid] as number) < marker) low = mid + 1;
			else high = mid;
		}
		return { index: low, marker };
	});
	const boxLines = new Set(lines.map((line) => line.index));
	/** A line's indent in columns (a tab moving to the next multiple of 4) and its first other character; null when blank. */
	const indent = (line: number): { columns: number; first: number } | null => {
		let columns = 0;
		for (let i = lineStart(line); i < body.length; i++) {
			const c = body.charCodeAt(i);
			if (c === 0x20) columns += 1;
			else if (c === 0x09) columns = Math.floor(columns / 4) * 4 + 4;
			else return c === 0x0a || c === 0x0d ? null : { columns, first: c };
		}
		return null;
	};
	const isNested = (line: number, columns: number): boolean => {
		if (columns === 0) return false;
		for (let earlier = line - 1; earlier >= 0; earlier--) {
			const above = indent(earlier);
			if (above === null || above.columns >= columns) continue;
			return boxLines.has(earlier);
		}
		return false;
	};
	const checkboxes: Checkbox[] = facts.tasks.map((task, i) => {
		const line = lines[i] as { index: number; marker: number };
		const column = encoder.encode(body.slice(lineStart(line.index), line.marker)).length;
		const state = checkboxState(task.marker);
		if (state === null) throw new Error(`Not a task marker: ${task.marker}`);
		const attributes = parseInlineAttributes(task.text);
		const indented = indent(line.index);
		return {
			marker: task.marker,
			lineIndex: firstLineIndex + line.index,
			column,
			state,
			text: task.text,
			title: strippedOf(attributes, task.text),
			due: attributes.due?.date ?? null,
			parent: attributes.parent?.title ?? null,
			isNested: isNested(line.index, indented?.columns ?? 0),
			isQuoted: indented?.first === 0x3e,
		};
	});
	const links = facts.links.flatMap((fact) => makeWikiLink(fact.parts.target, fact.parts.heading, fact.parts.block, fact.parts.alias) ?? []);
	const embeds = facts.embeds.flatMap((fact) => {
		const alias = fact.segments.join("|");
		return makeWikiLink(fact.target, fact.heading, fact.block, alias === "" ? null : alias) ?? [];
	});
	return {
		summary: facts.summary,
		checkboxes,
		links,
		embeds,
		tags: uniqueTags(facts.tags.flatMap((tag) => readTag(tag.name) ?? [])),
	};
}
