import type { Item } from "../core/model/item";
import type { LocalDate } from "../core/model/localDate";
import { isClosed } from "../core/model/status";
import { identityKey } from "../core/text";
import { box, markerEnd, markerStart } from "../core/writing/checkboxSyntax";
import { checkboxState } from "../core/model/checkbox";
import { type DayOrder, parseDatePhrase } from "../core/writing/datePhrase";
import { compareTitles } from "../core/index/vaultIndex";
import { dateLabel, weekdayDayMonth } from "./header/headerModel";

/** Where an attribute menu opens on a checkbox line: UTF-16 offsets in the line, the token's start (`>` or `@`) and the end the choice replaces, and the typed text after it. */
export interface AttributeTrigger {
	start: number;
	end: number;
	query: string;
}

/**
 * Where a checkbox line's text starts: after its box and the space or tab after that. Null for a line that isn't a
 * checkbox line (a quote, a plain item, an icon box or prose).
 */
function textStart(line: string): number | null {
	const start = markerStart(line);
	if (line.slice(0, start).includes(">")) return null;
	const markerEndAt = markerEnd(line, start);
	const found = markerEndAt === null ? null : box(line, markerEndAt);
	const state = found === null ? null : checkboxState(found.marker);
	return found === null || state === null || state === "icon" ? null : found.offset + 3;
}

const isBlank = (char: string | undefined): boolean => char === " " || char === "\t";
const dateQuery = /^[\p{L}\p{N}\-/ ]*$/u;
const finishedDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2} /;

/**
 * The date menu's trigger with the caret at `ch` in `line`: a `>` after whitespace on a checkbox line, after its box.
 * The query is the text after it: letters, digits, `-` and `/` with up to two single spaces, up to 40 characters, not
 * starting with a space; anything else, or a date already written and followed by a space, closes the menu. The menu
 * opens only for a `>` just typed (straight before the caret), or stays open for the `>` at `open`, the start it
 * opened on; text typed after an older `>` never opens it.
 */
export function dateTrigger(line: string, ch: number, open: number | null = null): AttributeTrigger | null {
	const first = textStart(line);
	if (first === null || ch < first) return null;
	for (let at = ch - 1; at >= first; at--) {
		if (line[at] !== ">" || !isBlank(line[at - 1]) || (at !== ch - 1 && at !== open)) continue;
		const query = line.slice(at + 1, ch);
		if (query.length > 40 || query.startsWith(" ") || /  /.test(query) || (query.match(/ /g)?.length ?? 0) > 2 || !dateQuery.test(query) || finishedDate.test(query)) continue;
		return { start: at, end: ch, query };
	}
	return null;
}

