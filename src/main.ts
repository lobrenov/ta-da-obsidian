import { Notice, Plugin, TFile } from "obsidian";
import { statuses } from "./core/model/status";
import { TaDaSettingTab } from "./settings";
import { SettingsStore, type TaDaData } from "./settingsData";
import { TaDaIndex } from "./TaDaIndex";
import { localToday } from "./ui/dates";
import { statusEdit } from "./ui/header/edits";
import { registerHeader } from "./ui/header/registerHeader";
import { registerNavigator } from "./ui/navigator/register";
import { Writer } from "./Writer";

export default class TaDaPlugin extends Plugin {
	taDaIndex!: TaDaIndex;
	writer!: Writer;
	store = new SettingsStore(this);
	/** The whole of `data.json`, which `PluginSettingTab` saves. */
	override settings: TaDaData = this.store.data;

	override async onload(): Promise<void> {
		await this.store.load();
		this.taDaIndex = new TaDaIndex(this);
		this.taDaIndex.start();
		this.writer = new Writer(this.app);
		this.addStatusCommands();
		const header = registerHeader(this, this.taDaIndex, this.writer, this.settings);
		const navigator = registerNavigator(this, this.store);
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
					if (!checking) {
						this.writer
							.apply(file, statusEdit(status, file.path, localToday()))
							.catch((error: unknown) => {
								new Notice(`Couldn't set the status: ${error instanceof Error ? error.message : String(error)}`);
							});
					}
					return true;
				},
			});
		}
	}
}
