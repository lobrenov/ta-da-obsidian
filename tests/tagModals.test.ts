import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { readTag, type Tag } from "../src/core/model/tag";
import { makeItem } from "./support";

// jsdom's window by hand: the jsdom environment can't resolve a mocked "obsidian".
const { dom } = await vi.hoisted(async () => ({ dom: new (await import("jsdom")).JSDOM("") }));
const { document, window } = dom.window;
type Entry = { title: string; icon: string | null; warning: boolean; click: () => void };
const menus: { entries: (Entry | "separator")[]; shown: boolean }[] = [];
const modals: { titleText: string; contentEl: HTMLElement; closed: boolean }[] = [];
vi.mock("obsidian", () => ({
	ItemView: class {},
	Keymap: {},
	Menu: class {
		entries: (Entry | "separator")[] = [];
		shown = false;
		constructor() {
			menus.push(this);
		}
		addItem(build: (item: unknown) => void): this {
			const entry: Entry = { title: "", icon: null, warning: false, click: () => undefined };
			const item = {
				setTitle: (title: string) => ((entry.title = title), item),
				setIcon: (icon: string) => ((entry.icon = icon), item),
				setWarning: (warning: boolean) => ((entry.warning = warning), item),
				onClick: (click: () => void) => ((entry.click = click), item),
			};
			build(item);
			this.entries.push(entry);
			return this;
		}
		addSeparator(): this {
			this.entries.push("separator");
			return this;
		}
		showAtMouseEvent(): void {
			this.shown = true;
		}
	},
	Modal: class {
		titleText = "";
		titleEl = { setText: (text: string) => void (this.titleText = text) };
		modalEl = document.createElement("div");
		contentEl = Object.assign(document.createElement("div"), { win: { setTimeout: (fn: () => void) => fn() }, empty() {} });
		closed = false;
		constructor(public app: unknown) {}
		open(): void {
			(this as unknown as { onOpen(): void }).onOpen();
			modals.push(this);
		}
		close(): void {
			this.closed = true;
		}
	},
	SuggestModal: class {},
	Notice: class {},
	Platform: { isMobile: false },
	TFile: class {},
	debounce: (fn: unknown) => fn,
	setIcon: () => undefined,
}));
type Options = { cls?: string; text?: string };
const createEl = function (this: HTMLElement, tag: string, options: Options = {}) {
	const el = this.ownerDocument.createElement(tag);
	if (options.cls) el.className = options.cls;
	if (options.text) el.textContent = options.text;
	this.appendChild(el);
	return el;
};
Object.assign(window.HTMLElement.prototype, {
	createDiv(this: HTMLElement, options?: Options) {
		return createEl.call(this, "div", options);
	},
	createSpan(this: HTMLElement, options?: Options) {
		return createEl.call(this, "span", options);
	},
	addClass(this: HTMLElement, name: string) {
		this.classList.add(name);
	},
});
const { NavigatorView } = await import("../src/ui/navigator/NavigatorView");
const { DeleteTagModal, RenameTagModal, renamedTag } = await import("../src/ui/TagModals");

