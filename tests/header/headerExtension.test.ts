// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { type DecorationSet, EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../../src/core/index/vaultIndex";
import { LocalDate } from "../../src/core/model/localDate";
import { buildHeader } from "../../src/ui/header/buildHeader";
import { headerExtension, type HeaderSource, refreshHeader } from "../../src/ui/header/headerExtension";
import { modelFromText } from "../../src/ui/header/headerModel";

const today = LocalDate.parse("2026-10-02") as LocalDate;
const file = { path: "Ta Da/tasks/X.md" };
const noActions = {
	openStatus: () => undefined,
	openParent: () => undefined,
	openDate: () => undefined,
	openAddTag: () => undefined,
	removeTag: () => undefined,
	toggleProperties: () => false,
};

function source(overrides: Partial<HeaderSource<{ path: string }>> = {}): HeaderSource<{ path: string }> & { render: ReturnType<typeof vi.fn> } {
	const index = new VaultIndex();
	const render = vi.fn((model, _file, doc: Document) => buildHeader(doc, model, noActions, false));
	return {
		fileOf: () => file,
		modelOf: (text, f) => modelFromText(text, f.path, index, today),
		...overrides,
		render,
	};
}

function widgets(state: EditorState): { from: number; block: boolean; side: number }[] {
	const found: { from: number; block: boolean; side: number }[] = [];
	const sets = state.facet(EditorView.decorations).map((value) => (typeof value === "function" ? null : value));
	for (const set of sets) {
		(set as DecorationSet | null)?.between(0, state.doc.length, (from, _to, value) => {
			found.push({ from, block: value.spec.block as boolean, side: value.spec.side as number });
		});
	}
	return found;
}

const text = "---\ntype: task\nstatus: Doing\n---\nBody\n";

describe("headerExtension", () => {
	it("puts one block widget at the start of the document, ahead of the frontmatter", () => {
		const extension = headerExtension(source());
		const state = EditorState.create({ doc: text, extensions: [extension] });
		expect(widgets(state)).toEqual([{ from: 0, block: true, side: -1 }]);
	});

	it("draws nothing for a note or an editor with no file", () => {
		const note = headerExtension(source({ modelOf: () => null }));
		expect(widgets(EditorState.create({ doc: "x", extensions: [note] }))).toEqual([]);
		const none = headerExtension(source({ fileOf: () => null }));
		expect(widgets(EditorState.create({ doc: text, extensions: [none] }))).toEqual([]);
	});

	it("renders the header into the editor and follows typing", () => {
		const parent = document.createElement("div");
		document.body.appendChild(parent);
		const view = new EditorView({ parent, state: EditorState.create({ doc: text, extensions: [headerExtension(source())] }) });
		const status = (): string | undefined => view.dom.querySelector(".ta-da-chip.is-status")?.textContent ?? undefined;
		expect(status()).toBe("Doing");
		const at = view.state.doc.toString().indexOf("Doing");
		view.dispatch({ changes: { from: at, to: at + 5, insert: "Blocked" } });
		expect(status()).toBe("Blocked");
		view.destroy();
	});

	it("keeps the DOM while the header's model is the same, also across a refresh effect", () => {
		const src = source();
		const parent = document.createElement("div");
		document.body.appendChild(parent);
		const view = new EditorView({ parent, state: EditorState.create({ doc: text, extensions: [headerExtension(src)] }) });
		const first = view.dom.querySelector(".ta-da-header");
		view.dispatch({ changes: { from: view.state.doc.length, insert: "more body" } });
		expect(view.dom.querySelector(".ta-da-header")).toBe(first);
		expect(src.render).toHaveBeenCalledOnce();
		view.dispatch({ effects: refreshHeader.of(null) });
		expect(view.dom.querySelector(".ta-da-header")).toBe(first);
		view.destroy();
	});
});
