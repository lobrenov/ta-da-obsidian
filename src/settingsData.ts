export interface TaDaSettings {
	/** Hide Obsidian's Properties block on task, project and area files; the header's button still shows it. */
	hideProperties: boolean;
}

export const defaultSettings: TaDaSettings = { hideProperties: true };

/** The saved data over the defaults. Nothing saved (null on a first run), or a value of the wrong type, gives the default. */
export function resolveSettings(saved: unknown): TaDaSettings {
	const data = typeof saved === "object" && saved !== null ? (saved as Partial<Record<keyof TaDaSettings, unknown>>) : {};
	return { hideProperties: typeof data.hideProperties === "boolean" ? data.hideProperties : defaultSettings.hideProperties };
}
