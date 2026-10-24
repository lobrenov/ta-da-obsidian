import { type App, type Plugin, PluginSettingTab, Setting } from "obsidian";

export interface NavigatorData {
	/** Open the navigator in the left sidebar when Obsidian starts. */
	openOnStartup: boolean;
	/** Hide the list pane, leaving only the navigation pane. */
	collapseListPane: boolean;
}

const defaults: NavigatorData = { openOnStartup: false, collapseListPane: false };

/** The navigator's settings, kept under `navigator` in the plugin's `data.json` beside any other section. */
export class NavigatorSettings {
	data: NavigatorData = { ...defaults };
	/** Resolves once the saved settings are read. */
	readonly ready: Promise<void>;
	private readonly listeners = new Set<() => void>();

	constructor(private readonly plugin: Plugin) {
		this.ready = this.load();
	}

	/** Calls `listener` after a setting changes. Returns a function that stops listening. */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async update(change: Partial<NavigatorData>): Promise<void> {
		this.data = { ...this.data, ...change };
		const saved = ((await this.plugin.loadData()) ?? {}) as Record<string, unknown>;
		await this.plugin.saveData({ ...saved, navigator: this.data });
		for (const listener of [...this.listeners]) listener();
	}

	private async load(): Promise<void> {
		const saved = (await this.plugin.loadData()) as { navigator?: Partial<NavigatorData> } | null;
		const stored = saved?.navigator ?? {};
		this.data = {
			openOnStartup: typeof stored.openOnStartup === "boolean" ? stored.openOnStartup : defaults.openOnStartup,
			collapseListPane: typeof stored.collapseListPane === "boolean" ? stored.collapseListPane : defaults.collapseListPane,
		};
	}
}

export class NavigatorSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly settings: NavigatorSettings,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName("Open the navigator on startup")
			.setDesc("Shows the Ta Da navigator in the left sidebar, beside the file explorer.")
			.addToggle((toggle) => toggle.setValue(this.settings.data.openOnStartup).onChange((value) => void this.settings.update({ openOnStartup: value })));
		new Setting(containerEl)
			.setName("Collapse the list pane")
			.setDesc("Hides the list beside the navigation pane. The button in the navigator's header toggles it too.")
			.addToggle((toggle) => toggle.setValue(this.settings.data.collapseListPane).onChange((value) => void this.settings.update({ collapseListPane: value })));
	}
}
