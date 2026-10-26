import { type Plugin, TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import { statuses } from "../core/model/status";
import type { StatusActions } from "./statusActions";

/** Adds the plugin's items to Obsidian's file menu, wherever it shows, for task and project files. */
export function registerFileMenu(plugin: Plugin, index: VaultIndex, status: StatusActions): void {
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
				for (const option of statuses) {
					if (option === "Ongoing" && kind !== "project") continue;
					submenu.addItem((sub) => sub.setTitle(sentence(option)).setChecked(option === current).onClick(() => status.set(file, option)));
				}
			});
			// Step 5: "Convert to project…" on a task, in the same section.
		}),
	);
}

/** `Not Started` as `Not started`. */
function sentence(text: string): string {
	return text.slice(0, 1).toUpperCase() + text.slice(1).toLowerCase();
}
