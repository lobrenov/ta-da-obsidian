import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDate } from "../src/core/model/localDate";

vi.mock("obsidian", () => ({ TFile: class {}, TFolder: class {}, Notice: class {} }));
vi.stubGlobal("window", globalThis);

const { TFile } = await import("obsidian");
const { TaDaIndex } = await import("../src/TaDaIndex");
const { applyStatus } = await import("../src/ui/navigator/actions");

type Handler = (...args: never[]) => void;

/** A plugin whose layout is ready and whose vault has `files` (each reading as a Doing task), keeping the handlers it's given. */
function makePlugin(files: object[] = [], read: (file: { path: string }) => Promise<string> = async () => task("Doing")): { plugin: never; handlers: Record<string, Handler>; unload: () => void } {
	const handlers: Record<string, Handler> = {};
	const cleanups: (() => void)[] = [];
	const on = (name: string, handler: Handler): object => {
		handlers[name] = handler;
		return {};
	};
	const plugin = {
		app: {
			workspace: { onLayoutReady: (callback: () => void) => callback(), on },
			vault: { on, getFiles: () => files, cachedRead: read },
			metadataCache: { on },
		},
		register: (cleanup: () => void) => cleanups.push(cleanup),
		registerEvent: () => undefined,
	};
	return { plugin: plugin as never, handlers, unload: () => cleanups.forEach((cleanup) => cleanup()) };
}

const file = (path: string): object => Object.assign(new TFile(), { path, extension: "md" });
const task = (status: string): string => `---\ntype: task\nstatus: ${status}\n---\n`;

describe("TaDaIndex.built", () => {
	const withFiles = (plugin: never, count: number): void => {
		(plugin as { app: { vault: { getFiles: () => object[] } } }).app.vault.getFiles = () => Array.from({ length: count }, (_, at) => file(`Ta Da/tasks/${at}.md`));
	};

	it("is true once every file is read", async () => {
		const { plugin } = makePlugin();
		withFiles(plugin, 3);
		const index = new TaDaIndex(plugin);
		index.start();
		await index.ready;
		expect(index.built).toBe(true);
	});

	it("stays false when the plugin unloads first, though ready resolves", async () => {
		const { plugin, unload } = makePlugin();
		withFiles(plugin, 200);
		const index = new TaDaIndex(plugin);
		index.start();
		unload();
		await index.ready;
		expect(index.built).toBe(false);
	});
});

