// @vitest-environment jsdom
import { markdown } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { type DecorationSet, EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { editAttribute, lineAttributes, parentKind, refreshTaskAttributes, type TaskAttributeHost, taskAttributeExtension } from "../src/ui/taskAttributes";
import { makeItem } from "./support";

const today = LocalDate.parse("2026-10-02") as LocalDate;
const index = new VaultIndex([makeItem("Ta Da/projects/Plan.md", "type: project"), makeItem("Ta Da/areas/Work.md", "type: area"), makeItem("Notes/Plain.md", "tags: []")]);
const host = (over: Partial<TaskAttributeHost> = {}): TaskAttributeHost => ({
	index,
	today: () => today,
	drawIcon: (parent, kind) => {
		const icon = document.createElement("span");
		icon.className = `icon is-${kind}`;
		parent.appendChild(icon);
	},
	pickDate: () => undefined,
	pickParent: () => undefined,
	...over,
});
const editor = { isLivePreview: () => true };

describe("lineAttributes", () => {
	it("reads the first date and parent of a checkbox line, in line order, with offsets in the line", () => {
		const line = "- [ ] Call >2026-10-09 Sam @[[Plan]] later";
		expect(lineAttributes(line)).toEqual([
			{ kind: "due", from: 11, to: 22, date: LocalDate.parse("2026-10-09") },
			{ kind: "parent", from: 27, to: 36, title: "Plan" },
		]);
		expect(line.slice(11, 22)).toBe(">2026-10-09");
		expect(line.slice(27, 36)).toBe("@[[Plan]]");
	});

	it("takes the first of each, and only after whitespace", () => {
		expect(lineAttributes("- [ ] a>2026-10-09 >2026-10-10 @[[A]] @[[B]]").map((attribute) => attribute.kind === "due" ? attribute.date.toString() : attribute.title)).toEqual(["2026-10-10", "A"]);
	});

	it("reads indented, numbered and Doing boxes", () => {
		expect(lineAttributes("    1. [/] x >2026-10-09")).toHaveLength(1);
		expect(lineAttributes("\t* [>] x @[[A]]")).toHaveLength(1);
	});

	it("reads none from prose, plain items, quotes, callouts, icon boxes or code spans", () => {
		for (const line of ["Prose >2026-10-09 @[[Plan]]", "- plain >2026-10-09", "> - [ ] quoted >2026-10-09", "> [!todo] >2026-10-09", "- [!] icon >2026-10-09", "- [ ] `>2026-10-09`", ">2026-10-09"]) {
			expect(lineAttributes(line), line).toEqual([]);
		}
	});

	it("tells a project, an area and an unresolved parent apart, ignoring case; notes aren't parents", () => {
		expect(["Plan", "work", "Plain", "Nope"].map((title) => parentKind(host(), title))).toEqual(["project", "area", "unresolved", "unresolved"]);
	});
});

interface Drawn {
	from: number;
	to: number;
	dom: HTMLElement;
}

function drawn(view: EditorView): Drawn[] {
	const found: Drawn[] = [];
	for (const value of view.state.facet(EditorView.decorations)) {
		const set = (typeof value === "function" ? value(view) : value) as DecorationSet;
		set.between(0, view.state.doc.length, (from, to, decoration) => {
			found.push({ from, to, dom: (decoration.spec.widget as { toDOM(view: EditorView): HTMLElement }).toDOM(view) });
		});
	}
	return found;
}

describe("taskAttributeExtension", () => {
	const doc = "- [ ] One >2026-10-09 @[[Plan]]\n- [x] Two >2026-09-30 @[[Work]]\n- [ ] Three @[[Nope]]\nProse >2026-10-09\n- [ ] Four";
	const make = (selection: number | undefined, extra: Extension = taskAttributeExtension(host(), editor), text = doc): EditorView =>
		new EditorView({ state: EditorState.create({ doc: text, selection: selection === undefined ? undefined : EditorSelection.cursor(selection), extensions: [markdown(), extra] }), parent: document.body });

	it("replaces each attribute's source with a date pill and a parent chip, in order", () => {
		const view = make(doc.length);
		const found = drawn(view);
		expect(found.map((entry) => doc.slice(entry.from, entry.to))).toEqual([">2026-10-09", "@[[Plan]]", ">2026-09-30", "@[[Work]]", "@[[Nope]]"]);
		expect(found.map((entry) => entry.dom.className)).toEqual([
			"ta-da-attr-pill",
			"ta-da-attr-chip",
			"ta-da-attr-pill is-overdue",
			"ta-da-attr-chip",
			"ta-da-attr-chip is-unresolved",
		]);
		expect(found[0]?.dom.textContent).toBe("9 Oct");
		expect(found[2]?.dom.getAttribute("aria-label")).toBe("Due Wed 30 Sep, overdue");
	});

	it("draws a project's ring and an area's cube, accent title, and none for an unresolved parent", () => {
		const found = drawn(make(doc.length));
		expect(found[1]?.dom.querySelector(".is-project")).not.toBeNull();
		expect(found[1]?.dom.querySelector(".ta-da-attr-chip-title")?.textContent).toBe("Plan");
		expect(found[3]?.dom.querySelector(".is-area")).not.toBeNull();
		expect(found[4]?.dom.querySelector(".icon")).toBeNull();
		expect(found[4]?.dom.querySelector(".ta-da-attr-chip-title")?.textContent).toBe("Nope");
	});

	it("leaves the source on the caret's line, and draws it again when the caret leaves", () => {
		const view = make(3);
		expect(drawn(view).map((entry) => doc.slice(entry.from, entry.to))).toEqual([">2026-09-30", "@[[Work]]", "@[[Nope]]"]);
		view.dispatch({ selection: EditorSelection.cursor(doc.length) });
		expect(drawn(view)).toHaveLength(5);
	});

	it("draws none in code or in Source mode", () => {
		const text = "```\n- [ ] x >2026-10-09\n```\n\n- [ ] y >2026-10-09";
		expect(drawn(make(0, taskAttributeExtension(host(), editor), text)).map((entry) => entry.from)).toEqual([text.lastIndexOf(">")]);
		expect(drawn(make(0, taskAttributeExtension(host(), { isLivePreview: () => false }), text))).toEqual([]);
	});

	it("redraws a chip from the index on the refresh effect", () => {
		const live = new VaultIndex([makeItem("Ta Da/projects/Plan.md", "type: project")]);
		const view = make(undefined, taskAttributeExtension(host({ index: live }), editor), "y\n- [ ] x @[[Plan]]");
		expect(drawn(view)[0]?.dom.className).toBe("ta-da-attr-chip");
		live.remove("Ta Da/projects/Plan.md");
		view.dispatch({ effects: refreshTaskAttributes.of(null) });
		expect(drawn(view)[0]?.dom.className).toBe("ta-da-attr-chip is-unresolved");
	});
});

describe("clicking a pill or chip", () => {
	const doc = "intro\n- [ ] One >2026-10-09 @[[Plan]] end";
	const make = (over: Partial<TaskAttributeHost>) =>
		new EditorView({ state: EditorState.create({ doc: "x\n" + doc.split("\n")[1], selection: EditorSelection.cursor(0), extensions: [markdown(), taskAttributeExtension(host(over), editor)] }), parent: document.body });

	it("opens the date picker on the pill's date, and writes the pick over the date only", () => {
		let current = "";
		let choose: (date: LocalDate | null) => void = () => undefined;
		const view = make({ pickDate: (date, pick) => ((current = date.toString()), (choose = pick)) });
		(drawn(view)[0]?.dom as HTMLElement).click();
		expect(current).toBe("2026-10-09");
		choose(LocalDate.parse("2026-11-05"));
		expect(view.state.doc.toString()).toBe("x\n- [ ] One >2026-11-05 @[[Plan]] end");
	});

	it("removes the date when the picker clears it", () => {
		let choose: (date: LocalDate | null) => void = () => undefined;
		const view = make({ pickDate: (_date, pick) => (choose = pick) });
		drawn(view)[0]?.dom.click();
		choose(null);
		expect(view.state.doc.toString()).toBe("x\n- [ ] One @[[Plan]] end");
	});

	it("opens the parent chooser on the chip's title, and writes or removes the parent", () => {
		let current = "";
		let choose: (title: string | null) => void = () => undefined;
		const view = make({ pickParent: (title, pick) => ((current = title), (choose = pick)) });
		drawn(view)[1]?.dom.click();
		expect(current).toBe("Plan");
		choose("Work");
		expect(view.state.doc.toString()).toBe("x\n- [ ] One >2026-10-09 @[[Work]] end");
		view.dispatch({ selection: EditorSelection.cursor(0) });
		drawn(view)[1]?.dom.click();
		choose(null);
		expect(view.state.doc.toString()).toBe("x\n- [ ] One >2026-10-09 end");
	});

	it("takes the position at click time: a pick after the line changed or the text shrank writes nothing", () => {
		let choose: (date: LocalDate | null) => void = () => undefined;
		const view = make({ pickDate: (_date, pick) => (choose = pick) });
		drawn(view)[0]?.dom.click();
		const before = view.state.doc.toString();
		view.dispatch({ changes: { from: view.state.doc.length, insert: " more" } });
		const shifted = view.state.doc.toString();
		choose(LocalDate.parse("2026-11-05"));
		expect(view.state.doc.toString()).toBe(shifted);
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } });
		choose(LocalDate.parse("2026-11-05"));
		expect(view.state.doc.toString()).toBe("");
		expect(before).toContain(">2026-10-09");
	});

	it("editAttribute leaves a line that isn't a subtask", () => {
		const view = new EditorView({ state: EditorState.create({ doc: "plain >2026-10-09" }), parent: document.body });
		editAttribute(view, 0, "due", null);
		expect(view.state.doc.toString()).toBe("plain >2026-10-09");
	});
});
