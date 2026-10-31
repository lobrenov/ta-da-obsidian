import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { makeItem } from "./support";

// jsdom's window by hand: the jsdom environment can't resolve a mocked "obsidian".
const { dom } = await vi.hoisted(async () => ({ dom: new (await import("jsdom")).JSDOM("") }));
const { document, window } = dom.window;
vi.mock("obsidian", () => ({
	ItemView: class {},
	Keymap: {},
	Menu: class {},
	Modal: class {},
	SuggestModal: class {},
	Notice: class {},
	Platform: { isMobile: false },
	TFile: class {},
	debounce: (fn: unknown) => fn,
	setIcon: () => undefined,
}));
Object.assign(window.HTMLElement.prototype, {
	addClass(this: HTMLElement, name: string) {
		this.classList.add(name);
	},
	removeClass(this: HTMLElement, name: string) {
		this.classList.remove(name);
	},
});

const { NavigatorView } = await import("../src/ui/navigator/NavigatorView");

const index = new VaultIndex([
	makeItem("Ta Da/tasks/A.md", "type: task"),
	makeItem("Ta Da/tasks/B.md", "type: task"),
	makeItem("Ta Da/projects/Home.md", "type: project"),
	makeItem("Ta Da/projects/Work.md", "type: project"),
	makeItem("Ta Da/areas/Personal.md", "type: area"),
	makeItem("Notes/Plain.md", ""),
]);

type Draggable = { type: string; file?: { path: string }; files?: { path: string }[] } | null;

function setup(draggable: Draggable, manager: object | null = {}) {
	const files = new Map([...index.items.keys()].map((path) => [path, { path }]));
	const apply = vi.fn(async (_file: unknown, _edit: unknown) => undefined);
	const dragManager = manager && { draggable, ...manager };
	const view = Object.assign(Object.create(NavigatorView.prototype) as object, {
		app: { dragManager, vault: { getFileByPath: (path: string) => files.get(path) ?? null } },
		deps: { taDaIndex: { index }, writer: { apply } },
		pickedRows: { paths: [], anchor: null },
	}) as unknown as {
		dropTarget(el: HTMLElement, target: { kind: "project" | "area"; path: string }): void;
		dragRow(el: HTMLElement, path: string): void;
		pickedRows: { paths: string[]; anchor: string | null };
	};
	return { view, apply, files };
}

function dropOnto(draggable: Draggable, target: { kind: "project" | "area"; path: string }) {
	const { view, apply } = setup(draggable);
	const el = document.createElement("div");
	view.dropTarget(el, target);
	const over = new window.Event("dragover", { cancelable: true });
	el.dispatchEvent(over);
	const drop = new window.Event("drop", { cancelable: true });
	el.dispatchEvent(drop);
	return { accepted: over.defaultPrevented, highlighted: el.classList.contains("is-being-dragged-over"), apply, dropped: drop.defaultPrevented, el };
}

const files = (...paths: string[]) => ({ type: "files", files: paths.map((path) => ({ path })) });
const project = { kind: "project", path: "Ta Da/projects/Home.md" } as const;
const area = { kind: "area", path: "Ta Da/areas/Personal.md" } as const;

describe("a drop onto a project or area row", () => {
	it("accepts tasks onto a project and onto an area, highlighting the row until the drop", () => {
		for (const target of [project, area]) {
			const result = dropOnto(files("Ta Da/tasks/A.md", "Ta Da/tasks/B.md"), target);
			expect(result.accepted).toBe(true);
			expect(result.dropped).toBe(true);
			expect(result.highlighted).toBe(false);
		}
	});

	it("accepts one dragged file as the file explorer gives it", () => {
		expect(dropOnto({ type: "file", file: { path: "Ta Da/tasks/A.md" } }, project).accepted).toBe(true);
	});

	it("accepts projects onto an area only", () => {
		expect(dropOnto(files("Ta Da/projects/Home.md", "Ta Da/projects/Work.md"), area).accepted).toBe(true);
		expect(dropOnto(files("Ta Da/projects/Work.md"), project).accepted).toBe(false);
	});

	it("refuses a mixed set, a note and nothing dragged", () => {
		expect(dropOnto(files("Ta Da/tasks/A.md", "Ta Da/projects/Work.md"), area).accepted).toBe(false);
		expect(dropOnto(files("Notes/Plain.md"), project).accepted).toBe(false);
		expect(dropOnto(null, project).accepted).toBe(false);
		expect(dropOnto(files("Ta Da/tasks/A.md", "Ta Da/projects/Work.md"), area).apply).not.toHaveBeenCalled();
	});

	it("writes each file's parent on drop", () => {
		const { apply } = dropOnto(files("Ta Da/tasks/A.md", "Ta Da/tasks/B.md"), project);
		expect(apply.mock.calls.map(([file]) => (file as unknown as { path: string }).path)).toEqual(["Ta Da/tasks/A.md", "Ta Da/tasks/B.md"]);
		const edit = apply.mock.calls[0]?.[1] as unknown as (text: string) => string;
		expect(edit("---\ntype: task\n---\n")).toContain('project: "[[Home]]"');
	});

	it("is not a drop target without a dragManager", () => {
		const { view } = setup(null, null);
		const el = document.createElement("div");
		view.dropTarget(el, project);
		const over = new window.Event("dragover", { cancelable: true });
		el.dispatchEvent(over);
		expect(over.defaultPrevented).toBe(false);
	});
});

describe("dragging a row", () => {
	function drag(path: string, picked: string[]) {
		const dragFile = vi.fn(() => "one");
		const dragFiles = vi.fn(() => "many");
		const onDragStart = vi.fn();
		const { view, files: all } = setup(null, { dragFile, dragFiles, onDragStart });
		view.pickedRows = { paths: picked, anchor: null };
		const el = document.createElement("div");
		view.dragRow(el, path);
		el.dispatchEvent(new window.Event("dragstart"));
		return { el, dragFile, dragFiles, onDragStart, all };
	}

	it("drags the row's file through Obsidian's drag manager", () => {
		const { el, dragFile, dragFiles, onDragStart, all } = drag("Ta Da/tasks/A.md", []);
		expect(el.getAttribute("draggable")).toBe("true");
		expect(dragFile).toHaveBeenCalledWith(expect.anything(), all.get("Ta Da/tasks/A.md"));
		expect(dragFiles).not.toHaveBeenCalled();
		expect(onDragStart).toHaveBeenCalledWith(expect.anything(), "one");
	});

	it("drags all the picks from a picked row, and just itself from an unpicked one", () => {
		const picked = ["Ta Da/tasks/A.md", "Ta Da/tasks/B.md"];
		const several = drag("Ta Da/tasks/B.md", picked);
		expect(several.dragFiles).toHaveBeenCalledWith(expect.anything(), picked.map((path) => several.all.get(path)));
		expect(several.onDragStart).toHaveBeenCalledWith(expect.anything(), "many");
		const alone = drag("Ta Da/projects/Home.md", picked);
		expect(alone.dragFiles).not.toHaveBeenCalled();
		expect(alone.dragFile).toHaveBeenCalled();
	});

	it("leaves the row undraggable without a dragManager", () => {
		const { view } = setup(null, null);
		const el = document.createElement("div");
		view.dragRow(el, "Ta Da/tasks/A.md");
		expect(el.getAttribute("draggable")).toBeNull();
	});
});
