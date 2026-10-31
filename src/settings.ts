import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";
import type { TaDaData } from "./settingsData";
import { displayDailyNotesSettings, displayNavigatorSettings, type NavigatorSettings } from "./ui/navigator/navigatorSettings";

export class TaDaSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly settings: TaDaData,
		private readonly changed: () => void,
		private readonly navigator: NavigatorSettings,
		private readonly setTaskLinkBoxes: (value: boolean) => void,
	) {
		super(app, plugin);
	}

	/** Draws the settings again when the tab is showing. */
	refresh(): void {
		if (this.containerEl.isConnected) this.display();
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
		new Setting(this.containerEl).setName("Task checkboxes on links").addToggle((toggle) => toggle.setValue(this.settings.taskLinkBoxes).onChange(this.setTaskLinkBoxes));
		displayNavigatorSettings(this.containerEl, this.navigator);
		displayDailyNotesSettings(this.containerEl, this.navigator);
	}
}
