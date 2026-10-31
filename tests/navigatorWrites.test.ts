import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDate } from "../src/core/model/localDate";

vi.mock("obsidian", () => ({ TFile: class {}, TFolder: class {}, Notice: class {} }));

const { TFile } = await import("obsidian");
const { TaDaIndex } = await import("../src/TaDaIndex");
const { applyStatus } = await import("../src/ui/navigator/actions");

type Handler = (...args: never[]) => void;

/** A plugin whose layout is ready and whose vault has no files, keeping the handlers it's given. */
function makePlugin(): { plugin: never; handlers: Record<string, Handler>; unload: () => void } {
	const handlers: Record<string, Handler> = {};
	const cleanups: (() => void)[] = [];
	const on = (name: string, handler: Handler): object => {
		handlers[name] = handler;
		return {};
	};
	const plugin = {
		app: {
			workspace: { onLayoutReady: (callback: () => void) => callback(), on },
			vault: { on, getFiles: () => [], cachedRead: async () => "" },
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
