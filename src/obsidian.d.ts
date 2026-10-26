import "obsidian";

declare module "obsidian" {
	interface Vault {
		/** An app setting by its `app.json` key. In Obsidian at runtime, not in its typings. */
		getConfig(key: string): unknown;
	}
	interface MenuItem {
		/** Makes the item open a submenu, returned to fill. In Obsidian at runtime, not in its typings. */
		setSubmenu(): Menu;
	}
}
