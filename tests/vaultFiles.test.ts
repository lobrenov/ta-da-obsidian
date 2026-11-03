import { describe, expect, it } from "vitest";
import { vaultSettingsFiles } from "../src/vaultFiles";

/** A vault whose index holds `indexed` and whose disk also holds `unindexed`. */
function fakeVault(indexed: Record<string, string>, unindexed: Record<string, string> = {}) {
	const files = new Map(Object.entries(indexed));
	const folders = new Set<string>();
	const adapterCalls: string[] = [];
	const vault = {
		configDir: ".obsidian",
		getFileByPath: (path: string) => (files.has(path) ? { path } : null),
		getFolderByPath: (path: string) => (folders.has(path) ? { path } : null),
		read: async (file: { path: string }) => files.get(file.path) as string,
		process: async (file: { path: string }, change: (text: string) => string) => void files.set(file.path, change(files.get(file.path) as string)),
		createFolder: async (path: string) => void folders.add(path),
		create: async (path: string, text: string) => void files.set(path, text),
		adapter: {
			exists: async (path: string) => (adapterCalls.push(`exists ${path}`), path in unindexed),
			read: async (path: string) => (adapterCalls.push(`read ${path}`), unindexed[path]),
		},
	};
	return { app: { vault } as never, files, folders, adapterCalls };
}

describe("vaultSettingsFiles", () => {
	it("reads an indexed file through the vault", async () => {
		const { app, adapterCalls } = fakeVault({ "Ta Da/settings.json": "{}" });
		expect(await vaultSettingsFiles(app).read("Ta Da/settings.json")).toBe("{}");
		expect(adapterCalls).toEqual([]);
	});

	it("reads a file the index doesn't hold through the adapter", async () => {
		const { app } = fakeVault({}, { ".obsidian/daily-notes.json": '{"folder":"Daily"}' });
		const files = vaultSettingsFiles(app);
		expect(await files.read(".obsidian/daily-notes.json")).toBe('{"folder":"Daily"}');
		expect(await files.read("Ta Da/settings.json")).toBeNull();
	});

	it("changes an existing file through process", async () => {
		const { app, files } = fakeVault({ "Ta Da/settings.json": "{}" });
		await vaultSettingsFiles(app).update("Ta Da/settings.json", (text) => `${text}\n`);
		expect(files.get("Ta Da/settings.json")).toBe("{}\n");
	});

	it("creates a missing file and its folder through the vault", async () => {
		const { app, files, folders, adapterCalls } = fakeVault({});
		await vaultSettingsFiles(app).update("Ta Da/settings.json", (text) => (text === null ? "new" : "changed"));
		expect(folders).toEqual(new Set(["Ta Da"]));
		expect(files.get("Ta Da/settings.json")).toBe("new");
		expect(adapterCalls).toEqual([]);
	});
});
