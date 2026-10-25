import { type DailyNotesValues, readDailyNotes, readObsidianDailyNotes, settingsFilePath, validDailyNotes, writeDailyNotes } from "./core/storage/settingsFile";
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
export type DailyNotesData = DailyNotesValues;

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

/** What the header and the navigator read: `data.json`'s header settings and `navigator`, and `dailyNotes` from the vault's settings file. */
export interface TaDaData extends TaDaSettings {
	navigator: NavigatorData;
	dailyNotes: DailyNotesData;
}

/** Folders tidied and an empty template read as none. */
function normalizedDailyNotes(values: Partial<DailyNotesValues>): Partial<DailyNotesData> {
	const result = { ...values };
	if (result.dailyFolder !== undefined) result.dailyFolder = cleanedFolder(result.dailyFolder);
	if (result.weekFolder !== undefined) result.weekFolder = cleanedFolder(result.weekFolder);
	if (result.dailyTemplate === "") result.dailyTemplate = null;
	if (result.weekTemplate === "") result.weekTemplate = null;
	return result;
}

/** The saved data over the defaults, `dailyNotes` being the earlier value from `data.json`; a section or value of the wrong type gives its default. */
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
		dailyNotes: { ...defaultDailyNotes, ...normalizedDailyNotes(validDailyNotes(data.dailyNotes)) },
	};
}

/** The part of a plugin the store reads and writes. */
export interface DataPlugin {
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
}

/** The vault files the store reads and writes. `update` creates the file, and its folder, when missing. */
export interface SettingsFiles {
	/** Obsidian's config folder. */
	configDir: string;
	read(path: string): Promise<string | null>;
	update(path: string, change: (text: string | null) => string): Promise<void>;
}

/**
 * The one in-memory copy of the settings, shared by the header and the navigator. `data` keeps its identity, so what
 * holds it sees every change. `data.json` takes the header's and the navigator's, saved whole, one at a time, in the
 * order asked; its old `dailyNotes` is kept as it was, for the fallback. The daily notes are in `Ta Da/settings.json`.
 */
export class SettingsStore {
	readonly data: TaDaData = { ...defaultSettings, navigator: { ...defaultNavigator, openOnStartup: { ...defaultNavigator.openOnStartup } }, dailyNotes: { ...defaultDailyNotes } };
	private queue: Promise<void> = Promise.resolve();
	private pendingWrites = 0;
	private savedDailyNotes: unknown;

	constructor(
		private readonly plugin: DataPlugin,
		private readonly files: SettingsFiles,
	) {}

	async load(): Promise<void> {
		const saved = await this.plugin.loadData();
		const loaded = resolveData(saved);
		this.data.hideProperties = loaded.hideProperties;
		this.data.navigator = loaded.navigator;
		this.savedDailyNotes = typeof saved === "object" && saved !== null ? (saved as { dailyNotes?: unknown }).dailyNotes : undefined;
		this.data.dailyNotes = await this.readDailyNotes();
	}

	/**
	 * Reads the daily notes again from the settings file, after any write already waiting. Returns whether they
	 * changed. A read made while a newer change is still being written is dropped.
	 */
	reloadDailyNotes(): Promise<boolean> {
		const reloaded = this.queue.then(async () => {
			const values = await this.readDailyNotes();
			if (this.pendingWrites > 0 || JSON.stringify(values) === JSON.stringify(this.data.dailyNotes)) return false;
			this.data.dailyNotes = values;
			return true;
		});
		this.queue = reloaded.then(() => undefined, () => undefined);
		return reloaded;
	}

	/** Per key: the settings file, else `data.json`'s earlier value, else (folder and template) Obsidian's Daily notes setting, else the default. */
	private async readDailyNotes(): Promise<DailyNotesData> {
		const file = normalizedDailyNotes(readDailyNotes(await this.files.read(settingsFilePath)));
		const earlier = normalizedDailyNotes(validDailyNotes(this.savedDailyNotes));
		const obsidianText = await this.files.read(`${this.files.configDir}/daily-notes.json`);
		const obsidian = normalizedDailyNotes(obsidianText === null ? {} : readObsidianDailyNotes(obsidianText));
		const first = <K extends keyof DailyNotesData>(key: K, ...sources: Partial<DailyNotesData>[]): DailyNotesData[K] => (sources.find((source) => source[key] !== undefined)?.[key] ?? defaultDailyNotes[key]) as DailyNotesData[K];
		return {
			dailyFolder: first("dailyFolder", file, earlier, obsidian),
			dailyTemplate: first("dailyTemplate", file, earlier, obsidian),
			weekNotes: first("weekNotes", file, earlier),
			weekFolder: first("weekFolder", file, earlier),
			weekTemplate: first("weekTemplate", file, earlier),
		};
	}

	/** Writes `data.json` whole after any save already waiting. */
	save(): Promise<void> {
		const saved = this.queue.then(() => {
			const { hideProperties, navigator } = this.data;
			return this.plugin.saveData({ hideProperties, navigator, ...(this.savedDailyNotes === undefined ? {} : { dailyNotes: this.savedDailyNotes }) });
		});
		this.queue = saved.catch(() => undefined);
		return saved;
	}

	updateNavigator(change: Partial<NavigatorData>): Promise<void> {
		this.data.navigator = { ...this.data.navigator, ...change };
		return this.save();
	}

	/** Sets the values, then writes the settings file with all five, keeping its other keys. */
	updateDailyNotes(change: Partial<DailyNotesData>): Promise<void> {
		this.data.dailyNotes = { ...this.data.dailyNotes, ...change };
		this.pendingWrites++;
		const written = this.queue.then(() => this.files.update(settingsFilePath, (text) => writeDailyNotes(text, this.data.dailyNotes)));
		this.queue = written.then(
			() => void this.pendingWrites--,
			() => void this.pendingWrites--,
		);
		return written;
	}
}
