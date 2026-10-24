import { type App, type Editor, MarkdownView, normalizePath, type TFile } from "obsidian";
import { lineChange } from "./core/writing/lineChange";
import { filename } from "./core/writing/fileNaming";

/** Computes a file's new text from its current text; null leaves the file alone. */
export type Edit = (text: string) => string | null;

/**
 * Every write to a file's text, one queue per file. A file open in a `MarkdownView` is changed through its `Editor`,
 * as one transaction on the lines that differ, so undo and the cursor hold. Any other file goes through
 * `Vault.process`, guarded on the text the edit was computed against. `processFrontMatter` is never used.
 */
export class Writer {
	private readonly queues = new Map<TFile, Promise<void>>();

	constructor(private readonly app: App) {}

	/** Resolves to whether the file's text changed. */
	apply(file: TFile, edit: Edit): Promise<boolean> {
		return this.enqueue(file, async () => {
			const view = this.openView(file);
			return view ? applyToEditor(view.editor, edit) : this.applyToFile(file, edit);
		});
	}

	/** Renames a file to a title's filename, through `FileManager` so links follow. Resolves to the file's path. */
	rename(file: TFile, title: string): Promise<string> {
		return this.enqueue(file, async () => {
			const folder = file.parent;
			if (!folder) return file.path;
			const names = new Set(folder.children.map((child) => child.name));
			names.delete(file.name);
			const name = filename(title, names, file.extension);
			if (name === file.name) return file.path;
			await this.app.fileManager.renameFile(file, normalizePath(`${folder.path}/${name}`));
			return file.path;
		});
	}

	private enqueue<T>(file: TFile, task: () => Promise<T>): Promise<T> {
		const result = (this.queues.get(file) ?? Promise.resolve()).then(task);
		const tail = result.then(
			() => undefined,
			() => undefined,
		);
		this.queues.set(file, tail);
		void tail.then(() => {
			if (this.queues.get(file) === tail) this.queues.delete(file);
		});
		return result;
	}

	private openView(file: TFile): MarkdownView | null {
		for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
			if (leaf.view instanceof MarkdownView && leaf.view.file === file) return leaf.view;
		}
		return null;
	}

	private async applyToFile(file: TFile, edit: Edit): Promise<boolean> {
		const base = await this.app.vault.read(file);
		const next = edit(base);
		if (next === null || next === base) return false;
		let wrote = false;
		await this.app.vault.process(file, (current) => {
			const text = current === base ? next : edit(current);
			if (text === null || text === current) return current;
			wrote = true;
			return text;
		});
		return wrote;
	}
}

function applyToEditor(editor: Editor, edit: Edit): boolean {
	const before = editor.getValue();
	const after = edit(before);
	if (after === null) return false;
	const change = lineChange(before, after);
	if (!change) return false;
	editor.transaction({ changes: [change] });
	return true;
}
