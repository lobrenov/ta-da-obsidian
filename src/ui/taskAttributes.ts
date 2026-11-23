import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension, type Range, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import { parentItem } from "../core/index/subtaskQueries";
import type { VaultIndex } from "../core/index/vaultIndex";
import { checkboxState } from "../core/model/checkbox";
import type { LocalDate } from "../core/model/localDate";
import { parseInlineAttributes } from "../core/parsing/inlineAttributes";
import { box, markerEnd, markerStart } from "../core/writing/checkboxSyntax";
import { settingDue, settingParent } from "../core/writing/subtaskLine";
import { relativeLabel, rowLabel } from "./navigator/dates";

/** Dispatched to redraw the pills and chips from the index, after a project or area appears, goes or is renamed. */
export const refreshTaskAttributes = StateEffect.define<null>();

/** How a parent attribute draws: a project's ring, an area's cube, or struck and muted when it resolves to nothing. */
export type ParentKind = "project" | "area" | "unresolved";

/** What the pills and chips need from the plugin. */
export interface TaskAttributeHost {
	index: Pick<VaultIndex, "itemsTitled">;
	today: () => LocalDate;
	/** Draws a parent's icon (`project` ring, `area` cube) into `parent`. */
	drawIcon: (parent: HTMLElement, kind: "project" | "area") => void;
	/** Opens the date picker on a clicked pill; `choose` gets the picked date, or null for Clear. */
	pickDate: (current: LocalDate, choose: (date: LocalDate | null) => void) => void;
	/** Opens the parent chooser on a clicked chip; `choose` gets the picked title, or null for None. */
	pickParent: (current: string, choose: (title: string | null) => void) => void;
}

/**
 * Replaces the date (`kind` due) or parent of the checkbox line holding `pos` with `value`, or removes it for null, as
 * `SubtaskLine` splices it: only that token changes. Does nothing when the line isn't a subtask.
 */
export function editAttribute(view: EditorView, pos: number, kind: "due" | "parent", value: LocalDate | string | null): void {
	const line = view.state.doc.lineAt(pos);
	const next = kind === "due" ? settingDue(value as LocalDate | null, line.text) : settingParent(value as string | null, line.text);
	if (next === null || next === line.text) return;
	view.dispatch({ changes: { from: line.from, to: line.to, insert: next } });
}

/** A due date or parent in a checkbox line: UTF-16 offsets in the line. */
export type LineAttribute = { kind: "due"; from: number; to: number; date: LocalDate } | { kind: "parent"; from: number; to: number; title: string };

/**
 * The attributes a line carries when it's a checkbox line (a list item with a box, not in a quote, not an icon box): the
 * first `>YYYY-MM-DD` and the first `@[[Title]]`, in line order. Anywhere else, none.
 */
export function lineAttributes(line: string): LineAttribute[] {
	const start = markerStart(line);
	if (line.slice(0, start).includes(">")) return [];
	const markerEndAt = markerEnd(line, start);
	const found = markerEndAt === null ? null : box(line, markerEndAt);
	const state = found === null ? null : checkboxState(found.marker);
	if (found === null || state === null || state === "icon") return [];
	let base = found.offset + 2;
	while (base < line.length && (line[base] === " " || line[base] === "\t")) base++;
	const attributes = parseInlineAttributes(line.slice(base));
	const result: LineAttribute[] = [];
	if (attributes.due) result.push({ kind: "due", from: base + attributes.due.range[0], to: base + attributes.due.range[0] + attributes.due.range[1], date: attributes.due.date });
	if (attributes.parent) result.push({ kind: "parent", from: base + attributes.parent.range[0], to: base + attributes.parent.range[0] + attributes.parent.range[1], title: attributes.parent.title });
	return result.sort((a, b) => a.from - b.from);
}

/** The kind a parent title draws as: the project it resolves to, else the area, else unresolved. */
export function parentKind(host: Pick<TaskAttributeHost, "index">, title: string): ParentKind {
	const parent = parentItem(host.index, title);
	return parent === null ? "unresolved" : parent.properties.kind === "project" ? "project" : "area";
}

class DatePill extends WidgetType {
	constructor(
		private readonly label: string,
		private readonly tooltip: string,
		private readonly overdue: boolean,
		private readonly date: LocalDate,
		private readonly host: TaskAttributeHost,
	) {
		super();
	}

	override eq(other: WidgetType): boolean {
		return other instanceof DatePill && other.label === this.label && other.tooltip === this.tooltip && other.overdue === this.overdue;
	}

