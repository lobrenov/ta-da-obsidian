import { Plugin, TFile } from "obsidian";
import { LocalDate } from "./core/model/localDate";
import { statuses } from "./core/model/status";
import { setStatus } from "./core/writing/completion";
import { TaDaIndex } from "./TaDaIndex";
import { Writer } from "./Writer";

export default class TaDaPlugin extends Plugin {
	taDaIndex!: TaDaIndex;
	writer!: Writer;

	override onload(): void {
		this.taDaIndex = new TaDaIndex(this);
		this.taDaIndex.start();
		this.writer = new Writer(this.app);
		this.addStatusCommands();
	}

	/** One `Set status` command per status, on the active task or project file. */
	private addStatusCommands(): void {
		for (const status of statuses) {
			this.addCommand({
				id: `set-status-${status.toLowerCase().replace(" ", "-")}`,
				name: `Set status: ${status.toLowerCase()}`,
				checkCallback: (checking) => {
					const file = this.app.workspace.getActiveFile();
					if (!(file instanceof TFile) || !this.isTaskOrProject(file)) return false;
					if (!checking) void this.writer.apply(file, (text) => setStatus(status, text, today()));
					return true;
				},
			});
		}
	}

	private isTaskOrProject(file: TFile): boolean {
		const kind = this.taDaIndex.index.items.get(file.path)?.properties.kind;
		return kind === "task" || kind === "project";
	}
}

function today(): LocalDate {
	const now = new Date();
	return LocalDate.of(now.getFullYear(), now.getMonth() + 1, now.getDate()) as LocalDate;
}
