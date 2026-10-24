import { Platform, type Plugin } from "obsidian";
import type { SettingsStore } from "../../settingsData";
import type { TaDaIndex } from "../../TaDaIndex";
import type { Writer } from "../../Writer";
import type { StatusActions } from "../statusActions";
import { NavigatorSettings } from "./navigatorSettings";
import { NavigatorView, navigatorViewType } from "./NavigatorView";

/**
 * Adds the navigator: its view, the ribbon icon and command that open it in the left sidebar (a tab beside the file
 * explorer), and opening on startup when asked. Returns its settings, for the plugin's settings tab.
 */
export function registerNavigator(plugin: Plugin & { taDaIndex: TaDaIndex; writer: Writer; statusActions: StatusActions }, store: SettingsStore): NavigatorSettings {
	const settings = new NavigatorSettings(store, () => plugin.taDaIndex.index);
	plugin.registerView(navigatorViewType, (leaf) => new NavigatorView(leaf, { taDaIndex: plugin.taDaIndex, writer: plugin.writer, status: plugin.statusActions, settings }));

	const open = (reveal: boolean): void => {
		void plugin.app.workspace.ensureSideLeaf(navigatorViewType, "left", { active: reveal, reveal });
	};
	plugin.addRibbonIcon("circle-check", "Open Ta Da navigator", () => open(true));
	plugin.addCommand({ id: "open-navigator", name: "Open navigator", callback: () => open(true) });

	plugin.app.workspace.onLayoutReady(() => {
		// Startup shows the tab without taking focus, and leaves a tab that's already there as it is. A phone's drawer
		// would slide open over the file, so there it only makes the tab.
		if (!settings.data.openOnStartup || plugin.app.workspace.getLeavesOfType(navigatorViewType).length > 0) return;
		void plugin.app.workspace.ensureSideLeaf(navigatorViewType, "left", { active: false, reveal: !Platform.isMobile });
	});
	return settings;
}
