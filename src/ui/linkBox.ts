import { type Extension, type Range, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";
import type { MarkdownPostProcessor } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import { titleOfPath } from "../core/model/item";
import type { Status } from "../core/model/status";
import { wikiLinkParts } from "../core/model/wikiLink";

/** Draws a status box into a parent. */
export type DrawBox = (parent: HTMLElement, status: Status) => void;

/** Dispatched to redraw the boxes from the index, after a task's status changes in another file. */
export const refreshLinkBoxes = StateEffect.define<null>();

/** The status of the task a link's inner text (`target#heading|alias`) points at, logged ones included; null for any other target. Ongoing is a project's. */
export function linkedTaskStatus(index: Pick<VaultIndex, "itemsTitled">, inner: string): Status | null {
	const target = wikiLinkParts(inner)?.target;
	if (!target) return null;
	const item = index.itemsTitled(titleOfPath(target))[0];
	if (item?.properties.kind !== "task" || item.properties.status === "Ongoing") return null;
	return item.properties.status;
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

/** Live Preview: a box before each link to a task in view, except the link the selection is on, whose source shows. */
export function linkBoxExtension(index: Pick<VaultIndex, "itemsTitled">, draw: DrawBox): Extension {
	const build = (view: EditorView): DecorationSet => {
		const { state } = view;
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
				const status = linkedTaskStatus(index, match[2] ?? "");
				if (status) widgets.push(Decoration.widget({ widget: new LinkBoxWidget(status, draw), side: -1 }).range(start));
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
				if (update.docChanged || update.viewportChanged || update.selectionSet || update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refreshLinkBoxes)))) {
					this.decorations = build(update.view);
				}
			}
		},
		{ decorations: (plugin) => plugin.decorations },
	);
}

/** Reading view: a box before each internal link to a task. */
export function linkBoxProcessor(index: Pick<VaultIndex, "itemsTitled">, draw: DrawBox): MarkdownPostProcessor {
	return (el) => {
		for (const link of el.querySelectorAll<HTMLAnchorElement>("a.internal-link")) {
			if (link.previousElementSibling?.classList.contains("ta-da-link-box")) continue;
			const status = linkedTaskStatus(index, link.getAttribute("data-href") ?? "");
			if (status) link.before(linkBox(el.ownerDocument, status, draw));
		}
	};
}
