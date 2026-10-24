import { describe, expect, it, vi } from "vitest";
import { resolveData, SettingsStore } from "../src/settingsData";
import { readGroupings } from "../src/ui/navigator/domain";
import { maxParallelReads, readTrash } from "../src/TaDaTrash";

/** A plugin whose saves finish out of order unless the store holds them back: the first is the slowest. */
function makePlugin(saved: unknown = null): { plugin: never; writes: unknown[]; disk: () => unknown } {
	let disk: unknown = saved;
	const writes: unknown[] = [];
	let calls = 0;
	const plugin = {
		loadData: async () => structuredClone(disk),
		saveData: async (data: unknown) => {
			const delay = calls++ === 0 ? 20 : 0;
			const snapshot = structuredClone(data);
			await new Promise((resolve) => setTimeout(resolve, delay));
			writes.push(snapshot);
			disk = snapshot;
		},
	};
	return { plugin: plugin as never, writes, disk: () => disk };
}

describe("SettingsStore", () => {
	it("reads the header's and the navigator's settings from one file", async () => {
		const { plugin } = makePlugin({ hideProperties: false, navigator: { openOnStartup: true } });
		const store = new SettingsStore(plugin);
		await store.load();
		expect(store.data).toEqual({ hideProperties: false, navigator: { openOnStartup: true, collapseListPane: false } });
	});

	it("keeps the one data object, so what holds it sees a loaded or changed value", async () => {
		const { plugin } = makePlugin({ hideProperties: false });
		const store = new SettingsStore(plugin);
		const held = store.data;
		await store.load();
		expect(held.hideProperties).toBe(false);
		await store.updateNavigator({ collapseListPane: true });
		expect(held.navigator.collapseListPane).toBe(true);
	});

	it("saves all of it each time, so one section's save never drops the other's", async () => {
		const { plugin, disk } = makePlugin();
		const store = new SettingsStore(plugin);
		await store.load();
		store.data.hideProperties = false;
		const header = store.save();
		const navigator = store.updateNavigator({ openOnStartup: true });
		await Promise.all([header, navigator]);
		expect(disk()).toEqual({ hideProperties: false, navigator: { openOnStartup: true, collapseListPane: false } });
	});

	it("writes one at a time, the last write holding the latest state, even when an earlier write is slower", async () => {
		const { plugin, writes, disk } = makePlugin();
		const store = new SettingsStore(plugin);
		const first = store.updateNavigator({ openOnStartup: true });
		const second = store.updateNavigator({ collapseListPane: true });
		await Promise.all([first, second]);
		expect(writes).toHaveLength(2);
		expect(writes[1]).toEqual({ hideProperties: true, navigator: { openOnStartup: true, collapseListPane: true } });
		expect(disk()).toEqual(writes[1]);
	});

	it("keeps saving after a save fails", async () => {
		const saveData = vi.fn().mockRejectedValueOnce(new Error("disk")).mockResolvedValue(undefined);
		const store = new SettingsStore({ loadData: async () => null, saveData });
		await expect(store.save()).rejects.toThrow("disk");
		await expect(store.save()).resolves.toBeUndefined();
	});
});

describe("resolveData", () => {
	it("gives defaults for nothing saved and for a wrong type", () => {
		const defaults = { hideProperties: true, navigator: { openOnStartup: false, collapseListPane: false } };
		expect(resolveData(null)).toEqual(defaults);
		expect(resolveData({ navigator: "x" })).toEqual(defaults);
		expect(resolveData({ navigator: { openOnStartup: "yes" } })).toEqual(defaults);
	});
});

describe("readGroupings", () => {
	it("keeps a list's own choices and drops everything else", () => {
		expect(readGroupings({ today: "Status", loose: "Date", project: "Open" })).toEqual({ today: "Status", loose: "Date", project: "Open" });
		expect(readGroupings({ today: "Date", loose: "Project", project: "nope", other: "Open" })).toEqual({});
		expect(readGroupings({ today: 3 })).toEqual({});
		expect(readGroupings(null)).toEqual({});
		expect(readGroupings("Status")).toEqual({});
	});
});

describe("readTrash", () => {
	it("runs at most maxParallelReads adapter calls at once", async () => {
		let running = 0;
		let peak = 0;
		const track = async <T>(value: T): Promise<T> => {
			running++;
			peak = Math.max(peak, running);
			await new Promise((resolve) => setTimeout(resolve, 1));
			running--;
			return value;
		};
		const names = Array.from({ length: 40 }, (_, at) => `.trash/Task ${at}.md`);
		const adapter = {
			list: (folder: string) => track(folder === ".trash" ? { files: names, folders: [] } : { files: [], folders: [] }),
			read: () => track("---\ntype: task\n---\n"),
		};
		const trashed = await readTrash(adapter as never);
		expect(trashed).toHaveLength(40);
		expect(peak).toBeLessThanOrEqual(maxParallelReads);
		expect(peak).toBeGreaterThan(1);
	});
});
