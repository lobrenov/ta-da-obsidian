import { Setting } from "obsidian";
import type { NavigatorData, SettingsStore } from "../../settingsData";

/** The navigator's part of the shared settings, with a call-back for the view when it changes. */
export class NavigatorSettings {
	private readonly listeners = new Set<() => void>();

	constructor(private readonly store: SettingsStore) {}

	get data(): NavigatorData {
		return this.store.data.navigator;
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
}

/** The navigator's settings, drawn into the plugin's settings tab. */
export function displayNavigatorSettings(containerEl: HTMLElement, settings: NavigatorSettings): void {
	new Setting(containerEl)
		.setName("Open the navigator on startup")
		.setDesc("Shows the Ta Da navigator in the left sidebar, beside the file explorer.")
		.addToggle((toggle) => toggle.setValue(settings.data.openOnStartup).onChange((value) => void settings.update({ openOnStartup: value })));
	new Setting(containerEl)
		.setName("Collapse the list pane")
		.setDesc("Hides the list beside the navigation pane. The button in the navigator's header toggles it too.")
		.addToggle((toggle) => toggle.setValue(settings.data.collapseListPane).onChange((value) => void settings.update({ collapseListPane: value })));
}
