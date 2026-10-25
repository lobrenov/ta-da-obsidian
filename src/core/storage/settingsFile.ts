/** The Daily notes settings in `Ta Da/settings.json`'s `dailyNotes` group. */
export interface DailyNotesValues {
	dailyFolder: string;
	dailyTemplate: string | null;
	weekNotes: boolean;
	weekFolder: string;
	weekTemplate: string | null;
}

export const settingsFilePath = "Ta Da/settings.json";

function objectOf(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseObject(text: string | null): Record<string, unknown> | null {
	if (text === null) return null;
	try {
		return objectOf(JSON.parse(text));
	} catch {
		return null;
	}
}

/** The keys of a `dailyNotes` group that hold a value of the right type; each key stands alone. */
export function validDailyNotes(group: unknown): Partial<DailyNotesValues> {
	const stored = objectOf(group) ?? {};
	const values: Partial<DailyNotesValues> = {};
	if (typeof stored["dailyFolder"] === "string") values.dailyFolder = stored["dailyFolder"];
	if (typeof stored["dailyTemplate"] === "string" || stored["dailyTemplate"] === null) values.dailyTemplate = stored["dailyTemplate"];
	if (typeof stored["weekNotes"] === "boolean") values.weekNotes = stored["weekNotes"];
	if (typeof stored["weekFolder"] === "string") values.weekFolder = stored["weekFolder"];
	if (typeof stored["weekTemplate"] === "string" || stored["weekTemplate"] === null) values.weekTemplate = stored["weekTemplate"];
	return values;
}

/** The valid `dailyNotes` keys of the settings file's text; nothing, or text that isn't a JSON object, has none. */
export function readDailyNotes(text: string | null): Partial<DailyNotesValues> {
	return validDailyNotes(parseObject(text)?.["dailyNotes"]);
}

/** The settings file's text with the five `dailyNotes` keys set to `values` and everything else as it was. */
export function writeDailyNotes(text: string | null, values: DailyNotesValues): string {
	const root = parseObject(text) ?? {};
	root["dailyNotes"] = { ...(objectOf(root["dailyNotes"]) ?? {}), ...values };
	return `${JSON.stringify(root, null, 2)}\n`;
}

/** The daily note folder and template from Obsidian's `daily-notes.json`; an empty template is left out, and `.md` is added to one without it. */
export function readObsidianDailyNotes(text: string): Pick<Partial<DailyNotesValues>, "dailyFolder" | "dailyTemplate"> {
	const stored = parseObject(text) ?? {};
	const values: Pick<Partial<DailyNotesValues>, "dailyFolder" | "dailyTemplate"> = {};
	if (typeof stored["folder"] === "string") values.dailyFolder = stored["folder"];
	const template = stored["template"];
	if (typeof template === "string" && template !== "") values.dailyTemplate = template.endsWith(".md") ? template : `${template}.md`;
	return values;
}
