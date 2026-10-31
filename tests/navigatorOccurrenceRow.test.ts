import { describe, expect, it, vi } from "vitest";

// jsdom's window by hand: the jsdom environment can't resolve a mocked "obsidian".
const { dom } = await vi.hoisted(async () => ({ dom: new (await import("jsdom")).JSDOM("") }));
const { document, window } = dom.window;
vi.mock("obsidian", () => ({
	ItemView: class {},
	Keymap: { isModEvent: () => false },
	Menu: class {},
	Modal: class {},
	SuggestModal: class {},
	Notice: class {},
	Platform: {},
	TFile: class {},
	debounce: (fn: unknown) => fn,
	setIcon: () => undefined,
}));

// Obsidian's DOM helpers, as far as the rows use them.
type Options = { cls?: string; text?: string; attr?: Record<string, string> };
Object.assign(window.HTMLElement.prototype, {
	createEl(this: HTMLElement, tag: string, options: Options = {}) {
		const el = this.ownerDocument.createElement(tag);
		if (options.cls) el.className = options.cls;
		if (options.text) el.textContent = options.text;
		for (const [name, value] of Object.entries(options.attr ?? {})) el.setAttribute(name, value);
		this.appendChild(el);
		return el;
	},
	createDiv(this: HTMLElement, options?: Options) {
		return (this as unknown as { createEl(tag: string, o?: Options): HTMLElement }).createEl("div", options);
	},
	createSpan(this: HTMLElement, options?: Options) {
		return (this as unknown as { createEl(tag: string, o?: Options): HTMLElement }).createEl("span", options);
	},
	addClass(this: HTMLElement, name: string) {
		this.classList.add(name);
	},
	removeClass(this: HTMLElement, name: string) {
		this.classList.remove(name);
	},
});

const { NavigatorView } = await import("../src/ui/navigator/NavigatorView");

describe("an occurrence row", () => {
	it("is highlighted with the task it opens", () => {
		const file = { path: "Ta Da/tasks/Water.md" };
		const view = Object.assign(Object.create(NavigatorView.prototype) as object, {
			rowEls: new Map<string, HTMLElement[]>(),
			selected: null,
			pickedRows: { paths: [], anchor: null },
			app: { vault: { getFileByPath: () => file }, workspace: { getLeaf: () => ({ openFile: () => Promise.resolve() }) } },
		}) as unknown as { renderRow(parent: HTMLElement, row: unknown): void };
		const parent = document.createElement("div");
		const row = { type: "occurrence", id: "r", path: null, open: file.path, title: "Water", place: null, estimated: false, deadline: false, tooltip: "", label: "Water, repeat" };
		view.renderRow(parent, row);
		const el = parent.querySelector(".is-occurrence") as HTMLElement;
		expect(el.classList.contains("is-selected")).toBe(false);
		el.dispatchEvent(new window.MouseEvent("click"));
		expect(el.classList.contains("is-selected")).toBe(true);
	});
});