	override toDOM(view: EditorView): HTMLElement {
		const el = view.dom.ownerDocument.createElement("span");
		el.className = `ta-da-attr-pill${this.overdue ? " is-overdue" : ""}`;
		el.textContent = this.label;
		el.setAttribute("aria-label", this.tooltip);
		el.addEventListener("mousedown", (event) => event.preventDefault());
		el.addEventListener("click", () => this.host.pickDate(this.date, (date) => editAttribute(view, view.posAtDOM(el), "due", date)));
		return el;
	}

	override ignoreEvent(): boolean {
		return true;
	}
}

class ParentChip extends WidgetType {
	constructor(
		private readonly title: string,
		private readonly kind: ParentKind,
		private readonly host: TaskAttributeHost,
	) {
		super();
	}

	override eq(other: WidgetType): boolean {
		return other instanceof ParentChip && other.title === this.title && other.kind === this.kind;
	}

	override toDOM(view: EditorView): HTMLElement {
		const el = view.dom.ownerDocument.createElement("span");
		el.className = `ta-da-attr-chip${this.kind === "unresolved" ? " is-unresolved" : ""}`;
		if (this.kind !== "unresolved") this.host.drawIcon(el, this.kind);
		const title = view.dom.ownerDocument.createElement("span");
		title.className = "ta-da-attr-chip-title";
		title.textContent = this.title;
		el.appendChild(title);
		el.setAttribute("aria-label", this.kind === "unresolved" ? `${this.title}, no project or area` : `In ${this.title}`);
		el.addEventListener("mousedown", (event) => event.preventDefault());
		el.addEventListener("click", () => this.host.pickParent(this.title, (title) => editAttribute(view, view.posAtDOM(el), "parent", title)));
		return el;
	}

	override ignoreEvent(): boolean {
		return true;
	}
}

/** How the editor extension reads its editor. */
export interface TaskAttributeEditor {
	/** Live Preview only: Source mode shows the text as written. */
	isLivePreview(state: EditorState): boolean;
}

/** Syntax nodes whose text isn't a checkbox line's. */
const literalNode = /code|comment|math|frontmatter/i;

/** Whether `pos` is in code (fenced, indented or inline), a comment, math or frontmatter. */
export function isLiteralAt(state: EditorState, pos: number): boolean {
	return literalNode.test(syntaxTree(state).resolveInner(pos, 1).name);
}

/**
 * Live Preview: on checkbox lines off the selection's lines, `>YYYY-MM-DD` as a date pill and `@[[Title]]` as a parent
 * chip, each in place of its source. They draw whether or not the notes are listed.
 */
export function taskAttributeExtension(host: TaskAttributeHost, editor: TaskAttributeEditor): Extension {
	const build = (view: EditorView): DecorationSet => {
		const { state } = view;
		if (!editor.isLivePreview(state)) return Decoration.none;
		const today = host.today();
		const widgets: Range<Decoration>[] = [];
		let done = 0;
		for (const range of view.visibleRanges) {
			const last = state.doc.lineAt(range.to).number;
			for (let number = Math.max(state.doc.lineAt(range.from).number, done + 1); number <= last; number++) {
				done = number;
				const line = state.doc.line(number);
				if (!line.text.includes(">") && !line.text.includes("@")) continue;
				if (state.selection.ranges.some((selected) => selected.from <= line.to && selected.to >= line.from)) continue;
				for (const attribute of lineAttributes(line.text)) {
					const from = line.from + attribute.from;
					if (isLiteralAt(state, from)) continue;
					const overdue = attribute.kind === "due" && attribute.date.compare(today) < 0;
					const widget =
						attribute.kind === "due"
							? new DatePill(rowLabel(attribute.date, today), `Due ${relativeLabel(attribute.date, today)}${overdue ? ", overdue" : ""}`, overdue, attribute.date, host)
							: new ParentChip(attribute.title, parentKind(host, attribute.title), host);
					widgets.push(Decoration.replace({ widget }).range(from, line.from + attribute.to));
				}
			}
		}
		return Decoration.set(widgets, true);
	};
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = build(view);
			}
			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet ||
					syntaxTree(update.startState) !== syntaxTree(update.state) ||
					editor.isLivePreview(update.startState) !== editor.isLivePreview(update.state) ||
					update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refreshTaskAttributes)))
				) {
					this.decorations = build(update.view);
				}
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}
