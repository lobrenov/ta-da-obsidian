import { type Plugin, TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import { statusChoices } from "../core/model/status";
import { statusLabel } from "./header/headerModel";
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
				for (const option of statusChoices(kind)) {
					if (option === "Done") submenu.addSeparator();
					submenu.addItem((sub) => {
						sub.setTitle(statusLabel(option));
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
