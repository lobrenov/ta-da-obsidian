import { Platform, type Plugin } from "obsidian";
import type { TaDaIndex } from "../../TaDaIndex";
import type { Writer } from "../../Writer";
import { NavigatorSettings, NavigatorSettingTab } from "./navigatorSettings";
import { NavigatorView, navigatorViewType } from "./NavigatorView";

/**
 * Adds the navigator: its view, the ribbon icon and command that open it in the left sidebar (a tab beside the file
 * explorer), its settings tab, and opening on startup when asked.
 */
export function registerNavigator(plugin: Plugin & { taDaIndex: TaDaIndex; writer: Writer }): void {
	const settings = new NavigatorSettings(plugin);
	plugin.registerView(navigatorViewType, (leaf) => new NavigatorView(leaf, { taDaIndex: plugin.taDaIndex, writer: plugin.writer, settings }));
	plugin.addSettingTab(new NavigatorSettingTab(plugin.app, plugin, settings));

	const open = (reveal: boolean): void => {
		void plugin.app.workspace.ensureSideLeaf(navigatorViewType, "left", { active: reveal, reveal });
	};
	plugin.addRibbonIcon("circle-check", "Open Ta Da navigator", () => open(true));
	plugin.addCommand({ id: "open-navigator", name: "Open Ta Da navigator", callback: () => open(true) });

	plugin.app.workspace.onLayoutReady(() => {
		void settings.ready.then(() => {
			// A phone's drawer would slide open over the file, so there it only makes the tab.
			if (settings.data.openOnStartup) open(!Platform.isMobile);
		});
	});
}
