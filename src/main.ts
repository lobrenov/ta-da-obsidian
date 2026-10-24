import { Plugin, TFile } from "obsidian";
import { registerCommands } from "./commands";
import { statuses } from "./core/model/status";
import { TaDaSettingTab } from "./settings";
import { SettingsStore, type TaDaData } from "./settingsData";
import { TaDaIndex } from "./TaDaIndex";
import { localToday } from "./ui/dates";
import { registerHeader } from "./ui/header/registerHeader";
import { registerNavigator } from "./ui/navigator/register";
import { StatusActions } from "./ui/statusActions";
import { Writer } from "./Writer";

export default class TaDaPlugin extends Plugin {
	taDaIndex!: TaDaIndex;
	writer!: Writer;
	statusActions!: StatusActions;
	store = new SettingsStore(this);
	/** The whole of `data.json`, which `PluginSettingTab` saves. */
	override settings: TaDaData = this.store.data;

	override async onload(): Promise<void> {
		await this.store.load();
		this.taDaIndex = new TaDaIndex(this);
		this.taDaIndex.start();
		this.writer = new Writer(this.app);
		this.statusActions = new StatusActions(this.app, this.taDaIndex.index, this.writer, localToday);
		this.addStatusCommands();
		const { newTask } = registerCommands(this);
		const header = registerHeader(this, this.taDaIndex, this.writer, this.statusActions, this.settings);
		const navigator = registerNavigator(this, this.store, newTask);
		this.addSettingTab(
			new TaDaSettingTab(
				this.app,
				this,
				this.settings,
				() => {
					void this.store.save();
					header.refresh();
				},
				navigator,
			),
		);
	}

	/** One `Set status` command per status, on the active task or project file. */
	private addStatusCommands(): void {
		for (const status of statuses) {
			this.addCommand({
				id: `set-status-${status.toLowerCase().replace(" ", "-")}`,
				name: `Set status: ${status.toLowerCase()}`,
				checkCallback: (checking) => {
					const file = this.app.workspace.getActiveFile();
					const item = file instanceof TFile ? this.taDaIndex.index.items.get(file.path) : undefined;
					if (!(file instanceof TFile) || !item) return false;
					const { kind } = item.properties;
					if (kind !== "task" && kind !== "project") return false;
					if (status === "Ongoing" && kind !== "project") return false;
					if (!checking) this.statusActions.set(file, status);
					return true;
				},
			});
		}
	}
}
