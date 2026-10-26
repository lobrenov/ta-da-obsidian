import { type Plugin, TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import { isClosed, statusChoices } from "../core/model/status";
import { localToday } from "./dates";
import { statusLabel } from "./header/headerModel";
import { moveNote, statusContext, statusTitle } from "./repeatWording";
import type { StatusActions } from "./statusActions";

/** Adds the plugin's items to Obsidian's file menu, wherever it shows, for task and project files: Status…, and Convert to project… on a task. */
export function registerFileMenu(plugin: Plugin, index: VaultIndex, status: StatusActions, convert: (file: TFile) => void): void {
	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file) => {
			if (!(file instanceof TFile)) return;
			const item = index.get(file.path);
			if (!item) return;
			const { kind, status: current } = item.properties;
			if (kind !== "task" && kind !== "project") return;
			menu.addItem((entry) => {
				entry.setTitle("Status…").setIcon("circle-dot").setSection("ta-da");
				const submenu = entry.setSubmenu();
				const today = localToday();
				const { repeating, move } = statusContext(item, index, today);
				for (const option of statusChoices(kind)) {
					if (option === "Done") submenu.addSeparator();
					submenu.addItem((sub) => {
						const note = move && isClosed(option) && option !== current ? ` · ${moveNote(move, today)}` : "";
						sub.setTitle(`${statusTitle(option, repeating, statusLabel(option))}${note}`);
						sub.setChecked(option === current);
						sub.onClick(() => status.set(file, option));
					});
				}
			});
			if (kind !== "task") return;
			menu.addItem((entry) => entry.setTitle("Convert to project…").setIcon("folder-input").setSection("ta-da").onClick(() => convert(file)));
		}),
	);
}
