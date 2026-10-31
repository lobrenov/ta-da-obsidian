// @vitest-environment jsdom
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { type DecorationSet, EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { type DrawBox, type LinkBoxHost, linkBoxExtension, linkBoxProcessor, linkedTaskStatus, refreshLinkBoxes } from "../src/ui/linkBox";
import { makeItem } from "./support";

/** Stands in for the row checkbox, which needs Obsidian: a `ta-da-checkbox` with the status as a class. */
const draw: DrawBox = (parent, status) => {
	const box = document.createElement("span");
	box.className = `ta-da-checkbox is-${status.toLowerCase().replace(" ", "-")}`;
	parent.appendChild(box);
};

const index = new VaultIndex([
	makeItem("Ta Da/tasks/Open.md", "type: task\nstatus: Not Started"),
	makeItem("Ta Da/tasks/Doing.md", "type: task\nstatus: Doing"),
	makeItem("Ta Da/tasks/Stuck.md", "type: task\nstatus: Blocked"),
	makeItem("Ta Da/Logbook/Finished.md", "type: task\nstatus: Done"),
	makeItem("Ta Da/Logbook/Dropped.md", "type: task\nstatus: Cancelled"),
	makeItem("Ta Da/projects/Big.md", "type: project\nstatus: Ongoing"),
	makeItem("Notes/Plain.md", ""),
	makeItem("Ta Da/tasks/Twin.md", "type: task\nstatus: Doing"),
	makeItem("Notes/Twin.md", ""),
]);
const paths = index.itemsTitled("Twin").map((item) => item.path);

/** Obsidian's resolution, as far as the tests go: a path-qualified link names its file, else the first file of that name. */
const resolve = (linkpath: string): string | null => {
	const named = [...index.items.keys()].filter((path) => path.toLowerCase() === `${linkpath}.md`.toLowerCase());
	const titled = [...index.items.keys()].filter((path) => path.toLowerCase().endsWith(`/${linkpath}.md`.toLowerCase()));
	return named[0] ?? titled[0] ?? null;
};
const host = (over: Partial<LinkBoxHost> = {}): LinkBoxHost => ({ index, resolve, draw, enabled: () => true, ...over });
const editor = { sourceOf: () => "Notes/Source.md", isLivePreview: () => true };

describe("linkedTaskStatus", () => {
	it("gives each task status, logged tasks included", () => {
		const statuses = ["Open", "Doing", "Stuck", "Finished", "Dropped"].map((name) => linkedTaskStatus(host(), name, ""));
		expect(statuses).toEqual(["Not Started", "Doing", "Blocked", "Done", "Cancelled"]);
	});

	it("reads the target out of a path, heading and alias", () => {
		expect(linkedTaskStatus(host(), "Ta Da/tasks/Doing#Part|label", "")).toBe("Doing");
		expect(linkedTaskStatus(host(), "doing", "")).toBe("Doing");
	});

	it("gives null for projects, notes, unresolved and same-file links", () => {
		expect(linkedTaskStatus(host(), "Big", "")).toBeNull();
		expect(linkedTaskStatus(host(), "Plain", "")).toBeNull();
		expect(linkedTaskStatus(host(), "Missing", "")).toBeNull();
		expect(linkedTaskStatus(host(), "#heading", "")).toBeNull();
	});

	it("resolves as Obsidian does: a path-qualified link to a same-named note gives null", () => {
		expect(paths).toHaveLength(2);
		expect(linkedTaskStatus(host(), "Ta Da/tasks/Twin", "")).toBe("Doing");
		expect(linkedTaskStatus(host(), "Notes/Twin", "")).toBeNull();
	});

	it("passes the source path to the resolver", () => {
		const seen: string[] = [];
		linkedTaskStatus(host({ resolve: (_link, source) => (seen.push(source), null) }), "Doing", "Notes/Source.md");
		expect(seen).toEqual(["Notes/Source.md"]);
	});
});

function boxes(view: EditorView): { at: number; status: string }[] {
	const found: { at: number; status: string }[] = [];
	for (const value of view.state.facet(EditorView.decorations)) {
		const set = (typeof value === "function" ? value(view) : value) as DecorationSet;
		set.between(0, view.state.doc.length, (from, _to, decoration) => {
			const dom = (decoration.spec.widget as { toDOM(view: EditorView): HTMLElement }).toDOM(view);
			found.push({ at: from, status: dom.querySelector(".ta-da-checkbox")?.className.replace("ta-da-checkbox", "").trim() ?? "" });
		});
	}
	return found;
}

describe("linkBoxExtension", () => {
	const text = "A [[Doing]] b ![[Open]] c [[Plain]] d [[Finished|done]]";
	const make = (selection?: number): EditorView =>
		new EditorView({ state: EditorState.create({ doc: text, selection: selection === undefined ? undefined : EditorSelection.cursor(selection), extensions: [markdown(), linkBoxExtension(host(), editor)] }), parent: document.body });

	it("draws a box before each link to a task, not embeds or other links", () => {
		const view = make();
		expect(boxes(view)).toEqual([
			{ at: 2, status: "is-doing" },
			{ at: text.indexOf("[[Finished"), status: "is-done" },
		]);
	});

	it("draws none on the link the cursor is in", () => {
		const view = make(6);
		expect(boxes(view).map((box) => box.at)).toEqual([text.indexOf("[[Finished")]);
		view.dispatch({ selection: EditorSelection.cursor(0) });
		expect(boxes(view)).toHaveLength(2);
	});

	it("draws none in code, and none in Source mode", () => {
		const doc = "`[[Doing]]`\n\n```\n[[Doing]]\n```\n\nx [[Doing]]";
		const make2 = (extra: Extension): EditorView =>
			new EditorView({ state: EditorState.create({ doc, selection: EditorSelection.cursor(0), extensions: [markdown(), extra] }), parent: document.body });
		expect(boxes(make2(linkBoxExtension(host(), editor))).map((box) => box.at)).toEqual([doc.lastIndexOf("[[")]);
		expect(boxes(make2(linkBoxExtension(host(), { ...editor, isLivePreview: () => false })))).toEqual([]);
	});

	it("draws none while the setting is off, and draws them when it turns on", () => {
		let on = false;
		const view = new EditorView({ state: EditorState.create({ doc: text, selection: EditorSelection.cursor(0), extensions: [markdown(), linkBoxExtension(host({ enabled: () => on }), editor)] }), parent: document.body });
		expect(boxes(view)).toEqual([]);
		on = true;
		view.dispatch({ effects: refreshLinkBoxes.of(null) });
		expect(boxes(view)).toHaveLength(2);
		on = false;
		view.dispatch({ effects: refreshLinkBoxes.of(null) });
		expect(boxes(view)).toEqual([]);
	});

	it("redraws from the index on the refresh effect", () => {
		const live = new VaultIndex([makeItem("Ta Da/tasks/Doing.md", "type: task\nstatus: Doing")]);
		const liveHost = host({ index: live, resolve: () => "Ta Da/tasks/Doing.md" });
		const view = new EditorView({ state: EditorState.create({ doc: "x [[Doing]]", extensions: [markdown(), linkBoxExtension(liveHost, editor)] }), parent: document.body });
		expect(boxes(view)[0]?.status).toBe("is-doing");
		live.update(makeItem("Ta Da/tasks/Doing.md", "type: task\nstatus: Done"));
		view.dispatch({ effects: refreshLinkBoxes.of(null) });
		expect(boxes(view)[0]?.status).toBe("is-done");
	});
});

describe("linkBoxProcessor", () => {
	const html =
		'<a class="internal-link" data-href="Doing">Doing</a> <a class="internal-link" data-href="Plain">p</a> <a class="internal-link is-unresolved" data-href="Nope">n</a>';

	function section(over: Partial<LinkBoxHost> = {}) {
		const el = document.createElement("div");
		el.innerHTML = html;
		const children: { draw: () => void }[] = [];
		const ctx = { sourcePath: "Notes/Source.md", addChild: (child: { draw: () => void }) => children.push(child) };
		linkBoxProcessor(host(over), (_el, drawSection) => ({ draw: drawSection }) as never)(el, ctx as never);
		return { el, children };
	}

	it("puts a box before links to tasks only, redrawing without doubling", () => {
		const { el, children } = section();
		expect(children).toHaveLength(1);
		children[0]?.draw();
		children[0]?.draw();
		const links = [...el.querySelectorAll("a")];
		expect(links.map((link) => link.previousElementSibling?.classList.contains("ta-da-link-box"))).toEqual([true, false, false]);
		expect(el.querySelectorAll(".ta-da-link-box")).toHaveLength(1);
		expect(el.querySelector(".ta-da-link-box .is-doing")).not.toBeNull();
	});

	it("redraws from the index when its status changes", () => {
		const live = new VaultIndex([makeItem("Ta Da/tasks/Doing.md", "type: task\nstatus: Doing")]);
		const { el, children } = section({ index: live, resolve: () => "Ta Da/tasks/Doing.md" });
		children[0]?.draw();
		live.update(makeItem("Ta Da/tasks/Doing.md", "type: task\nstatus: Done"));
		children[0]?.draw();
		expect(el.querySelectorAll(".ta-da-link-box")).toHaveLength(3);
		expect(el.querySelector(".ta-da-link-box .is-done")).not.toBeNull();
		expect(el.querySelector(".ta-da-link-box .is-doing")).toBeNull();
	});

	it("draws none while the setting is off, and clears those drawn", () => {
		let on = true;
		const { el, children } = section({ enabled: () => on });
		children[0]?.draw();
		expect(el.querySelectorAll(".ta-da-link-box")).toHaveLength(1);
		on = false;
		children[0]?.draw();
		expect(el.querySelectorAll(".ta-da-link-box")).toHaveLength(0);
	});

	it("adds no child to a section without links", () => {
		const el = document.createElement("p");
		const children: unknown[] = [];
		linkBoxProcessor(host(), () => ({}) as never)(el, { sourcePath: "", addChild: (child: unknown) => children.push(child) } as never);
		expect(children).toEqual([]);
	});
});
