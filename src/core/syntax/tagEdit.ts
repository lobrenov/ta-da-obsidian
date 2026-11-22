import { identityKey } from "../text";
import { isNewlineCharacter, isWhitespaceCharacter } from "../writing/characters";
import { scanFacts, type TagWrapper } from "./facts";
import { lineRange, locationInRange, maxRange, type Range, range } from "./ranges";

/*
 * Whole-text edits of the inline `#tags` the parser reads, changing only the tags' own bytes (the editor fork's
 * `TagEdit`).
 */

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * `text` with every inline tag whose path is `from` or under it (ignoring case) renamed: that prefix of the path
 * becomes `to`, the rest keeps its spelling. Paths compare by their non-empty segments (`a//b` is `a/b`), and a
 * renamed tag is written with its empty segments dropped. `from` and `to` are paths without `#`. Text the parser
 * reads no tag in is untouched, and `text` is returned as it was when nothing matches.
 */
export function renameInlineTags(from: string, to: string, text: string): string {
	const edits: { range: Range; replacement: string }[] = [];
	for (const tag of matches(from, text)) {
		const name = range(tag.range.location + 1, tag.range.length - 1);
		const replacement = [to, ...tag.rest].join("/");
		if (text.slice(name.location, maxRange(name)) !== replacement) edits.push({ range: name, replacement });
	}
	return apply(edits, text);
}

/**
 * `text` with every inline tag whose path is `from` or under it (ignoring case) removed with its `#`, its trailing
 * `/`s and one adjacent whitespace character: the one before the tag, else the one after it. A line break is never
 * removed, so a line left empty stays as a line. A `*` or `_` emphasis span left holding only whitespace is removed
 * with its markers, and the whitespace rule applies to the span.
 */
export function deleteInlineTags(from: string, text: string): string {
	const isBlank = (unit: number): boolean => {
		const character = segmenter.segment(text).containing(unit)?.segment ?? "";
		return isWhitespaceCharacter(character) && !isNewlineCharacter(character);
	};
	const found = matches(from, text);
	const removed = found.map((tag) => {
		let end = maxRange(tag.range);
		while (end < text.length && text.charCodeAt(end) === 0x2f) end++;
		return range(tag.range.location, end - tag.range.location);
	});
	/** Whether `r` holds only whitespace once the tags being removed are set aside. */
	const isEmpty = (r: Range): boolean => {
		for (let unit = r.location; unit < maxRange(r); unit++) {
			if (!removed.some((gone) => locationInRange(unit, gone)) && !isWhitespaceCharacter(text.charAt(unit))) return false;
		}
		return true;
	};
	const ranges: Range[] = [];
	found.forEach((tag, at) => {
		let r = removed[at] as Range;
		for (const wrapper of tag.wrappers) {
			const start = tag.range.location - wrapper.before;
			const end = maxRange(tag.range) + wrapper.after;
			const contentStart = start + wrapper.open;
			const contentEnd = end - wrapper.close;
			if (contentStart > contentEnd || contentEnd > text.length || !isEmpty(range(contentStart, contentEnd - contentStart))) break;
			r = range(start, end - start);
		}
		const end = maxRange(r);
		if (r.location > 0 && isBlank(r.location - 1)) {
			const before = segmenter.segment(text).containing(r.location - 1)?.index ?? r.location - 1;
			r = range(before, end - before);
		} else if (end < text.length && isBlank(end)) {
			const unit = segmenter.segment(text).containing(end);
			r = range(r.location, (unit ? unit.index + unit.segment.length : end + 1) - r.location);
		}
		ranges.push(r);
	});
	ranges.sort((a, b) => a.location - b.location);
	const merged: Range[] = [];
	for (const r of ranges) {
		const last = merged[merged.length - 1];
		if (last && r.location <= maxRange(last)) last.length = Math.max(maxRange(last), maxRange(r)) - last.location;
		else merged.push({ ...r });
	}
	return apply(merged.map((r) => ({ range: r, replacement: "" })), text);
}

/**
 * The tags at `from` or under it: where each is in `text` (`#` through its last character), the path segments after
 * the ones `from` names (as written), and the emphasis spans around it.
 */
function matches(from: string, text: string): { range: Range; rest: string[]; wrappers: TagWrapper[] }[] {
	const wanted = from.split("/").filter((segment) => segment !== "").map(identityKey);
	if (wanted.length === 0) return [];
	const lineStarts = [0];
	for (let cursor = 0; cursor < text.length; ) {
		cursor = maxRange(lineRange(text, cursor));
		if (cursor < text.length) lineStarts.push(cursor);
	}
	const found: { range: Range; rest: string[]; wrappers: TagWrapper[] }[] = [];
	for (const tag of scanFacts(text).tags) {
		const r = range((lineStarts[tag.line] as number) + tag.column, tag.length);
		if (maxRange(r) > text.length || text.charCodeAt(r.location) !== 0x23) continue;
		const path = text.slice(r.location + 1, maxRange(r));
		if (path !== tag.name) continue;
		const segments = path.split("/").filter((segment) => segment !== "");
		if (segments.length < wanted.length || !wanted.every((segment, i) => identityKey(segments[i] as string) === segment)) continue;
		found.push({ range: r, rest: segments.slice(wanted.length), wrappers: tag.wrappers });
	}
	return found;
}

/** `edits` (in text order, not overlapping) applied to `text`. */
function apply(edits: { range: Range; replacement: string }[], text: string): string {
	if (edits.length === 0) return text;
	let out = text;
	for (const edit of [...edits].reverse()) {
		out = out.slice(0, edit.range.location) + edit.replacement + out.slice(maxRange(edit.range));
	}
	return out;
}
