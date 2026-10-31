import { Plugin, type TAbstractFile, TFile } from "obsidian";
import { registerCommands } from "./commands";
import { statuses } from "./core/model/status";
import { TaDaSettingTab } from "./settings";
import { settingsFilePath } from "./core/storage/settingsFile";
import { DailyLog } from "./DailyLog";
import { Logbook } from "./Logbook";
import { SettingsStore, type TaDaData } from "./settingsData";
import { TaDaIndex } from "./TaDaIndex";
import { localToday } from "./ui/dates";
import { openConvertModal } from "./ui/convert/ConvertModal";
import { registerFileMenu } from "./ui/fileMenu";
import { registerHeader } from "./ui/header/registerHeader";
import { registerLinkBoxes } from "./ui/registerLinkBoxes";
import { registerNavigator } from "./ui/navigator/register";
import { StatusActions } from "./ui/statusActions";
import { vaultSettingsFiles } from "./vaultFiles";
import { Writer } from "./Writer";

export default class TaDaPlugin extends Plugin {
	taDaIndex!: TaDaIndex;
	writer!: Writer;
	statusActions!: StatusActions;
	logbook!: Logbook;
	dailyLog!: DailyLog;
	store = new SettingsStore(this, vaultSettingsFiles(this.app));
	/** The settings the header and navigator read; `data.json` holds all but `dailyNotes` and `taskLinkBoxes`. */
	override settings: TaDaData = this.store.data;

	override async onload(): Promise<void> {
		await this.store.load();
		this.taDaIndex = new TaDaIndex(this);
		this.taDaIndex.start();
		this.writer = new Writer(this.app);
		const logbook = new Logbook(this.app, this.taDaIndex.index, this.writer, localToday);
		this.logbook = logbook;
		this.statusActions = new StatusActions(this.app, this.taDaIndex.index, this.writer, localToday, logbook);
		this.dailyLog = new DailyLog(this.app, this.taDaIndex.index, logbook, this.statusActions, this.store, localToday);
		this.addStatusCommands();
		const { index } = this.taDaIndex;
		registerFileMenu(this, index, this.statusActions, (file) => void openConvertModal({ app: this.app, index, writer: this.writer, today: localToday }, file), this.writer);
		const { newTask } = registerCommands(this);
		const header = registerHeader(this, this.taDaIndex, this.writer, this.statusActions, this.settings);
		const refreshLinkBoxes = registerLinkBoxes(this, this.taDaIndex, () => this.settings.taskLinkBoxes);
		const navigator = registerNavigator(this, this.store, newTask);
		const tab = new TaDaSettingTab(
			this.app,
			this,
			this.settings,
			() => {
				void this.store.save();
				header.refresh();
			},
			navigator,
			(value) => {
				void this.store.updateTaskLinkBoxes(value);
				refreshLinkBoxes();
			},
		);
		this.addSettingTab(tab);
		this.app.workspace.onLayoutReady(() => {
			void this.taDaIndex.ready.then(() => {
				void this.dailyLog.logIfDue();
				this.registerInterval(window.setInterval(() => void this.dailyLog.logIfDue(), 60_000));
			});
			const reload = (file: TAbstractFile): void => {
				if (file.path !== settingsFilePath) return;
				void this.store.reloadSettingsFile().then((changed) => {
					if (!changed) return;
					navigator.notify();
					refreshLinkBoxes();
					tab.refresh();
				});
			};
			this.registerEvent(this.app.vault.on("create", reload));
			this.registerEvent(this.app.vault.on("modify", reload));
			this.registerEvent(this.app.vault.on("delete", reload));
		});
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
