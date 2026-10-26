import "obsidian";

declare module "obsidian" {
	interface MenuItem {
		/** Makes the item open a submenu, returned to fill. In Obsidian at runtime, not in its typings. */
		setSubmenu(): Menu;
	}
}
