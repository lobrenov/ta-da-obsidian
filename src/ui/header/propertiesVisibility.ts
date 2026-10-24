import type { Kind } from "../../core/model/item";

export const taDaFileClass = "ta-da-file";

/** Whether Obsidian's Properties block is hidden: on a task, project or area, unless the setting is off or the file's header shows it. */
export function hidesProperties(kind: Kind | undefined, settingOn: boolean, shownForFile: boolean): boolean {
	return settingOn && !shownForFile && (kind === "task" || kind === "project" || kind === "area");
}

/** The files whose Properties the header's button has shown, until the plugin unloads. */
export class ShownProperties {
	private readonly paths = new Set<string>();

	has(path: string): boolean {
		return this.paths.has(path);
	}

	/** Flips it and returns the new state. */
	toggle(path: string): boolean {
		if (!this.paths.delete(path)) this.paths.add(path);
		return this.paths.has(path);
	}

	rename(from: string, to: string): void {
		if (this.paths.delete(from)) this.paths.add(to);
	}
}
