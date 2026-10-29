import "obsidian";

declare module "obsidian" {
	interface MenuItem {
		/** Makes the item open a submenu, returned to fill. In Obsidian at runtime, not in its typings. */
		setSubmenu(): Menu;
	}
	interface MetadataCache {
		/** Every tag in the vault, with `#` and as written, to its use count. In Obsidian at runtime, not in its typings. */
		getTags(): Record<string, number>;
	}
}
