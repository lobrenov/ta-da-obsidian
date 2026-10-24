import { Notice, Plugin, TFile } from "obsidian";
import { LocalDate } from "./core/model/localDate";
import { statuses } from "./core/model/status";
import { parseItem } from "./core/parsing/parseItem";
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
					const item = file instanceof TFile ? this.taDaIndex.index.items.get(file.path) : undefined;
					if (!(file instanceof TFile) || !item) return false;
					const { kind } = item.properties;
					if (kind !== "task" && kind !== "project") return false;
					if (status === "Ongoing" && kind !== "project") return false;
					if (!checking) {
						this.writer
							.apply(file, (text) =>
								parseItem(text, file.path)?.properties.status === status ? null : setStatus(status, text, today()),
							)
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

function today(): LocalDate {
	const now = new Date();
	return LocalDate.of(now.getFullYear(), now.getMonth() + 1, now.getDate()) as LocalDate;
}
