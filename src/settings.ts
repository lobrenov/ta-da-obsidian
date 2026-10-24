import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";
import type { TaDaSettings } from "./settingsData";

export class TaDaSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly settings: TaDaSettings,
		private readonly changed: () => void,
	) {
		super(app, plugin);
	}

	override display(): void {
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName("Hide properties on Ta Da files")
			.setDesc("Task, project and area files show Ta Da's header instead of Obsidian's properties. The header's Properties button shows them for one file.")
			.addToggle((toggle) =>
				toggle.setValue(this.settings.hideProperties).onChange((value) => {
					this.settings.hideProperties = value;
					this.changed();
				}),
			);
	}
}
