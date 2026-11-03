import { type App, type Plugin, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type { TaDaData } from "./settingsData";
import { dailyNotesDefinitions, navigatorControlValue, navigatorDefinitions, type NavigatorSettings, setNavigatorControlValue } from "./ui/navigator/navigatorSettings";

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

	/** Evaluates the definitions again when the tab is showing. */
	refresh(): void {
		if (this.containerEl.isConnected) this.update();
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Hide properties on Ta Da files",
				desc: "Task, project and area files show Ta Da's header instead of Obsidian's properties. The header's Properties button shows them for one file.",
				control: { type: "toggle", key: "hideProperties" },
			},
			{ name: "Task checkboxes on links", control: { type: "toggle", key: "taskLinkBoxes" } },
			...navigatorDefinitions(this.navigator),
			...dailyNotesDefinitions(this.navigator),
		];
	}

	override getControlValue(key: string): unknown {
		if (key === "hideProperties") return this.settings.hideProperties;
		if (key === "taskLinkBoxes") return this.settings.taskLinkBoxes;
		return navigatorControlValue(this.navigator, key);
	}

	override setControlValue(key: string, value: unknown): void {
		if (key === "hideProperties") {
			this.settings.hideProperties = value === true;
			this.changed();
		} else if (key === "taskLinkBoxes") {
			this.setTaskLinkBoxes(value === true);
		} else if (setNavigatorControlValue(this.navigator, key, value) && key === "weekNotes") {
			this.update();
		}
	}
}
