import type { EditorView } from "@codemirror/view";
import { type App, type Editor, type EditorPosition, EditorSuggest, type EditorSuggestContext, type EditorSuggestTriggerInfo, Notice, type TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import type { LocalDate } from "../core/model/localDate";
import { dateRows, dateText, dateTrigger, type DateRow, type ParentRow, parentRows, parentText, parentTrigger } from "./attributeSuggestions";
import { isLiteralAt } from "./taskAttributes";
import { icon } from "./header/dom";
import { dayOrderOf, firstWeekdayOf } from "./header/locale";
import { DateModal } from "./header/modals";
import { createProject } from "./newProject";
import { message } from "../vaultFiles";

/** What the `>` and `@` menus need from the plugin. */
export interface AttributeSuggestHost {
	app: App;
	index: VaultIndex;
	today: () => LocalDate;
}

/**
 * Replaces the `from`–`to` token of line `line` with `text`, only while the line still reads `token` there (a menu
 * that waits on a picker or a new file mustn't write over what was typed meanwhile), and puts the caret after it.
 */
export function replaceToken(editor: Pick<Editor, "getLine" | "replaceRange" | "setCursor">, line: number, from: number, to: number, token: string, text: string): boolean {
	if (editor.getLine(line).slice(from, to) !== token) return false;
	editor.replaceRange(text, { line, ch: from }, { line, ch: to });
	editor.setCursor({ line, ch: from + text.length });
	return true;
}

const footer = [
	{ command: "↑↓", purpose: "to navigate" },
	{ command: "↵", purpose: "to accept" },
	{ command: "esc", purpose: "to dismiss" },
];

/** No trigger inside fenced, indented or inline code (or a comment, math or frontmatter): the token's start is checked in the editor's syntax tree. */
function triggerInfo(editor: Editor, cursor: EditorPosition, found: { start: number; end: number; query: string } | null): EditorSuggestTriggerInfo | null {
	const view = (editor as unknown as { cm?: EditorView }).cm;
	if (found && view && isLiteralAt(view.state, view.state.doc.line(cursor.line + 1).from + found.start)) return null;
	return found && { start: { line: cursor.line, ch: found.start }, end: { line: cursor.line, ch: found.end }, query: found.query };
}

/**
 * What the menus remember: the start of the token the menu is open on, so typing on keeps it open and typing after an
 * older `>` or `@` doesn't open it. Closing it (esc, a pick, or the text no longer triggering) forgets the start.
 */
class Anchor {
	private start: { line: number; ch: number } | null = null;

	/** The open start's offset when the menu is open on `line`. */
	openAt(line: number): number | null {
		return this.start?.line === line ? this.start.ch : null;
	}

	track(cursor: EditorPosition, found: { start: number } | null): void {
		this.start = found ? { line: cursor.line, ch: found.start } : null;
	}

	clear(): void {
		this.start = null;
	}
}

/** The token a suggestion replaces, as the line reads it now. */
function tokenOf(context: EditorSuggestContext): { line: number; from: number; to: number; token: string } {
	const { start, end, editor } = context;
	return { line: start.line, from: start.ch, to: end.ch, token: editor.getLine(start.line).slice(start.ch, end.ch) };
}

/** `>` on a checkbox line, after whitespace: the date menu. ↵ writes `>YYYY-MM-DD `. */
export class DateSuggest extends EditorSuggest<DateRow> {
	private readonly anchor = new Anchor();

	constructor(private readonly host: AttributeSuggestHost) {
		super(host.app);
		this.setInstructions(footer);
	}

	override onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const found = dateTrigger(editor.getLine(cursor.line), cursor.ch, this.anchor.openAt(cursor.line));
		const info = triggerInfo(editor, cursor, found);
		this.anchor.track(cursor, info && found);
		return info;
	}

	override close(): void {
		this.anchor.clear();
		super.close();
	}

	override getSuggestions(context: EditorSuggestContext): DateRow[] {
		return dateRows(context.query, this.host.today(), dayOrderOf(), firstWeekdayOf());
	}

	override renderSuggestion(row: DateRow, el: HTMLElement): void {
		const doc = el.ownerDocument;
		el.classList.add("ta-da-suggest-row");
		el.appendChild(icon(doc, "calendar", 14));
		const label = doc.createElement("span");
		label.className = "ta-da-suggest-label";
		label.textContent = row.label;
		el.appendChild(label);
		if (row.detail) {
			const detail = doc.createElement("span");
			detail.className = "ta-da-suggest-detail";
			detail.textContent = row.detail;
			el.appendChild(detail);
		}
	}

	override selectSuggestion(row: DateRow): void {
		const { context } = this;
		if (!context) return;
		const { editor } = context;
		const { line, from, to, token } = tokenOf(context);
		this.anchor.clear();
		if (row.date) {
			replaceToken(editor, line, from, to, token, dateText(row.date));
			return;
		}
		this.close();
		new DateModal(this.host.app, "Due date", null, this.host.today(), dayOrderOf(), firstWeekdayOf(), (date) => {
			if (date) replaceToken(editor, line, from, to, token, dateText(date));
			editor.focus();
		}).open();
	}
}

/** `@` on a checkbox line, after whitespace: the projects and areas. ↵ writes `@[[Title]] `. */
export class ParentSuggest extends EditorSuggest<ParentRow> {
	private readonly anchor = new Anchor();

	constructor(private readonly host: AttributeSuggestHost) {
		super(host.app);
		this.setInstructions(footer);
	}

	override onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const found = parentTrigger(editor.getLine(cursor.line), cursor.ch, this.anchor.openAt(cursor.line));
		const info = triggerInfo(editor, cursor, found);
		this.anchor.track(cursor, info && found);
		return info;
	}

	override close(): void {
		this.anchor.clear();
		super.close();
	}

	override getSuggestions(context: EditorSuggestContext): ParentRow[] {
		return parentRows(this.host.index, context.query);
	}

	override renderSuggestion(row: ParentRow, el: HTMLElement): void {
		const doc = el.ownerDocument;
		el.classList.add("ta-da-suggest-row");
		el.appendChild(icon(doc, row.kind === "area" ? "cube" : row.kind === "project" ? "ring" : "plus", 14));
		const label = doc.createElement("span");
		label.className = "ta-da-suggest-label";
		label.textContent = row.kind === "new" ? `New project “${row.title}”…` : row.title;
		el.appendChild(label);
		if (row.kind !== "new" && row.detail) {
			const detail = doc.createElement("span");
			detail.className = "ta-da-suggest-detail";
			detail.textContent = row.detail;
			el.appendChild(detail);
		}
	}

	override selectSuggestion(row: ParentRow): void {
		const { context } = this;
		if (!context) return;
		const { editor } = context;
		const { line, from, to, token } = tokenOf(context);
		this.anchor.clear();
		if (row.kind !== "new") {
			replaceToken(editor, line, from, to, token, parentText(row.title));
			return;
		}
		createProject(this.host, row.title).then(
			(file) => void replaceToken(editor, line, from, to, token, parentText(file.basename)),
			(error: unknown) => void new Notice(`Couldn't make the project: ${message(error)}`),
		);
	}
}