const parentForbidden = /[\n[\]|#^]/;

/**
 * The parent menu's trigger: an `@` after whitespace on a checkbox line, after its box. The query is the text after it
 * (a `[[` typed after the `@` is left out), without a newline, bracket, `|`, `#` or `^`, up to 100 characters, not
 * starting with a space. A `]]` straight after the caret, closing a `[[` typed after the `@`, is replaced too. It opens
 * only for an `@` just typed, or stays open for the one at `open`, as `dateTrigger` does.
 */
export function parentTrigger(line: string, ch: number, open: number | null = null): AttributeTrigger | null {
	const first = textStart(line);
	if (first === null || ch < first) return null;
	for (let at = ch - 1; at >= first; at--) {
		if (line[at] !== "@" || !isBlank(line[at - 1]) || (at !== ch - 1 && at !== open)) continue;
		const typed = line.slice(at + 1, ch);
		// The first `[` of a `[[` on its way keeps the menu too.
		const bracketed = typed.startsWith("[[") || typed === "[";
		const query = bracketed ? typed.slice(2) : typed;
		if (query.length > 100 || query.startsWith(" ") || parentForbidden.test(query)) continue;
		return { start: at, end: bracketed && line.startsWith("]]", ch) ? ch + 2 : ch, query };
	}
	return null;
}

/** One row of the date menu. `date` is null for Pick a date…, which opens the picker. */
export interface DateRow {
	kind: "phrase" | "quick" | "pick";
	label: string;
	detail: string | null;
	date: LocalDate | null;
}

/**
 * The date menu's rows: the typed phrase's date when it reads as one (`fri` on a Friday is today), then Today, Tomorrow and
 * Next week (leaving out the one the phrase already gave), then Pick a date….
 */
export function dateRows(query: string, today: LocalDate, order: DayOrder, firstWeekday: number): DateRow[] {
	const rows: DateRow[] = [];
	const typed = query.trim() === "" ? null : parseDatePhrase(query, today, order, firstWeekday);
	if (typed) rows.push({ kind: "phrase", label: dateLabel(typed, today), detail: typed.toString(), date: typed });
	const quick: [string, LocalDate][] = [
		["Today", today],
		["Tomorrow", today.addingDays(1)],
		["Next week", today.nextWeek(firstWeekday)],
	];
	for (const [label, date] of quick) {
		if (typed && typed.equals(date)) continue;
		rows.push({ kind: "quick", label, detail: weekdayDayMonth(date), date });
	}
	rows.push({ kind: "pick", label: "Pick a date…", detail: null, date: null });
	return rows;
}

/** The text a date row writes: `>YYYY-MM-DD` and a space. */
export function dateText(date: LocalDate): string {
	return `>${date.toString()} `;
}

/** A row of the parent menu: a project (ring) or area (cube), or a new project named by the typed text. */
export type ParentRow =
	| { kind: "project" | "area"; title: string; detail: string | null }
	| { kind: "new"; title: string };

/** What the parent menu reads from the index. */
export interface ParentSource {
	projects: Item[];
	areas: Item[];
	areaOf(item: Item): Item | null;
}

/**
 * How well `query` matches `text` as a fuzzy search does: null unless its characters appear in order (ignoring case);
 * higher for a prefix, a word's start and runs of consecutive characters.
 */
export function fuzzyScore(query: string, text: string): number | null {
	const needle = identityKey(query);
	const hay = identityKey(text);
	let at = -1;
	let score = 0;
	let run = 0;
	for (const char of needle) {
		const found = hay.indexOf(char, at + 1);
		if (found < 0) return null;
		run = found === at + 1 ? run + 1 : 0;
		score += 1 + run * 2 + (found === 0 ? 8 : isBlank(hay[found - 1]) ? 4 : 0) - Math.min(found - at - 1, 5) * 0.1;
		at = found;
	}
	return score - hay.length * 0.01;
}

/**
 * Live projects (not completed) and areas matching `query` fuzzily, best first, then by title; all of them for an empty
 * query, projects before areas. Typed text that names no project adds `New project “query”…` last.
 */
export function parentRows(source: ParentSource, query: string): ParentRow[] {
	const typed = query.trim();
	const candidates = [
		...source.projects.filter((project) => !isClosed(project.properties.status)).map((item) => ({ kind: "project" as const, item })),
		...source.areas.map((item) => ({ kind: "area" as const, item })),
	];
	const rows = candidates
		.flatMap((candidate) => {
			const score = typed === "" ? 0 : fuzzyScore(typed, candidate.item.title);
			return score === null ? [] : [{ ...candidate, score }];
		})
		.sort((a, b) => b.score - a.score || (a.kind === b.kind ? 0 : a.kind === "project" ? -1 : 1) || compareTitles(a.item.title, b.item.title))
		.map(({ kind, item }): ParentRow => ({ kind, title: item.title, detail: kind === "project" ? (source.areaOf(item)?.title ?? null) : null }));
	if (typed !== "" && !source.projects.some((project) => identityKey(project.title) === identityKey(typed))) rows.push({ kind: "new", title: typed });
	return rows;
}

/** The text a parent row writes: `@[[Title]]` and a space. */
export function parentText(title: string): string {
	return `@[[${title}]] `;
}
