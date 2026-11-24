import { type Plugin, TFile, TFolder, type TAbstractFile } from "obsidian";
import { VaultIndex } from "./core/index/vaultIndex";
import type { Item } from "./core/model/item";
import { parseItem } from "./core/parsing/parseItem";

const readBatch = 64;
/** How long after the last change `onChange` listeners are called. */
const changeDelay = 150;
/** How long after the last edit in an editor its text goes into the index. */
const editDelay = 300;
/** How long a late `changed` (Obsidian's autosave) can't replace the editor text the index already took. */
const autosaveWindow = 2000;

/**
 * Obsidian's side of `VaultIndex`: built from the vault's markdown files once the layout is ready, then patched as
 * files are created, change, are renamed or are deleted.
 */
export class TaDaIndex {
	readonly index = new VaultIndex();
	/** Resolves once every file has been read, or the plugin unloaded first. */
	readonly ready: Promise<void>;
	/** Whether every file has been read: false until then, and for good if the plugin unloaded first. */
	built = false;
	private resolveReady: () => void = () => undefined;
	private unloaded = false;
	private lastGeneration = 0;
	/** The latest change seen for each path with a read pending, so a slow read never overwrites a newer change. */
	private readonly generations = new Map<string, number>();
	private readonly listeners = new Set<() => void>();
	private readonly deleteListeners = new Set<() => void>();
	/** Whether the first build is still reading files, when changes are held back until it ends. */
	private building = false;
	private changeTimer: number | undefined;
	/** Per path, the timer that will take an editor's latest text. */
	private readonly editTimers = new Map<string, number>();
	/** Per path, the editor text last seen and when, dropped by its timer once `autosaveWindow` has passed. */
	private readonly recentEdits = new Map<string, { text: string; at: number; timer: number }>();

	constructor(private readonly plugin: Plugin) {
		this.ready = new Promise((resolve) => {
			this.resolveReady = resolve;
		});
	}

	start(): void {
		this.plugin.register(() => {
			this.unloaded = true;
			window.clearTimeout(this.changeTimer);
			for (const timer of this.editTimers.values()) window.clearTimeout(timer);
			this.editTimers.clear();
			for (const { timer } of this.recentEdits.values()) window.clearTimeout(timer);
			this.recentEdits.clear();
			this.listeners.clear();
			this.deleteListeners.clear();
			this.resolveReady();
		});
		this.plugin.app.workspace.onLayoutReady(() => {
			if (this.unloaded) return;
			this.registerEvents();
			void this.build();
		});
	}

	/**
	 * Calls `listener` once, shortly after the last of a run of changes to the index (a file read, changed, renamed or
	 * deleted). Returns a function that stops listening.
	 */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** Calls `listener` when a file that was a Ta Da item or note is deleted, or a folder holding one. Returns a function that stops listening. */
	onDeleted(listener: () => void): () => void {
		this.deleteListeners.add(listener);
		return () => this.deleteListeners.delete(listener);
	}

	/** Schedules the listeners, unless the first build is still running: it calls them once, when it ends. */
	private changed(): void {
		if (this.building) return;
		window.clearTimeout(this.changeTimer);
		this.changeTimer = window.setTimeout(() => {
			for (const listener of [...this.listeners]) listener();
		}, changeDelay);
	}

