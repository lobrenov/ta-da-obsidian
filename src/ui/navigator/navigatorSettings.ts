import type { SettingDefinition, SettingDefinitionItem } from "obsidian";
import { dateAtPath, weekAtPath, type DailyNoteNames } from "../../core/index/dailyNotes";
import type { VaultIndex } from "../../core/index/vaultIndex";
import { viewKinds, viewSpecs, type ViewKind } from "./views";
import { cleanedFolder, type DailyNotesData, type NavigatorData, type SettingsStore } from "../../settingsData";

/** The navigator's part of the shared settings, with a call-back for the view when it changes. */
export class NavigatorSettings {
	private readonly listeners = new Set<() => void>();

	constructor(
		private readonly store: SettingsStore,
		private readonly index: () => VaultIndex,
	) {}

	get data(): NavigatorData {
		return this.store.data.navigator;
	}

	get dailyNotes(): DailyNotesData {
		return this.store.data.dailyNotes;
	}

	/** Where daily and week notes live, as the index looks them up. */
	get names(): DailyNoteNames {
		return { dailyFolder: this.dailyNotes.dailyFolder, weekFolder: this.dailyNotes.weekFolder };
	}

	/** The notes a template can be, by path, less the daily and week notes themselves. */
	templateChoices(): string[] {
		const names = this.names;
		return this.index()
			.notes.map((note) => note.path)
			.filter((path) => dateAtPath(names, path) === null && weekAtPath(names, path) === null)
			.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
	}

	/** Calls `listener` after a setting changes. Returns a function that stops listening. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Tells the listeners that a setting has changed, here or in the settings file. */
	notify(): void {
		for (const listener of [...this.listeners]) listener();
	}

	async update(change: Partial<NavigatorData>): Promise<void> {
		const saved = this.store.updateNavigator(change);
		this.notify();
		await saved;
	}

	async updateDailyNotes(change: Partial<DailyNotesData>): Promise<void> {
		const saved = this.store.updateDailyNotes(change);
		this.notify();
		await saved;
	}
}

const openOnStartupPrefix = "openOnStartup.";

/** The views' settings, as definitions for the plugin's settings tab. */
export function navigatorDefinitions(settings: NavigatorSettings): SettingDefinitionItem[] {
	return [
		...viewKinds.map((kind): SettingDefinition => {
			const title = viewSpecs[kind].title;
			return {
				name: `Open ${title.replace("Ta Da: ", "")} on startup`,
				desc: `Shows the ${title} view in the left sidebar, beside the file explorer.`,
				control: { type: "toggle", key: openOnStartupPrefix + kind },
			};
		}),
		{
			name: "Collapse the list pane",
			desc: "Shows one pane at a time in Tasks and Tags: picking a list shows it, with a back button. The button in the view's header toggles it too.",
			control: { type: "toggle", key: "collapseListPane" },
		},
	];
}

/** Settings ▸ Daily notes, as definitions for the plugin's settings tab. */
export function dailyNotesDefinitions(settings: NavigatorSettings): SettingDefinitionItem[] {
	const weekOff = (): boolean => !settings.dailyNotes.weekNotes;
	return [
		{
			name: "Daily notes",
			desc: "Shared with Ta Da through Ta Da/settings.json in the vault.",
			render: (setting) => {
				setting.setHeading();
			},
		},
		folderDefinition("Daily note folder", settings, "dailyFolder", () => false),
		templateDefinition("Daily note template", settings, "dailyTemplate", () => false),
		{
			name: "Show a note for each week",
			desc: "Adds a week note row to the Agenda's week, and marks the weeks that have one.",
			control: { type: "toggle", key: "weekNotes" },
		},
		folderDefinition("Week note folder", settings, "weekFolder", weekOff),
		templateDefinition("Week note template", settings, "weekTemplate", weekOff),
	];
}

/** The setting's value for a control key from `navigatorDefinitions` or `dailyNotesDefinitions`; undefined for other keys. */
export function navigatorControlValue(settings: NavigatorSettings, key: string): unknown {
	if (key.startsWith(openOnStartupPrefix)) return settings.data.openOnStartup[key.slice(openOnStartupPrefix.length) as ViewKind];
	switch (key) {
		case "collapseListPane":
			return settings.data.collapseListPane;
		case "weekNotes":
			return settings.dailyNotes.weekNotes;
		case "dailyTemplate":
		case "weekTemplate":
			return settings.dailyNotes[key] ?? "";
		default:
			return undefined;
	}
}

/** Saves a control's value for a key from `navigatorDefinitions` or `dailyNotesDefinitions`. Returns whether the key was one of them. */
export function setNavigatorControlValue(settings: NavigatorSettings, key: string, value: unknown): boolean {
	if (key.startsWith(openOnStartupPrefix)) {
		const kind = key.slice(openOnStartupPrefix.length) as ViewKind;
		void settings.update({ openOnStartup: { ...settings.data.openOnStartup, [kind]: value === true } });
		return true;
	}
	switch (key) {
		case "collapseListPane":
			void settings.update({ collapseListPane: value === true });
			return true;
		case "weekNotes":
			void settings.updateDailyNotes({ weekNotes: value === true });
			return true;
		case "dailyTemplate":
		case "weekTemplate":
			void settings.updateDailyNotes({ [key]: value === "" || typeof value !== "string" ? null : value });
			return true;
		default:
			return false;
	}
}

/** A folder path typed into a field, tidied and saved on Enter or when the field loses focus. */
function folderDefinition(name: string, settings: NavigatorSettings, key: "dailyFolder" | "weekFolder", disabled: () => boolean): SettingDefinition {
	return {
		name,
		desc: "A vault folder; empty is the vault's top level.",
		render: (setting) => {
			setting.setDisabled(disabled());
			setting.addText((text) => {
				const value = settings.dailyNotes[key];
				text.setPlaceholder("Vault folder").setValue(value);
				let saved = value;
				const commit = (): void => {
					const cleaned = cleanedFolder(text.getValue());
					text.setValue(cleaned);
					if (cleaned !== saved) {
						saved = cleaned;
						void settings.updateDailyNotes({ [key]: cleaned });
					}
				};
				text.inputEl.addEventListener("blur", commit);
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter") commit();
				});
			});
		},
	};
}

/** The note new daily or week notes start from: None, or one of the vault's notes. A saved note that's gone shows as missing. */
function templateDefinition(name: string, settings: NavigatorSettings, key: "dailyTemplate" | "weekTemplate", disabled: () => boolean): SettingDefinition {
	const value = settings.dailyNotes[key];
	const choices = settings.templateChoices();
	const options: Record<string, string> = { "": "None" };
	if (value !== null && !choices.includes(value)) options[value] = `${missingTitle(value)} (missing)`;
	for (const path of choices) options[path] = path.replace(/\.md$/, "");
	return { name, desc: "New notes start from this note's text.", control: { type: "dropdown", key, options, disabled } };
}

function missingTitle(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}
