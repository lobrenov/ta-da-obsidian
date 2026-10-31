import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { makeItem } from "./support";

const shown: unknown[] = [];
vi.mock("obsidian", () => ({
	TFile: class {},
	Notice: class {},
	ItemView: class {},
	Keymap: { isModifier: (event: { metaKey?: boolean }) => event.metaKey === true },
	Platform: {},
	Modal: class {},
	SuggestModal: class {},
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
		makeItem("Ta Da/tasks/Water.md", "type: task\nstatus: Doing\ndueDate: 2026-10-05\nrepeat: every week on Mon"),
		makeItem("Ta Da/tasks/Last.md", "type: task\nstatus: Doing\ndueDate: 2026-10-05\nrepeat: every week until 2026-10-06"),
		makeItem("Notes/Plain.md", ""),
	]);
	const handlers = new Map<string, (menu: unknown, file: unknown) => void>();
	const names: string[] = [];
	const plugin = {
		app: { workspace: { on: (name: string, callback: (menu: unknown, file: unknown) => void) => void (names.push(name), handlers.set(name, callback)) } },
		registerEvent: () => undefined,
	};
	const set = vi.fn();
	const setAll = vi.fn();
	const convert = vi.fn();
	registerFileMenu(plugin as never, index, { set, setAll } as never, convert, { apply: vi.fn() } as never);
	const handler = (): ((menu: unknown, file: unknown) => void) => handlers.get("file-menu") ?? (() => undefined);
	return { open: (path: string) => {
		const { menu, entries } = recorder();
		handlers.get("file-menu")?.(menu, file(path));
		return entries;
	}, openAll: (paths: string[]) => {
		const { menu, entries } = recorder();
		handlers.get("files-menu")?.(menu, paths.map(file));
		return entries;
	}, set, setAll, convert, names, handler };
}

describe("the file menu's Status…", () => {
	it("registers on file-menu", () => {
		expect(setup().names).toEqual(["file-menu", "files-menu"]);
	});

	it("is added to a task with every status but Ongoing, the current one checked", () => {
		const { open } = setup();
		const [status, ...rest] = open("Ta Da/tasks/Trip.md");
		expect(rest.map((entry) => entry.title)).toEqual(["Move…", "Schedule…", "Set deadline…", "Tags…", "Convert to project…"]);
		expect(status?.title).toBe("Status…");
		expect(status?.section).toBe("ta-da");
		expect(status?.sub.map((entry) => entry.title)).toEqual(["Not started", "Doing", "Blocked", "|", "Done", "Cancelled"]);
		expect(status?.sub.filter((entry) => entry.checked).map((entry) => entry.title)).toEqual(["Doing"]);
	});

	it("words a repeating task's items: Skip this time, and where Done and Skip move it", () => {
		const { open } = setup();
		const titles = (path: string) => open(path)[0]?.sub.map((entry) => entry.title);
		expect(titles("Ta Da/tasks/Water.md")).toEqual([
			"Not started",
			"Doing",
			"Blocked",
			"|",
			expect.stringMatching(/^Done · moves to \w{3} \d+ \w{3}$/),
			expect.stringMatching(/^Skip this time · moves to /),
		]);
		expect(titles("Ta Da/tasks/Last.md")?.slice(4)).toEqual(["Done · ends the repeat", "Skip this time · ends the repeat"]);
	});

	it("leaves a repeating task's own status unannotated", () => {
		const { open } = setup();
		expect(open("Ta Da/tasks/Water.md")[0]?.sub.map((entry) => entry.title)[1]).toBe("Doing");
	});

	it("offers Ongoing on a project", () => {
		const { open } = setup();
		const sub = open("Ta Da/projects/Home.md")[0]?.sub ?? [];
		expect(sub.map((entry) => entry.title)).toEqual(["Not started", "Doing", "Ongoing", "Blocked", "|", "Done", "Cancelled"]);
		expect(sub.filter((entry) => entry.checked).map((entry) => entry.title)).toEqual(["Ongoing"]);
	});

	it("adds Convert to project… after Status… in the same section on a task, and opens it for the file", () => {
		const { open, convert } = setup();
		const [status, , , , , convertItem] = open("Ta Da/tasks/Trip.md");
		expect(convertItem?.section).toBe(status?.section);
		convertItem?.click();
		expect(convert).toHaveBeenCalledWith(expect.objectContaining({ path: "Ta Da/tasks/Trip.md" }));
	});

	it("does not offer Convert to project… on a project", () => {
		expect(setup().open("Ta Da/projects/Home.md").map((entry) => entry.title)).toEqual(["Status…", "Move…", "Schedule…", "Set deadline…", "Tags…"]);
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
		const { open, setAll } = setup();
		open("Ta Da/tasks/Trip.md")[0]?.sub.find((entry) => entry.title === "Done")?.click();
		expect(setAll).toHaveBeenCalledWith([expect.objectContaining({ path: "Ta Da/tasks/Trip.md" })], "Done");
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
			pickedRows: { paths: [], anchor: null },
		});
		const event = { preventDefault: vi.fn() };
		(view as unknown as { fileMenu: (path: string, event: unknown) => void }).fileMenu(target.path, event);
		expect(trigger).toHaveBeenCalledWith("file-menu", expect.anything(), target, "ta-da", leaf);
		expect(shown).toEqual([event]);
		expect(event.preventDefault).toHaveBeenCalled();
	});
});

