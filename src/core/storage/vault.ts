/** Ta Da's own folder, at the top level: what Ta Da creates goes in it. */
export const home = "Ta Da";
export const taskFolder = `${home}/tasks`;
export const projectFolder = `${home}/projects`;
export const areaFolder = `${home}/areas`;
export const attachmentFolder = `${home}/attachments`;
export const logbookFolder = `${home}/Logbook`;

/** The old layout's hidden logbook folder, which Obsidian can't see. */
export const legacyLogbookFolder = ".logbook";
/** The old layout's top-level folders, lowercased: Ta Da made them before `Ta Da/`. */
export const legacyFolders: ReadonlySet<string> = new Set(["tasks", "projects", "areas", "attachments"]);
export const trashFolder = ".trash";

/** The spec's image extensions, lowercase. */
export const imageExtensions: ReadonlySet<string> = new Set([
	"avif", "bmp", "gif", "heic", "jpeg", "jpg", "png", "svg", "tif", "tiff", "webp",
]);

/** `Ta Da/tasks/Name.md` gives `Ta Da/tasks`; `Name.md` gives an empty string. */
export function folderOf(path: string): string {
	return path.split("/").filter((part) => part !== "").slice(0, -1).join("/");
}
