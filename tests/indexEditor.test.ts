import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({ TFile: class {}, TFolder: class {} }));

const { TFile } = await import("obsidian");
const { TaDaIndex } = await import("../src/TaDaIndex");

type Handler = (file: object, text: string) => void;

function setup(): { index: InstanceType<typeof TaDaIndex>; send: (event: string, path: string, text: string) => void; unload: () => void } {
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
	const index = new TaDaIndex(plugin as never);
	index.start();
	const send = (event: string, path: string, text: string): void =>
		(handlers[event] as Handler)(Object.assign(new TFile(), { path, extension: "md" }), text);
	return { index, send, unload: () => cleanups.forEach((cleanup) => cleanup()) };
}

const path = "Ta Da/tasks/A.md";
const task = (status: string): string => `---\ntype: task\nstatus: ${status}\n---\n`;
const status = (index: InstanceType<typeof TaDaIndex>): string | undefined => index.index.get(path)?.properties.status;

describe("TaDaIndex follows the editor", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("takes the editor's text after edits pause, and only the last", async () => {
		const { index, send } = setup();
		await vi.advanceTimersByTimeAsync(500);
		send("quick-preview", path, task("Doing"));
		send("quick-preview", path, task("Blocked"));
		await vi.advanceTimersByTimeAsync(200);
		expect(status(index)).toBeUndefined();
		await vi.advanceTimersByTimeAsync(150);
		expect(status(index)).toBe("Blocked");
	});

	it("follows an undo, which sends the older text", async () => {
		const { index, send } = setup();
		await vi.advanceTimersByTimeAsync(500);
		send("quick-preview", path, task("Done"));
		await vi.advanceTimersByTimeAsync(400);
		send("quick-preview", path, task("Doing"));
		await vi.advanceTimersByTimeAsync(400);
		expect(status(index)).toBe("Doing");
	});

	it("keeps the editor's text when an older autosave arrives late, and takes the file after the window", async () => {
		const { index, send } = setup();
		await vi.advanceTimersByTimeAsync(500);
		send("quick-preview", path, task("Done"));
		await vi.advanceTimersByTimeAsync(400);
		send("changed", path, task("Doing"));
		expect(status(index)).toBe("Done");
		await vi.advanceTimersByTimeAsync(2500);
		send("changed", path, task("Blocked"));
		expect(status(index)).toBe("Blocked");
	});

	it("drops a pending edit when the file is deleted or the plugin unloads", async () => {
		const { index, send, unload } = setup();
		await vi.advanceTimersByTimeAsync(500);
		send("quick-preview", path, task("Doing"));
		send("delete", path, "");
		await vi.advanceTimersByTimeAsync(500);
		expect(status(index)).toBeUndefined();
		send("quick-preview", path, task("Doing"));
		unload();
		await vi.advanceTimersByTimeAsync(500);
		expect(status(index)).toBeUndefined();
	});
});