describe("TaDaIndex.onChange", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("calls a listener once after the last of a run of changes", async () => {
		const { plugin, handlers } = makePlugin();
		const index = new TaDaIndex(plugin);
		const listener = vi.fn();
		index.onChange(listener);
		index.start();
		await vi.advanceTimersByTimeAsync(500);
		listener.mockClear();

		for (const name of ["A", "B", "C"]) (handlers["changed"] as unknown as (file: object, text: string) => void)(file(`Ta Da/tasks/${name}.md`), task("Doing"));
		await vi.advanceTimersByTimeAsync(100);
		expect(listener).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(100);
		expect(listener).toHaveBeenCalledTimes(1);
		expect([...index.index.items.keys()]).toEqual(["Ta Da/tasks/A.md", "Ta Da/tasks/B.md", "Ta Da/tasks/C.md"]);
	});

	it("calls it for a deleted file and a renamed one, and not after it's removed", async () => {
		const { plugin, handlers } = makePlugin();
		const index = new TaDaIndex(plugin);
		const listener = vi.fn();
		const stop = index.onChange(listener);
		index.start();
		await vi.advanceTimersByTimeAsync(500);
		(handlers["changed"] as unknown as (file: object, text: string) => void)(file("Ta Da/tasks/A.md"), task("Doing"));
		await vi.advanceTimersByTimeAsync(200);
		listener.mockClear();

		(handlers["delete"] as unknown as (file: object) => void)(file("Ta Da/tasks/A.md"));
		await vi.advanceTimersByTimeAsync(200);
		expect(listener).toHaveBeenCalledTimes(1);
		expect(index.index.items.size).toBe(0);

		stop();
		(handlers["delete"] as unknown as (file: object) => void)(file("Ta Da/tasks/B.md"));
		await vi.advanceTimersByTimeAsync(200);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("stops calling listeners when the plugin unloads", async () => {
		const { plugin, handlers, unload } = makePlugin();
		const index = new TaDaIndex(plugin);
		const listener = vi.fn();
		index.onChange(listener);
		index.start();
		await vi.advanceTimersByTimeAsync(500);
		listener.mockClear();
		(handlers["changed"] as unknown as (file: object, text: string) => void)(file("Ta Da/tasks/A.md"), task("Doing"));
		unload();
		await vi.advanceTimersByTimeAsync(500);
		expect(listener).not.toHaveBeenCalled();
	});
});

describe("applyStatus", () => {
	const today = LocalDate.parse("2026-10-02") as LocalDate;

	function edit(status: Parameters<typeof applyStatus>[2]): (text: string) => string | null {
		let captured: ((text: string) => string | null) | undefined;
		const writer = {
			apply: (_file: unknown, change: (text: string) => string | null) => {
				captured = change;
				return Promise.resolve(true);
			},
		};
		applyStatus(writer as never, { path: "Ta Da/tasks/A.md" } as never, status, today);
		if (!captured) throw new Error("No edit");
		return captured;
	}

	it("sets the status and completedDate on the text it's given", () => {
		expect(edit("Done")(task("Doing"))).toBe("---\ntype: task\nstatus: Done\ncompletedDate: 2026-10-02\n---\n");
		expect(edit("Not Started")("---\ntype: task\nstatus: Done\ncompletedDate: 2026-10-01\n---\n")).toBe("---\ntype: task\nstatus: Not Started\ncompletedDate:\n---\n");
	});

	it("leaves the file alone when its own text already has the status", () => {
		expect(edit("Done")(task("Done"))).toBeNull();
	});
});

describe("TaDaIndex change notifications", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());
	const saved = (handlers: Record<string, Handler>, path: string, text: string): void =>
		(handlers["changed"] as unknown as (file: object, text: string) => void)(file(path), text);

	it("calls no listener when a save leaves the item as indexed, or a file that isn't an item", async () => {
		const { plugin, handlers } = makePlugin();
		const index = new TaDaIndex(plugin);
		const listener = vi.fn();
		index.onChange(listener);
		index.start();
		await vi.advanceTimersByTimeAsync(500);
		saved(handlers, "Ta Da/tasks/A.md", task("Doing"));
		await vi.advanceTimersByTimeAsync(500);
		listener.mockClear();

		saved(handlers, "Ta Da/tasks/A.md", task("Doing"));
		saved(handlers, "Ta Da/Elsewhere.txt.md", "not a Ta Da file");
		(handlers["quick-preview"] as unknown as (file: object, text: string) => void)(file("Ta Da/tasks/A.md"), task("Doing"));
		await vi.advanceTimersByTimeAsync(1000);
		expect(listener).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(2500);
		saved(handlers, "Ta Da/tasks/A.md", task("Done"));
		await vi.advanceTimersByTimeAsync(500);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("calls a listener when an item appears or goes, and for a deleted non-item not at all", async () => {
		const { plugin, handlers } = makePlugin();
		const index = new TaDaIndex(plugin);
		const listener = vi.fn();
		const deleted = vi.fn();
		index.onChange(listener);
		index.onDeleted(deleted);
		index.start();
		await vi.advanceTimersByTimeAsync(500);
		listener.mockClear();
		(handlers["delete"] as unknown as (file: object) => void)(file("Ta Da/tasks/Never.md"));
		await vi.advanceTimersByTimeAsync(500);
		expect(listener).not.toHaveBeenCalled();
		expect(deleted).not.toHaveBeenCalled();

		saved(handlers, "Ta Da/tasks/A.md", task("Doing"));
		await vi.advanceTimersByTimeAsync(500);
		expect(listener).toHaveBeenCalledTimes(1);
		(handlers["delete"] as unknown as (file: object) => void)(file("Ta Da/tasks/A.md"));
		await vi.advanceTimersByTimeAsync(500);
		expect(listener).toHaveBeenCalledTimes(2);
		expect(deleted).toHaveBeenCalledTimes(1);
	});

	it("takes the file's text once the autosave window has passed since the editor's", async () => {
		const { plugin, handlers } = makePlugin();
		const index = new TaDaIndex(plugin);
		index.start();
		await vi.advanceTimersByTimeAsync(500);
		(handlers["quick-preview"] as unknown as (file: object, text: string) => void)(file("Ta Da/tasks/A.md"), task("Doing"));
		await vi.advanceTimersByTimeAsync(2500);
		expect((index as unknown as { recentEdits: Map<string, unknown> }).recentEdits.size).toBe(0);
		saved(handlers, "Ta Da/tasks/A.md", task("Done"));
		expect(index.index.get("Ta Da/tasks/A.md")?.properties.status).toBe("Done");
	});

	it("builds in batches without calling listeners until it ends, then calls them once", async () => {
		const files = Array.from({ length: 200 }, (_, at) => file(`Ta Da/tasks/T${at}.md`));
		let release: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const { plugin } = makePlugin(files, async (read) => {
			if (read.path === "Ta Da/tasks/T199.md") await gate;
			return task("Doing");
		});
		const index = new TaDaIndex(plugin);
		const listener = vi.fn();
		index.onChange(listener);
		index.start();
		await vi.advanceTimersByTimeAsync(2000);
		expect(index.built).toBe(false);
		expect(index.index.items.size).toBeGreaterThanOrEqual(192);
		expect(listener).not.toHaveBeenCalled();
		release();
		await vi.advanceTimersByTimeAsync(1000);
		expect(index.built).toBe(true);
		expect(index.index.items.size).toBe(200);
		expect(listener).toHaveBeenCalledTimes(1);
	});
});
