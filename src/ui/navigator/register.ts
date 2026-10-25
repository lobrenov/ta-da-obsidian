import { Platform, type Plugin } from "obsidian";
import type { SettingsStore } from "../../settingsData";
import type { TaDaIndex } from "../../TaDaIndex";
import type { Writer } from "../../Writer";
import type { NewTaskContext } from "../newTask/prefill";
import type { StatusActions } from "../statusActions";
import { NavigatorSettings } from "./navigatorSettings";
import { NavigatorView } from "./NavigatorView";
import { viewKinds, viewSpecs } from "./views";

/**
 * Adds the Agenda, Tasks and Tags views: each with its ribbon icon and command that open it in the left sidebar (a
 * tab beside the file explorer), and opening on startup when asked. Returns their settings, for the plugin's settings tab.
 */
export function registerNavigator(plugin: Plugin & { taDaIndex: TaDaIndex; writer: Writer; statusActions: StatusActions }, store: SettingsStore, newTask: (context: NewTaskContext) => void): NavigatorSettings {
	const settings = new NavigatorSettings(store, () => plugin.taDaIndex.index);
	for (const kind of viewKinds) {
		const { type, icon, openName, commandId } = viewSpecs[kind];
		const View = NavigatorView.of(kind);
		plugin.registerView(type, (leaf) => new View(leaf, { taDaIndex: plugin.taDaIndex, writer: plugin.writer, status: plugin.statusActions, settings, newTask }));
		const open = (): void => {
			void plugin.app.workspace.ensureSideLeaf(type, "left", { active: true, reveal: true });
		};
		plugin.addRibbonIcon(icon, openName, open);
		plugin.addCommand({ id: commandId, name: openName, callback: open });
	}

	plugin.app.workspace.onLayoutReady(() => {
		// Startup shows a tab without taking focus, and leaves a tab that's already there as it is. A phone's drawer
		// would slide open over the file, so there it only makes the tab.
		for (const kind of viewKinds) {
			const { type } = viewSpecs[kind];
			if (!settings.data.openOnStartup[kind] || plugin.app.workspace.getLeavesOfType(type).length > 0) continue;
			void plugin.app.workspace.ensureSideLeaf(type, "left", { active: false, reveal: !Platform.isMobile });
		}
	});
	return settings;
}
