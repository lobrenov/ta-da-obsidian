import { type ViewKind, viewKinds } from "./ui/navigator/views";

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

export interface NavigatorData {
	/** Open each view in the left sidebar when Obsidian starts. */
	openOnStartup: Record<ViewKind, boolean>;
	/** Hide the list pane in Tasks and Tags, leaving only the navigation pane. */
	collapseListPane: boolean;
}

export const defaultNavigator: NavigatorData = { openOnStartup: { agenda: false, tasks: false, tags: false }, collapseListPane: false };

/** Settings ▸ Daily notes: the folders daily and week notes live in, whether week notes show, and the notes new ones start from, by path. */
export interface DailyNotesData {
	dailyFolder: string;
	dailyTemplate: string | null;
	weekNotes: boolean;
	weekFolder: string;
	weekTemplate: string | null;
}

export const defaultDailyNotes: DailyNotesData = {
	dailyFolder: "Periodic Notes/Daily Notes",
	dailyTemplate: null,
	weekNotes: true,
	weekFolder: "Periodic Notes/Weekly Notes",
	weekTemplate: null,
};

/** A typed folder without surrounding whitespace or slashes; empty is the vault's top level. */
export function cleanedFolder(text: string): string {
	return text.replace(/^[\s/]+|[\s/]+$/g, "");
}

/** Everything `data.json` holds: the header's settings, the navigator's under `navigator` and the notes' under `dailyNotes`. */
export interface TaDaData extends TaDaSettings {
	navigator: NavigatorData;
	dailyNotes: DailyNotesData;
}

function resolveDailyNotes(saved: unknown): DailyNotesData {
	const stored = typeof saved === "object" && saved !== null ? (saved as Partial<Record<keyof DailyNotesData, unknown>>) : {};
	const folder = (value: unknown, fallback: string): string => (typeof value === "string" ? cleanedFolder(value) : fallback);
	const template = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
	return {
		dailyFolder: folder(stored.dailyFolder, defaultDailyNotes.dailyFolder),
		dailyTemplate: template(stored.dailyTemplate),
		weekNotes: typeof stored.weekNotes === "boolean" ? stored.weekNotes : defaultDailyNotes.weekNotes,
		weekFolder: folder(stored.weekFolder, defaultDailyNotes.weekFolder),
		weekTemplate: template(stored.weekTemplate),
	};
}

/** The saved data over the defaults; a section or value of the wrong type gives its default. */
export function resolveData(saved: unknown): TaDaData {
	const data = typeof saved === "object" && saved !== null ? (saved as { navigator?: unknown; dailyNotes?: unknown }) : {};
	const stored = typeof data.navigator === "object" && data.navigator !== null ? (data.navigator as Partial<Record<keyof NavigatorData, unknown>>) : {};
	const startup = typeof stored.openOnStartup === "object" && stored.openOnStartup !== null ? (stored.openOnStartup as Partial<Record<ViewKind, unknown>>) : {};
	return {
		...resolveSettings(saved),
		navigator: {
			openOnStartup: Object.fromEntries(viewKinds.map((kind) => [kind, typeof startup[kind] === "boolean" ? startup[kind] : defaultNavigator.openOnStartup[kind]])) as Record<ViewKind, boolean>,
			collapseListPane: typeof stored.collapseListPane === "boolean" ? stored.collapseListPane : defaultNavigator.collapseListPane,
		},
		dailyNotes: resolveDailyNotes(data.dailyNotes),
	};
}

/** The part of a plugin the store reads and writes. */
export interface DataPlugin {
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
}

/**
 * The one in-memory copy of `data.json`, shared by the header and the navigator. `data` keeps its identity, so what
 * holds it sees every change; every save writes all of it, one at a time, in the order asked.
 */
export class SettingsStore {
	readonly data: TaDaData = { ...defaultSettings, navigator: { ...defaultNavigator, openOnStartup: { ...defaultNavigator.openOnStartup } }, dailyNotes: { ...defaultDailyNotes } };
	private queue: Promise<void> = Promise.resolve();

	constructor(private readonly plugin: DataPlugin) {}

	async load(): Promise<void> {
		const loaded = resolveData(await this.plugin.loadData());
		this.data.hideProperties = loaded.hideProperties;
		this.data.navigator = loaded.navigator;
		this.data.dailyNotes = loaded.dailyNotes;
	}

	/** Writes the whole of `data` after any save already waiting. */
	save(): Promise<void> {
		const saved = this.queue.then(() => this.plugin.saveData(this.data));
		this.queue = saved.catch(() => undefined);
		return saved;
	}

	updateNavigator(change: Partial<NavigatorData>): Promise<void> {
		this.data.navigator = { ...this.data.navigator, ...change };
		return this.save();
	}

	updateDailyNotes(change: Partial<DailyNotesData>): Promise<void> {
		this.data.dailyNotes = { ...this.data.dailyNotes, ...change };
		return this.save();
	}
}
