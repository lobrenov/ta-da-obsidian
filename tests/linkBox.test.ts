// @vitest-environment jsdom
import { EditorSelection, EditorState } from "@codemirror/state";
import { type DecorationSet, EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { type DrawBox, linkBoxExtension, linkBoxProcessor, linkedTaskStatus, refreshLinkBoxes } from "../src/ui/linkBox";
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
]);

describe("linkedTaskStatus", () => {
	it("gives each task status, logged tasks included", () => {
		const statuses = ["Open", "Doing", "Stuck", "Finished", "Dropped"].map((name) => linkedTaskStatus(index, name));
		expect(statuses).toEqual(["Not Started", "Doing", "Blocked", "Done", "Cancelled"]);
	});

	it("reads the target out of a path, heading and alias", () => {
		expect(linkedTaskStatus(index, "Ta Da/tasks/Doing#Part|label")).toBe("Doing");
		expect(linkedTaskStatus(index, "doing")).toBe("Doing");
	});

	it("gives null for projects, notes, unresolved and same-file links", () => {
		expect(linkedTaskStatus(index, "Big")).toBeNull();
		expect(linkedTaskStatus(index, "Plain")).toBeNull();
		expect(linkedTaskStatus(index, "Missing")).toBeNull();
		expect(linkedTaskStatus(index, "#heading")).toBeNull();
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
		new EditorView({ state: EditorState.create({ doc: text, selection: selection === undefined ? undefined : EditorSelection.cursor(selection), extensions: [linkBoxExtension(index, draw)] }), parent: document.body });

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

	it("redraws from the index on the refresh effect", () => {
		const live = new VaultIndex([makeItem("Ta Da/tasks/Doing.md", "type: task\nstatus: Doing")]);
		const view = new EditorView({ state: EditorState.create({ doc: "x [[Doing]]", extensions: [linkBoxExtension(live, draw)] }), parent: document.body });
		expect(boxes(view)[0]?.status).toBe("is-doing");
		live.update(makeItem("Ta Da/tasks/Doing.md", "type: task\nstatus: Done"));
		view.dispatch({ effects: refreshLinkBoxes.of(null) });
		expect(boxes(view)[0]?.status).toBe("is-done");
	});
});

describe("linkBoxProcessor", () => {
	it("puts a box before links to tasks only, once", () => {
		const el = document.createElement("div");
		el.innerHTML =
			'<a class="internal-link" data-href="Doing">Doing</a> <a class="internal-link" data-href="Plain">p</a> <a class="internal-link is-unresolved" data-href="Nope">n</a>';
		const process = linkBoxProcessor(index, draw);
		process(el, {} as never);
		process(el, {} as never);
		const links = [...el.querySelectorAll("a")];
		expect(links.map((link) => link.previousElementSibling?.classList.contains("ta-da-link-box"))).toEqual([true, false, false]);
		expect(el.querySelectorAll(".ta-da-link-box")).toHaveLength(1);
		expect(el.querySelector(".ta-da-link-box .is-doing")).not.toBeNull();
	});
});
