import { type App, Notice, type TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import type { LocalDate } from "../core/model/localDate";
import { filename } from "../core/writing/fileNaming";
import { type Extract, extract, taskText } from "../core/writing/subtaskExtraction";
import { taskFolder } from "../core/storage/vault";
import type { Writer } from "../Writer";

/** What Extract to task needs from the plugin. */
export interface ExtractHost {
	app: App;
	index: VaultIndex;
	writer: Writer;
	today: () => LocalDate;
}

const failure = (message: string, error?: unknown): void => {
	new Notice(error === undefined ? message : `${message} ${error instanceof Error ? error.message : String(error)}`);
};

/**
 * Extract to task: the subtask on the line holding `location` in `file`'s `text` becomes a task file, filed under the
 * file when it's a project or area, else under its project or area. Only once that file exists do the subtask's lines
 * leave `file`, as one edit through the `Writer`; a failure to make it leaves `file` alone.
 */
export async function extractSubtask(host: ExtractHost, file: TFile, text: string, location: number): Promise<void> {
	const found = extract(location, text);
	if (!found) return;
	const { vault, workspace } = host.app;
	const item = host.index.get(file.path);
	const parent = item && (item.properties.kind === "project" || item.properties.kind === "area") ? item : item ? host.index.parentOf(item) : null;
	const inProject = parent?.properties.kind === "project";
	const content = taskText(found, inProject ? parent.title : null, parent && !inProject ? parent.title : null, host.today());

	let created: TFile;
	try {
		if (!vault.getFolderByPath(taskFolder)) await vault.createFolder(taskFolder);
		const names = (vault.getFolderByPath(taskFolder)?.children ?? []).map((child) => child.name);
		created = await vault.create(`${taskFolder}/${filename(found.title, names)}`, content);
	} catch (error) {
		failure("Couldn't extract the subtask, so it's still in the file.", error);
		return;
	}

	const removed = await host.writer.apply(file, (current) => removal(current, text, found)).catch(() => false);
	if (!removed) return failure(`“${created.basename}” was made a task, but its subtask changed meanwhile, so its line is still in the file.`);
	const notice = new Notice(`Extracted to a task in ${parent?.title ?? "Loose"}`);
	notice.messageEl.addEventListener("click", () => void workspace.getLeaf(false).openFile(created));
}

/** `current` without the extract's lines, null when they aren't where `text` had them. */
function removal(current: string, text: string, found: Extract): string | null {
	const [start, length] = found.range;
	if (current.slice(start, start + length) !== text.slice(start, start + length)) return null;
	return current.slice(0, start) + current.slice(start + length);
}
