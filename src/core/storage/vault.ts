import type { LocalDate } from "../model/localDate";
import { splitFilename } from "../writing/fileNaming";
import { settingsFilePath } from "./settingsFile";

/** Ta Da's own folder, at the top level: what Ta Da creates goes in it. */
export const home = "Ta Da";
export const taskFolder = `${home}/tasks`;
export const projectFolder = `${home}/projects`;
export const areaFolder = `${home}/areas`;
export const attachmentFolder = `${home}/attachments`;
export const logbookFolder = `${home}/logbook`;
export const trashFolder = ".trash";

/** `Ta Da/logbook/2026-10` for a file completed in October 2026. */
export function logbookFolderFor(date: LocalDate): string {
	return `${logbookFolder}/${date.toString().slice(0, 7)}`;
}

/** The spec's image extensions, lowercase. Images are the attachments that can be drawn. */
export const imageExtensions: ReadonlySet<string> = new Set([
	"avif", "bmp", "gif", "heic", "jpeg", "jpg", "png", "svg", "tif", "tiff", "webp",
]);

/** Whether `filename` (or a path) has an image extension, ignoring case. */
export function isImage(filename: string): boolean {
	return imageExtensions.has(splitFilename(filename).ext.toLowerCase());
}

/**
 * Whether `filename` (or a path) has an extension other than `md`, ignoring case: any file but a note can be embedded.
 * An extension is ASCII letters and digits with at least one letter, so `Version 1.2` is a note title.
 * `Ta Da/settings.json` is not an attachment.
 */
export function isAttachment(filename: string): boolean {
	const ext = splitFilename(filename).ext.toLowerCase();
	return /^[a-z0-9]*[a-z][a-z0-9]*$/.test(ext) && ext !== "md" && filename !== settingsFilePath;
}

/** `Ta Da/tasks/Name.md` gives `Ta Da/tasks`; `Name.md` gives an empty string. */
export function folderOf(path: string): string {
	return path.split("/").filter((part) => part !== "").slice(0, -1).join("/");
}