describe("the files menu", () => {
	const titles = (paths: string[]) => setup().openAll(paths).map((entry) => entry.title);
	const all = ["Status…", "Move…", "Schedule…", "Set deadline…"];

	it("offers every item for tasks only and for projects only", () => {
		expect(titles(["Ta Da/tasks/Trip.md", "Ta Da/tasks/Water.md"])).toEqual(all);
		expect(titles(["Ta Da/projects/Home.md"])).toEqual(all);
	});

	it("leaves Move… out of a mix of tasks and projects", () => {
		expect(titles(["Ta Da/tasks/Trip.md", "Ta Da/projects/Home.md"])).toEqual(["Status…", "Schedule…", "Set deadline…"]);
	});

	it("offers nothing when a file in the set isn't a Ta Da task or project", () => {
		expect(titles(["Ta Da/tasks/Trip.md", "Notes/Plain.md"])).toEqual([]);
		expect(titles([])).toEqual([]);
	});

	it("sets the chosen status on every file in one go", () => {
		const { openAll, setAll } = setup();
		openAll(["Ta Da/tasks/Trip.md", "Ta Da/tasks/Water.md"])[0]?.sub.find((entry) => entry.title.startsWith("Done"))?.click();
		expect(setAll.mock.calls[0]?.[0].map((target: { path: string }) => target.path)).toEqual(["Ta Da/tasks/Trip.md", "Ta Da/tasks/Water.md"]);
		expect(setAll.mock.calls[0]?.[1]).toBe("Done");
	});
});

describe("a row's right-click with picks", () => {
	function view(picked: string[]) {
		const files = new Map(["a", "b", "c"].map((name) => [name, file(name)]));
		const trigger = vi.fn();
		const leaf = {};
		const instance = Object.assign(Object.create(NavigatorView.prototype), {
			app: { vault: { getFileByPath: (path: string) => files.get(path) ?? null }, workspace: { trigger } },
			leaf,
			pickedRows: { paths: picked, anchor: picked[0] ?? null },
			highlight: () => undefined,
		});
		const event = { preventDefault: vi.fn() };
		const open = (path: string) => (instance as unknown as { fileMenu: (path: string, event: unknown) => void }).fileMenu(path, event);
		return { files, trigger, leaf, instance, open };
	}

	it("opens the files menu for the picks when the row is one of several", () => {
		const { files, trigger, leaf, open } = view(["a", "c"]);
		open("c");
		expect(trigger).toHaveBeenCalledWith("files-menu", expect.anything(), [files.get("a"), files.get("c")], "ta-da", leaf);
	});

	it("clears the picks and opens the file menu on a row that isn't picked", () => {
		const { files, trigger, instance, open } = view(["a", "c"]);
		open("b");
		expect(trigger).toHaveBeenCalledWith("file-menu", expect.anything(), files.get("b"), "ta-da", expect.anything());
		expect(instance.picks).toEqual([]);
	});
});

describe("picking a row", () => {
	function view(pickable: string[], selected: string | null) {
		const instance = Object.assign(Object.create(NavigatorView.prototype), {
			pickable,
			selected,
			pickedRows: { paths: [], anchor: null },
			highlight: () => undefined,
		});
		const click = (path: string, init: { metaKey?: boolean; shiftKey?: boolean }) =>
			(instance as unknown as { pickRow: (path: string, event: unknown) => boolean }).pickRow(path, init);
		return { instance, click };
	}

	it("ranges over the task and project rows only, from the anchor", () => {
		const { instance, click } = view(["t1", "t2", "t3"], null);
		click("t1", { metaKey: true });
		click("t3", { shiftKey: true });
		expect(instance.picks).toEqual(["t1", "t2", "t3"]);
	});

	it("ignores a selected file that isn't a pickable row, and starts from the active row when it is", () => {
		const note = view(["t1", "t2"], "note");
		note.click("t2", { metaKey: true });
		expect(note.instance.picks).toEqual(["t2"]);
		const active = view(["t1", "t2"], "t1");
		active.click("t2", { metaKey: true });
		expect(active.instance.picks).toEqual(["t1", "t2"]);
	});
});
