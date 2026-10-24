import { type EditorState, type Extension, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import type { HeaderModel } from "./headerModel";

/** Dispatched to redraw a header from the index as well as the text, for example after a parent file changes. */
export const refreshHeader = StateEffect.define<null>();

/** How the extension reads a file's header and draws it. */
export interface HeaderSource<File> {
	/** The file an editor shows; null for an editor with none. */
	fileOf(state: EditorState): File | null;
	/** The header for the editor's current text; null when the file has none (a note, an untyped file). */
	modelOf(text: string, file: File): HeaderModel | null;
	render(model: HeaderModel, file: File, doc: Document): HTMLElement;
}

class HeaderWidget<File> extends WidgetType {
	private readonly key: string;

	constructor(
		private readonly model: HeaderModel,
		private readonly file: File,
		private readonly source: HeaderSource<File>,
	) {
		super();
		this.key = JSON.stringify(model);
	}

	/** Equal models keep the DOM, so a typed character that changes nothing on the header leaves a menu's anchor alone. */
	override eq(other: WidgetType): boolean {
		return other instanceof HeaderWidget && other.key === this.key && other.file === this.file;
	}

	override toDOM(view: EditorView): HTMLElement {
		return this.source.render(this.model, this.file, view.dom.ownerDocument);
	}

	/** The header handles its own clicks and keys. */
	override ignoreEvent(): boolean {
		return true;
	}
}

/**
 * A block widget at the very start of the document, which is where the frontmatter is: the header draws above
 * Obsidian's own Properties widget, which the `ta-da-file` class hides. It's read from the editor's text on every
 * change, so it follows typing.
 */
export function headerExtension<File>(source: HeaderSource<File>): Extension {
	const build = (state: EditorState): DecorationSet => {
		const file = source.fileOf(state);
		const model = file === null ? null : source.modelOf(state.doc.toString(), file);
		if (file === null || model === null) return Decoration.none;
		const widget = new HeaderWidget(model, file, source);
		return Decoration.set([Decoration.widget({ widget, block: true, side: -1 }).range(0)]);
	};
	const field = StateField.define<DecorationSet>({
		create: build,
		update(value, transaction) {
			if (!transaction.docChanged && !transaction.effects.some((effect) => effect.is(refreshHeader))) return value;
			return build(transaction.state);
		},
		provide: (self) => EditorView.decorations.from(self),
	});
	return field;
}
