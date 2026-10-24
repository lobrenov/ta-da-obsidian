import { Notice, Plugin, TFile } from "obsidian";
import { statuses } from "./core/model/status";
import { TaDaSettingTab } from "./settings";
import { defaultSettings, resolveSettings, type TaDaSettings } from "./settingsData";
import { TaDaIndex } from "./TaDaIndex";
import { statusEdit } from "./ui/header/edits";
import { registerHeader } from "./ui/header/registerHeader";
import { today } from "./ui/header/today";
import { Writer } from "./Writer";

export default class TaDaPlugin extends Plugin {
	taDaIndex!: TaDaIndex;
	writer!: Writer;
	override settings: TaDaSettings = { ...defaultSettings };

	override async onload(): Promise<void> {
		this.settings = resolveSettings(await this.loadData());
		this.taDaIndex = new TaDaIndex(this);
		this.taDaIndex.start();
		this.writer = new Writer(this.app);
		this.addStatusCommands();
		const header = registerHeader(this, this.taDaIndex, this.writer, this.settings);
		this.addSettingTab(
			new TaDaSettingTab(this.app, this, this.settings, () => {
				void this.saveData(this.settings);
				header.refresh();
			}),
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
							.apply(file, statusEdit(status, file.path, today()))
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
