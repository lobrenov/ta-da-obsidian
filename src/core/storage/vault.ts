/** Ta Da's own folder, at the top level: what Ta Da creates goes in it. */
export const home = "Ta Da";
export const taskFolder = `${home}/tasks`;
export const projectFolder = `${home}/projects`;
export const areaFolder = `${home}/areas`;
export const attachmentFolder = `${home}/attachments`;
export const logbookFolder = `${home}/logbook`;
export const trashFolder = ".trash";

/** The spec's image extensions, lowercase. */
export const imageExtensions: ReadonlySet<string> = new Set([
	"avif", "bmp", "gif", "heic", "jpeg", "jpg", "png", "svg", "tif", "tiff", "webp",
]);

/** `Ta Da/tasks/Name.md` gives `Ta Da/tasks`; `Name.md` gives an empty string. */
export function folderOf(path: string): string {
	return path.split("/").filter((part) => part !== "").slice(0, -1).join("/");
}