const tag = (name: string): Tag => readTag(name) as Tag;
const click = (el: Element) => el.dispatchEvent(new window.Event("click"));
const button = (label: string) => [...modals[modals.length - 1]!.contentEl.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;
const field = () => modals[modals.length - 1]!.contentEl.querySelector("input") as HTMLInputElement;
const message = () => modals[modals.length - 1]!.contentEl.querySelector("p")?.textContent;

describe("renamedTag", () => {
	it("gives a valid name that differs, as the tag spells it", () => {
		expect(renamedTag(tag("work"), "job")?.name).toBe("job");
		expect(renamedTag(tag("work"), " job/a ")?.name).toBe("job/a");
		expect(renamedTag(tag("work"), "Work")?.name).toBe("Work");
	});

	it("refuses a path under the tag's own, allows a case-only change and a sibling", () => {
		expect(renamedTag(tag("home"), "home/garden")).toBeNull();
		expect(renamedTag(tag("Home"), "HOME/a/b")).toBeNull();
		expect(renamedTag(tag("home/garden"), "Home/Garden")?.name).toBe("Home/Garden");
		expect(renamedTag(tag("home"), "homestead")?.name).toBe("homestead");
	});

	it("gives nothing for an invalid or unchanged name", () => {
		for (const text of ["", "a b", "123", "work", "a,b"]) expect(renamedTag(tag("work"), text), text).toBeNull();
	});
});

describe("RenameTagModal", () => {
	const open = (files: number, submit = vi.fn()) => {
		modals.length = 0;
		new RenameTagModal({} as never, tag("home/garden"), files, submit).open();
		return submit;
	};

	it("shows the title, the full path prefilled, the count and Rename disabled until the name changes", () => {
		open(3);
		expect(modals[0]?.titleText).toBe("Rename “home/garden”");
		expect(field().value).toBe("home/garden");
		expect(message()).toBe("Changes 3 files, including child tags. This can’t be undone.");
		expect(button("Rename").disabled).toBe(true);
		field().value = "home/yard";
		field().dispatchEvent(new window.Event("input"));
		expect(button("Rename").disabled).toBe(false);
		field().value = "home yard";
		field().dispatchEvent(new window.Event("input"));
		expect(button("Rename").disabled).toBe(true);
	});

	it("says 1 file", () => {
		open(1);
		expect(message()).toBe("Changes 1 file, including child tags. This can’t be undone.");
	});

	it("submits the new tag on Rename or Enter, and not an invalid name", () => {
		const submit = open(2);
		field().value = "a b";
		field().dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
		expect(submit).not.toHaveBeenCalled();
		field().value = "yard";
		field().dispatchEvent(new window.Event("input"));
		field().dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
		expect(submit.mock.calls.map(([to]) => (to as Tag).name)).toEqual(["yard"]);
		expect(modals[0]?.closed).toBe(true);
		click(button("Rename"));
		expect(submit).toHaveBeenCalledTimes(2);
	});

	it("ignores Enter while composing", () => {
		const submit = open(2);
		field().value = "yard";
		field().dispatchEvent(new window.Event("input"));
		field().dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", isComposing: true }));
		expect(submit).not.toHaveBeenCalled();
		expect(modals[0]?.closed).toBe(false);
	});

	it("Cancel closes without submitting", () => {
		const submit = open(2);
		click(button("Cancel"));
		expect(modals[0]?.closed).toBe(true);
		expect(submit).not.toHaveBeenCalled();
	});
});

describe("DeleteTagModal", () => {
	it("asks, naming the files, and deletes on Delete only", () => {
		modals.length = 0;
		const confirm = vi.fn();
		new DeleteTagModal({} as never, tag("work"), 1, confirm).open();
		expect(modals[0]?.titleText).toBe("Delete “work”?");
		expect(message()).toBe("Removes it and its child tags from 1 file. This can’t be undone.");
		expect(button("Delete").className).toBe("mod-warning");
		click(button("Cancel"));
		expect(confirm).not.toHaveBeenCalled();
		click(button("Delete"));
		expect(confirm).toHaveBeenCalledOnce();
	});
});

describe("a right-click on a tag row", () => {
	const index = new VaultIndex([makeItem("Ta Da/tasks/A.md", "type: task\ntags: [Work/x]"), makeItem("Ta Da/tasks/B.md", "type: task\ntags: [work]")]);

	function row(domain: object) {
		const view = Object.assign(Object.create(NavigatorView.prototype) as object, {
			app: { dragManager: undefined },
			deps: { taDaIndex: { index } },
		}) as unknown as { navRow(parent: HTMLElement, item: object, active: boolean, icon: boolean): HTMLElement };
		const item = { id: "tag:work", domain, label: "work", icon: { type: "icon", name: "tag", tint: "accent" }, count: 2, depth: 0, gap: false, strong: false, expanded: null };
		const outer = view.navRow(document.createElement("div"), item, false, false);
		const event = new window.Event("contextmenu", { cancelable: true });
		(outer.firstElementChild as HTMLElement).dispatchEvent(event);
		return event;
	}

	it("opens a menu: Rename tag… (pencil), a separator, Delete tag… (trash, warning)", () => {
		menus.length = 0;
		modals.length = 0;
		const event = row({ kind: "tag", path: "work" });
		expect(event.defaultPrevented).toBe(true);
		expect(menus[0]?.shown).toBe(true);
		expect(menus[0]?.entries).toEqual([
			{ title: "Rename tag…", icon: "pencil", warning: false, click: expect.any(Function) },
			"separator",
			{ title: "Delete tag…", icon: "trash", warning: true, click: expect.any(Function) },
		]);
	});

	it("opens the rename and delete modals counting the tag's carriers and its children's", () => {
		menus.length = 0;
		modals.length = 0;
		row({ kind: "tag", path: "work" });
		const [rename, , remove] = menus[0]!.entries as Entry[];
		rename!.click();
		expect(modals[0]?.titleText).toBe("Rename “work”");
		expect(message()).toBe("Changes 2 files, including child tags. This can’t be undone.");
		remove!.click();
		expect(modals[1]?.titleText).toBe("Delete “work”?");
		expect(message()).toBe("Removes it and its child tags from 2 files. This can’t be undone.");
	});

	it("uses the tag as the row shows it: a parent no file carries keeps its child's spelling", () => {
		const spelled = new VaultIndex([makeItem("Ta Da/tasks/C.md", "type: task\ntags: [Home/Garden]")]);
		const view = Object.assign(Object.create(NavigatorView.prototype) as object, {
			app: { dragManager: undefined },
			deps: { taDaIndex: { index: spelled } },
		}) as unknown as { tagMenu(path: string, event: MouseEvent): void };
		menus.length = 0;
		modals.length = 0;
		view.tagMenu("home", new window.Event("contextmenu", { cancelable: true }) as MouseEvent);
		(menus[0]!.entries[0] as Entry).click();
		expect(modals[0]?.titleText).toBe("Rename “Home”");
		expect(field().value).toBe("Home");
	});

	it("has no menu on Untagged", () => {
		menus.length = 0;
		row({ kind: "tag", path: null });
		expect(menus).toEqual([]);
	});
});
