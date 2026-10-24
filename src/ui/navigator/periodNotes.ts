import { type App, Notice, TFolder } from "obsidian";
import { identityKey } from "../../core/text";
import { newDailyNote } from "../../core/writing/newFile";
import type { LocalDate } from "../../core/model/localDate";

/** `folder` as it's spelled in `known` when a folder of that name exists in another case, else as given. */
export function existingCasing(folder: string, known: Iterable<string>): string {
	const all = [...known].sort();
	let resolved = "";
	for (const name of folder.split("/").filter((part) => part !== "")) {
		const wanted = resolved === "" ? name : `${resolved}/${name}`;
		resolved = all.find((path) => identityKey(path) === identityKey(wanted)) ?? wanted;
	}
	return resolved;
}

/** The folder a path is in; empty for the vault's top level. */
export function folderOfPath(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash < 0 ? "" : path.slice(0, slash);
}

/**
 * Makes the note at `target` from the template's text, with its folders, and resolves to its path. A name that's
 * taken in the folder, in any case, is never numbered: that file's path resolves instead. Resolves to null when it
 * couldn't be made.
 */
export function createPeriodNote(app: App, target: string, templatePath: string | null, today: LocalDate): Promise<string | null> {
	const pending = creating.get(target);
	if (pending) return pending;
	const made = makePeriodNote(app, target, templatePath, today).finally(() => creating.delete(target));
	creating.set(target, made);
	return made;
}

/** Notes being made, by target path, so a second click waits for the first. */
const creating = new Map<string, Promise<string | null>>();

async function makePeriodNote(app: App, target: string, templatePath: string | null, today: LocalDate): Promise<string | null> {
	const { vault } = app;
	const folder = existingCasing(folderOfPath(target), vault.getAllFolders(true).map((entry) => entry.path));
	const filename = target.slice(target.lastIndexOf("/") + 1);
	const parent = folder === "" ? vault.getRoot() : vault.getFolderByPath(folder);
	const taken = parent?.children.find((child) => identityKey(child.name) === identityKey(filename));
	if (taken) return taken.path;
	try {
		const templateFile = templatePath === null ? null : vault.getFileByPath(templatePath);
		const template = templateFile ? await vault.read(templateFile).catch(() => null) : null;
		await ensureFolder(app, folder);
		const path = folder === "" ? filename : `${folder}/${filename}`;
		const file = await vault.create(path, newDailyNote(template, today));
		return file.path;
	} catch (error) {
		new Notice(`Couldn't create the note: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

async function ensureFolder(app: App, folder: string): Promise<void> {
	let path = "";
	for (const name of folder.split("/").filter((part) => part !== "")) {
		path = path === "" ? name : `${path}/${name}`;
		if (!(app.vault.getAbstractFileByPath(path) instanceof TFolder)) await app.vault.createFolder(path);
	}
}
