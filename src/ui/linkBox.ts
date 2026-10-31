import { syntaxTree } from "@codemirror/language";
import { type EditorState, type Extension, type Range, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import type { MarkdownPostProcessor, MarkdownRenderChild } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import type { Status } from "../core/model/status";
import { wikiLinkParts } from "../core/model/wikiLink";

/** Draws a status box into a parent. */
export type DrawBox = (parent: HTMLElement, status: Status) => void;

/** Dispatched to redraw the boxes from the index, after a task's status changes in another file. */
export const refreshLinkBoxes = StateEffect.define<null>();

/** The path of the file a link's target resolves to from a source file, as Obsidian resolves it; null when it doesn't. */
export type Resolve = (linkpath: string, sourcePath: string) => string | null;

/** What the boxes need from the plugin. */
export interface LinkBoxHost {
	index: Pick<VaultIndex, "get">;
	resolve: Resolve;
	draw: DrawBox;
}

/** The status of the task a link's inner text (`target#heading|alias`) points at, logged ones included; null for any other target. Ongoing is a project's. */
export function linkedTaskStatus(host: Pick<LinkBoxHost, "index" | "resolve">, inner: string, sourcePath: string): Status | null {
	const target = wikiLinkParts(inner)?.target;
	if (!target) return null;
	const path = host.resolve(target, sourcePath);
	const properties = path === null ? undefined : host.index.get(path)?.properties;
	if (properties?.kind !== "task" || properties.status === "Ongoing") return null;
	return properties.status;
}

/** The box drawn before a link, in the navigator row's checkbox. */
function linkBox(doc: Document, status: Status, draw: DrawBox): HTMLElement {
	const holder = doc.createElement("span");
	holder.className = "ta-da-link-box";
	holder.setAttribute("aria-hidden", "true");
	draw(holder, status);
	return holder;
}

class LinkBoxWidget extends WidgetType {
	constructor(
		private readonly status: Status,
		private readonly draw: DrawBox,
	) {
		super();
	}

	override eq(other: WidgetType): boolean {
		return other instanceof LinkBoxWidget && other.status === this.status;
	}

	override toDOM(view: EditorView): HTMLElement {
		return linkBox(view.dom.ownerDocument, this.status, this.draw);
	}

	override ignoreEvent(): boolean {
		return true;
	}
}

const wikiLinkPattern = /(!?)\[\[([^[\]\n]+)\]\]/g;

/** How the editor extension reads its editor. */
export interface LinkBoxEditor {
	/** The path of the file an editor shows. */
	sourceOf(state: EditorState): string;
	/** Live Preview only: Source mode shows the links' text as written. */
	isLivePreview(state: EditorState): boolean;
}

/** Syntax nodes whose links are text, not links. */
const literalNode = /code|comment|math|frontmatter/i;

/** Live Preview: a box before each link to a task in view, except the link the selection is on, whose source shows. */
export function linkBoxExtension(host: LinkBoxHost, editor: LinkBoxEditor): Extension {
	const build = (view: EditorView): DecorationSet => {
		const { state } = view;
		if (!editor.isLivePreview(state)) return Decoration.none;
		const tree = syntaxTree(state);
		const sourcePath = editor.sourceOf(state);
		const widgets: Range<Decoration>[] = [];
		let last = -1;
		for (const range of view.visibleRanges) {
			const from = Math.max(state.doc.lineAt(range.from).from, last);
			const to = state.doc.lineAt(range.to).to;
			if (from > to) continue;
			last = to + 1;
			const text = state.doc.sliceString(from, to);
			for (const match of text.matchAll(wikiLinkPattern)) {
				const bang = match[1] ?? "";
				if (bang !== "") continue;
				const start = from + match.index;
				const end = start + match[0].length;
				if (state.selection.ranges.some((selected) => selected.from <= end && selected.to >= start)) continue;
				if (literalNode.test(tree.resolveInner(start + 2, 1).name)) continue;
				const status = linkedTaskStatus(host, match[2] ?? "", sourcePath);
				if (status) widgets.push(Decoration.widget({ widget: new LinkBoxWidget(status, host.draw), side: -1 }).range(start));
			}
		}
		return Decoration.set(widgets);
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
					update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refreshLinkBoxes)))
				) {
					this.decorations = build(update.view);
				}
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}

/**
 * Reading view, and the sections Live Preview post-processes (tables, callouts): a box before each internal link to a
 * task. A section with a link redraws its boxes from the index when that changes.
 */
export function linkBoxProcessor(host: LinkBoxHost, renderChild: (section: HTMLElement, draw: () => void) => MarkdownRenderChild): MarkdownPostProcessor {
	return (el, ctx) => {
		if (el.querySelector("a.internal-link") === null) return;
		const draw = (): void => {
			for (const box of el.querySelectorAll(".ta-da-link-box")) box.remove();
			for (const link of el.querySelectorAll<HTMLAnchorElement>("a.internal-link")) {
				const status = linkedTaskStatus(host, link.getAttribute("data-href") ?? "", ctx.sourcePath);
				if (status) link.before(linkBox(el.ownerDocument, status, host.draw));
			}
		};
		ctx.addChild(renderChild(el, draw));
	};
}