	private async build(): Promise<void> {
		const files = this.plugin.app.vault.getFiles().filter(isMarkdown);
		this.building = true;
		try {
			for (let start = 0; start < files.length && !this.unloaded; start += readBatch) {
				if (start > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
				await Promise.all(files.slice(start, start + readBatch).map((file) => this.read(file)));
			}
			if (!this.unloaded) this.built = true;
		} finally {
			this.building = false;
			this.resolveReady();
			this.changed();
		}
	}

	private registerEvents(): void {
		const { vault, metadataCache, workspace } = this.plugin.app;
		this.plugin.registerEvent(vault.on("create", (file) => void this.read(file)));
		this.plugin.registerEvent(metadataCache.on("changed", (file, data) => this.saved(file, data)));
		this.plugin.registerEvent(workspace.on("quick-preview", (file, data) => this.edited(file, data)));
		this.plugin.registerEvent(vault.on("rename", (file, oldPath) => this.renamed(file, oldPath)));
		this.plugin.registerEvent(vault.on("delete", (file) => this.deleted(file)));
	}

	/**
	 * An open editor's text, which Obsidian sends on every edit, undo included, and `Writer` after each of its writes to
	 * an editor. It goes into the index after the edits pause, so the index follows the editor ahead of the file being
	 * saved.
	 */
	edited(file: TFile, text: string): void {
		if (!isMarkdown(file)) return;
		const path = file.path;
		window.clearTimeout(this.editTimers.get(path));
		window.clearTimeout(this.recentEdits.get(path)?.timer);
		const forget = window.setTimeout(() => this.recentEdits.delete(path), autosaveWindow);
		this.recentEdits.set(path, { text, at: Date.now(), timer: forget });
		this.editTimers.set(
			path,
			window.setTimeout(() => {
				this.editTimers.delete(path);
				this.apply(file, text);
			}, editDelay),
		);
	}

	/** The file as saved. Just after an edit it can be older than the editor, so the editor's text stands. */
	private saved(file: TFile, data: string): void {
		const recent = this.recentEdits.get(file.path);
		const fresh = recent !== undefined && Date.now() - recent.at < autosaveWindow;
		this.apply(file, fresh ? recent.text : data);
	}

	/** Reads a file's text and replaces its item. */
	private async read(file: TAbstractFile): Promise<void> {
		if (!(file instanceof TFile) || !isMarkdown(file)) return;
		const path = file.path;
		const generation = ++this.lastGeneration;
		this.generations.set(path, generation);
		let text: string;
		try {
			text = await this.plugin.app.vault.cachedRead(file);
		} catch {
			return;
		}
		if (this.generations.get(path) !== generation) return;
		this.generations.delete(path);
		this.apply(file, text);
		this.changed();
	}

	/** Takes the text of a file another part of the plugin has just written or moved into the index, telling listeners if its item differs. */
	sync(file: TFile, text: string): void {
		this.apply(file, text);
	}

	/** Drops a path another part of the plugin found gone from the vault, telling listeners if it was indexed. */
	drop(path: string): void {
		this.remove(path);
	}

	/**
	 * Replaces a file's item; a file that isn't a Ta Da file or note, or that can't be parsed, leaves the index. Listeners
	 * hear of it only when the item appears, goes or differs from the one indexed.
	 */
	private apply(file: TFile, text: string): void {
		if (!isMarkdown(file)) return;
		this.generations.delete(file.path);
		const old = this.index.get(file.path);
		let item: Item | null = null;
		try {
			item = parseItem(text, file.path);
		} catch {
			item = null;
		}
		if (item) this.index.update(item);
		else this.index.remove(file.path);
		if (item || old) {
			if (!item || !old || JSON.stringify(item) !== JSON.stringify(old)) this.changed();
		}
	}

	private renamed(file: TAbstractFile, oldPath: string): void {
		if (file instanceof TFolder) {
			this.removeUnder(oldPath);
			for (const child of markdownFilesIn(file)) void this.read(child);
		} else {
			this.remove(oldPath);
			void this.read(file);
		}
	}

	private deleted(file: TAbstractFile): void {
		const removed = file instanceof TFolder ? this.removeUnder(file.path) : this.remove(file.path);
		const markdown = file instanceof TFolder || (file instanceof TFile && isMarkdown(file));
		if (markdown) this.changed();
		if (removed || (this.building && markdown)) for (const listener of [...this.deleteListeners]) listener();
	}

	/** Drops a path from the index and cancels any read pending for it. Whether it was indexed. */
	private remove(path: string): boolean {
		this.generations.delete(path);
		window.clearTimeout(this.editTimers.get(path));
		this.editTimers.delete(path);
		window.clearTimeout(this.recentEdits.get(path)?.timer);
		this.recentEdits.delete(path);
		const had = this.index.get(path) !== undefined;
		this.index.remove(path);
		if (had) this.changed();
		return had;
	}

	/** Drops every path under a folder. Whether any was indexed. */
	private removeUnder(folder: string): boolean {
		const prefix = `${folder}/`;
		let removed = false;
		for (const path of [...this.index.items.keys(), ...this.generations.keys()]) {
			if (path.startsWith(prefix) && this.remove(path)) removed = true;
		}
		return removed;
	}
}

function isMarkdown(file: TFile): boolean {
	return file.extension.toLowerCase() === "md";
}

function markdownFilesIn(folder: TFolder): TFile[] {
	return folder.children.flatMap((child) => {
		if (child instanceof TFolder) return markdownFilesIn(child);
		return child instanceof TFile && isMarkdown(child) ? [child] : [];
	});
}
