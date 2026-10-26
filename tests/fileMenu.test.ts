import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { makeItem } from "./support";

const shown: unknown[] = [];
vi.mock("obsidian", () => ({
	TFile: class {},
	Notice: class {},
	ItemView: class {},
	Keymap: {},
	Platform: {},
	Menu: class {
		showAtMouseEvent(event: unknown): void {
			shown.push(event);
		}
	},
	debounce: (fn: unknown) => fn,
	setIcon: () => undefined,
}));

const { TFile } = await import("obsidian");
const { registerFileMenu } = await import("../src/ui/fileMenu");
const { NavigatorView } = await import("../src/ui/navigator/NavigatorView");

function file(path: string): InstanceType<typeof TFile> {
	return Object.assign(new (TFile as unknown as new () => InstanceType<typeof TFile>)(), { path });
}

interface Entry {
	title: string;
	icon?: string;
	section?: string;
	checked?: boolean;
	click: () => void;
	sub: Entry[];
}

/** A menu that records what is added to it, and the submenus inside. */
function recorder(): { menu: { addItem: (add: (item: unknown) => void) => unknown }; entries: Entry[] } {
	const make = (entries: Entry[]) => ({
		addSeparator: () => void entries.push({ title: "|", click: () => undefined, sub: [] }),
		addItem: (add: (item: unknown) => void) => {
			const entry: Entry = { title: "", click: () => undefined, sub: [] };
			const item = {
				setTitle: (title: string) => ((entry.title = title), item),
				setIcon: (icon: string) => ((entry.icon = icon), item),
				setSection: (section: string) => ((entry.section = section), item),
				setChecked: (checked: boolean) => ((entry.checked = checked), item),
				onClick: (click: () => void) => ((entry.click = click), item),
				setSubmenu: () => make(entry.sub),
			};
			add(item);
			entries.push(entry);
			return undefined;
		},
	});
	const entries: Entry[] = [];
	return { menu: make(entries), entries };
}

function setup() {
	const index = new VaultIndex([
		makeItem("Ta Da/tasks/Trip.md", "type: task\nstatus: Doing"),
		makeItem("Ta Da/projects/Home.md", "type: project\nstatus: Ongoing"),
		makeItem("Notes/Plain.md", ""),
	]);
	let handler: (menu: unknown, file: unknown) => void = () => undefined;
	const names: string[] = [];
	const plugin = {
		app: { workspace: { on: (name: string, callback: typeof handler) => void (names.push(name), (handler = callback)) } },
		registerEvent: () => undefined,
	};
	const set = vi.fn();
	const convert = vi.fn();
	registerFileMenu(plugin as never, index, { set } as never, convert);
	return { open: (path: string) => {
		const { menu, entries } = recorder();
		handler(menu, file(path));
		return entries;
	}, set, convert, names, handler: () => handler };
}

describe("the file menu's Status…", () => {
	it("registers on file-menu", () => {
		expect(setup().names).toEqual(["file-menu"]);
	});

	it("is added to a task with every status but Ongoing, the current one checked", () => {
		const { open } = setup();
		const [status, ...rest] = open("Ta Da/tasks/Trip.md");
		expect(rest.map((entry) => entry.title)).toEqual(["Convert to project…"]);
		expect(status?.title).toBe("Status…");
		expect(status?.section).toBe("ta-da");
		expect(status?.sub.map((entry) => entry.title)).toEqual(["Not started", "Doing", "Blocked", "|", "Done", "Cancelled"]);
		expect(status?.sub.filter((entry) => entry.checked).map((entry) => entry.title)).toEqual(["Doing"]);
	});

	it("offers Ongoing on a project", () => {
		const { open } = setup();
		const sub = open("Ta Da/projects/Home.md")[0]?.sub ?? [];
		expect(sub.map((entry) => entry.title)).toEqual(["Not started", "Doing", "Ongoing", "Blocked", "|", "Done", "Cancelled"]);
		expect(sub.filter((entry) => entry.checked).map((entry) => entry.title)).toEqual(["Ongoing"]);
	});

	it("adds Convert to project… after Status… in the same section on a task, and opens it for the file", () => {
		const { open, convert } = setup();
		const [status, convertItem] = open("Ta Da/tasks/Trip.md");
		expect(convertItem?.section).toBe(status?.section);
		convertItem?.click();
		expect(convert).toHaveBeenCalledWith(expect.objectContaining({ path: "Ta Da/tasks/Trip.md" }));
	});

	it("does not offer Convert to project… on a project", () => {
		expect(setup().open("Ta Da/projects/Home.md").map((entry) => entry.title)).toEqual(["Status…"]);
	});

	it("is not added for other files or for folders", () => {
		const { open, handler } = setup();
		expect(open("Notes/Plain.md")).toEqual([]);
		expect(open("Missing.md")).toEqual([]);
		const { menu, entries } = recorder();
		handler()(menu, {});
		expect(entries).toEqual([]);
	});

	it("sets the chosen status on the file", () => {
		const { open, set } = setup();
		open("Ta Da/tasks/Trip.md")[0]?.sub.find((entry) => entry.title === "Done")?.click();
		expect(set).toHaveBeenCalledWith(expect.objectContaining({ path: "Ta Da/tasks/Trip.md" }), "Done");
	});
});

describe("a row's right-click", () => {
	it("opens Obsidian's file menu for the row's file", () => {
		const target = file("Ta Da/tasks/Trip.md");
		const trigger = vi.fn();
		const leaf = {};
		const view = Object.assign(Object.create(NavigatorView.prototype), {
			app: { vault: { getFileByPath: (path: string) => (path === target.path ? target : null) }, workspace: { trigger } },
			leaf,
		});
		const event = { preventDefault: vi.fn() };
		(view as unknown as { fileMenu: (path: string, event: unknown) => void }).fileMenu(target.path, event);
		expect(trigger).toHaveBeenCalledWith("file-menu", expect.anything(), target, "ta-da", leaf);
		expect(shown).toEqual([event]);
		expect(event.preventDefault).toHaveBeenCalled();
	});
});
