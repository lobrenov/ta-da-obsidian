import "obsidian";

declare module "obsidian" {
	interface MenuItem {
		/** Makes the item open a submenu, returned to fill. In Obsidian at runtime, not in its typings; guard the call. */
		setSubmenu(): Menu;
	}
	interface App {
		/** Obsidian's drag and drop, as the file explorer uses it. In Obsidian at runtime, not in its typings; guard the calls. */
		dragManager?: {
			dragFile?(event: DragEvent, file: TFile): unknown;
			dragFiles?(event: DragEvent, files: TFile[]): unknown;
			onDragStart?(event: DragEvent, data: unknown): void;
			/** What is being dragged, while a drag is. */
			draggable?: { type: string; file?: TFile; files?: TFile[] } | null;
		};
	}
	interface MetadataCache {
		/** Every tag in the vault, with `#` and as written, to its use count. In Obsidian at runtime, not in its typings; guard the call. */
		getTags?(): Record<string, number>;
	}
}
