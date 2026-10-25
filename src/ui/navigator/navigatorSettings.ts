import { Setting } from "obsidian";
import { dateAtPath, weekAtPath, type DailyNoteNames } from "../../core/index/dailyNotes";
import type { VaultIndex } from "../../core/index/vaultIndex";
import { viewKinds, viewSpecs } from "./views";
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

	async update(change: Partial<NavigatorData>): Promise<void> {
		const saved = this.store.updateNavigator(change);
		for (const listener of [...this.listeners]) listener();
		await saved;
	}

	async updateDailyNotes(change: Partial<DailyNotesData>): Promise<void> {
		const saved = this.store.updateDailyNotes(change);
		for (const listener of [...this.listeners]) listener();
		await saved;
	}
}

/** The views' settings, drawn into the plugin's settings tab. */
export function displayNavigatorSettings(containerEl: HTMLElement, settings: NavigatorSettings): void {
	for (const kind of viewKinds) {
		const name = viewSpecs[kind].title.replace("Ta Da: ", "");
		new Setting(containerEl)
			.setName(`Open ${name} on startup`)
			.setDesc(`Shows the ${viewSpecs[kind].title} view in the left sidebar, beside the file explorer.`)
			.addToggle((toggle) => toggle.setValue(settings.data.openOnStartup[kind]).onChange((value) => void settings.update({ openOnStartup: { ...settings.data.openOnStartup, [kind]: value } })));
	}
	new Setting(containerEl)
		.setName("Collapse the list pane")
		.setDesc("Hides the list beside the navigation pane in Tasks and Tags. The button in the view's header toggles it too.")
		.addToggle((toggle) => toggle.setValue(settings.data.collapseListPane).onChange((value) => void settings.update({ collapseListPane: value })));
}

/** Settings ▸ Daily notes, drawn into the plugin's settings tab. */
export function displayDailyNotesSettings(containerEl: HTMLElement, settings: NavigatorSettings): void {
	const data = settings.dailyNotes;
	new Setting(containerEl).setName("Daily notes").setHeading();
	folderSetting(containerEl, "Daily note folder", data.dailyFolder, (value) => void settings.updateDailyNotes({ dailyFolder: value }));
	templateSetting(containerEl, "Daily note template", data.dailyTemplate, settings, (value) => void settings.updateDailyNotes({ dailyTemplate: value }), false);
	new Setting(containerEl)
		.setName("Show a note for each week")
		.setDesc("Adds a week note row to the Agenda's week, and marks the weeks that have one.")
		.addToggle((toggle) =>
			toggle.setValue(data.weekNotes).onChange(async (value) => {
				await settings.updateDailyNotes({ weekNotes: value });
				weekSettings.forEach((setting) => setting.setDisabled(!value));
			}),
		);
	const weekSettings = [
		folderSetting(containerEl, "Week note folder", data.weekFolder, (value) => void settings.updateDailyNotes({ weekFolder: value }), !data.weekNotes),
		templateSetting(containerEl, "Week note template", data.weekTemplate, settings, (value) => void settings.updateDailyNotes({ weekTemplate: value }), !data.weekNotes),
	];
}

/** A folder path typed into a field, tidied and saved on Enter or when the field loses focus. */
function folderSetting(containerEl: HTMLElement, name: string, value: string, save: (folder: string) => void, disabled = false): Setting {
	const setting = new Setting(containerEl).setName(name).setDesc("A vault folder; empty is the vault's top level.").setDisabled(disabled);
	setting.addText((text) => {
		text.setPlaceholder("Vault folder").setValue(value);
		let saved = value;
		const commit = (): void => {
			const cleaned = cleanedFolder(text.getValue());
			text.setValue(cleaned);
			if (cleaned !== saved) {
				saved = cleaned;
				save(cleaned);
			}
		};
		text.inputEl.addEventListener("blur", commit);
		text.inputEl.addEventListener("keydown", (event) => {
			if (event.key === "Enter") commit();
		});
	});
	return setting;
}

/** The note new daily or week notes start from: None, or one of the vault's notes. A saved note that's gone shows as missing. */
function templateSetting(
	containerEl: HTMLElement,
	name: string,
	value: string | null,
	settings: NavigatorSettings,
	save: (template: string | null) => void,
	disabled: boolean,
): Setting {
	const choices = settings.templateChoices();
	const setting = new Setting(containerEl).setName(name).setDesc("New notes start from this note's text.").setDisabled(disabled);
	setting.addDropdown((dropdown) => {
		dropdown.addOption("", "None");
		if (value !== null && !choices.includes(value)) dropdown.addOption(value, `${missingTitle(value)} (missing)`);
		for (const path of choices) dropdown.addOption(path, path.replace(/\.md$/, ""));
		dropdown.setValue(value ?? "").onChange((chosen) => save(chosen === "" ? null : chosen));
	});
	return setting;
}

function missingTitle(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/, "");
}
