import { type Checkbox, checkboxState } from "../model/checkbox";
import { readTag, type Tag, uniqueTags } from "../model/tag";
import { makeWikiLink, type WikiLink } from "../model/wikiLink";
import { scanFacts } from "../syntax/facts";

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
	const checkboxes: Checkbox[] = facts.tasks.map((task) => {
		const marker = task.box.location + 1;
		let low = 0;
		let high = newlines.length;
		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			if ((newlines[mid] as number) < marker) low = mid + 1;
			else high = mid;
		}
		const lineStart = low === 0 ? 0 : (newlines[low - 1] as number) + 1;
		const column = encoder.encode(body.slice(lineStart, marker)).length;
		const state = checkboxState(task.marker);
		if (state === null) throw new Error(`Not a task marker: ${task.marker}`);
		return { marker: task.marker, lineIndex: firstLineIndex + low, column, state };
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
