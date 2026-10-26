import type { App, TFile, Vault } from "obsidian";
import { filename } from "./core/writing/fileNaming";
import { taskFolder } from "./core/storage/vault";
import type { SettingsFiles } from "./settingsData";

/** The settings store's files, read through the vault's adapter so a file another app just wrote is read as it is on disk. */
export function vaultSettingsFiles(app: App): SettingsFiles {
	const { vault } = app;
	return {
		configDir: vault.configDir,
		read: async (path) => ((await vault.adapter.exists(path)) ? vault.adapter.read(path) : null),
		update: async (path, change) => {
			const file = vault.getFileByPath(path);
			if (file) {
				await vault.process(file, change);
				return;
			}
			const folder = path.split("/").slice(0, -1).join("/");
			if (folder !== "" && !(await vault.adapter.exists(folder))) await vault.adapter.mkdir(folder);
			await vault.adapter.write(path, change(null));
		},
	};
}

/** Makes `folder` and the folders above it that don't exist. */
export async function ensureFolder(vault: Vault, folder: string): Promise<void> {
	let made = "";
	for (const part of folder.split("/").filter((name) => name !== "")) {
		made = made === "" ? part : `${made}/${part}`;
		if (!vault.getFolderByPath(made)) await vault.createFolder(made);
	}
}

/** Creates the file at `path` with `text`, and the folders above it that don't exist. */
export async function createIn(vault: Vault, folder: string, path: string, text: string): Promise<TFile> {
	await ensureFolder(vault, folder);
	return vault.create(path, text);
}

/** Creates a task file named for `title` in the tasks folder, numbered when the name is taken. */
export async function createTask(vault: Vault, title: string, text: string): Promise<TFile> {
	const names = (vault.getFolderByPath(taskFolder)?.children ?? []).map((child) => child.name);
	return createIn(vault, taskFolder, `${taskFolder}/${filename(title, names)}`, text);
}

export const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));
