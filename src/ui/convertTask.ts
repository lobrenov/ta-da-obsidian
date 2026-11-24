import { type App, Notice, type TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import { titleOfPath } from "../core/model/item";
import type { LocalDate } from "../core/model/localDate";
import type { Status } from "../core/model/status";
import { splitFrontmatter } from "../core/parsing/frontmatterSplitter";
import { filename } from "../core/writing/fileNaming";
import { text as convertedText } from "../core/writing/noteConversion";
import type { Parent } from "../core/writing/parent";
import { type Extract, extractAll, taskText } from "../core/writing/subtaskExtraction";
import { projectFolder } from "../core/storage/vault";
import { createTask, ensureFolder, message } from "../vaultFiles";
import type { Writer } from "../Writer";

/** What Convert to project needs from the plugin. */
export interface ConvertHost {
	app: App;
	index: VaultIndex;
	writer: Writer;
	today: () => LocalDate;
}

/** What the Convert to project modal asks. */
export interface ConvertChoice {
	status: Status;
	area: Parent | null;
	/** Make each of the task's subtasks a task under the project. */
	extractSubtasks: boolean;
}

/** How many subtasks `text`'s body has that converting could make tasks. */
export const subtaskCount = (text: string): number => extractAll(splitFrontmatter(text).body).extracts.length;

/** The modal's starting choice for the task at `path`: its status, and its area, or its project's. */
export function convertDefaults(index: VaultIndex, path: string): Pick<ConvertChoice, "status" | "area"> | null {
	const item = index.get(path);
	if (item?.properties.kind !== "task") return null;
	const parent = index.parentOf(item);
	const area = parent?.properties.kind === "project" ? index.parentOf(parent) : parent;
	return { status: item.properties.status, area: area ? { kind: "area", title: area.title } : null };
}

/** Where the task's file moves: the projects folder, its name numbered against that folder and every project's title, live or logged. */
export function projectPath({ app, index }: Pick<ConvertHost, "app" | "index">, file: TFile): string {
	const names = [...(app.vault.getFolderByPath(projectFolder)?.children ?? []).map((child) => child.name), ...index.projectFilenames(file.path)];
	return `${projectFolder}/${filename(file.basename, names)}`;
}

/**
 * Convert to project: the task's frontmatter is rewritten as a project's, then the file moves into the projects folder,
 * numbered against every project's title; the move failing puts the text back. Only once it has moved does each subtask
 * become a task under the project (when `extractSubtasks`), and only once every task is made do their lines leave the
 * project's file, as one edit through the `Writer`. Resolves to whether the file is now a project.
 */
export async function convertToProject(host: ConvertHost, file: TFile, choice: ConvertChoice): Promise<boolean> {
	const { app, writer } = host;
	const { vault } = app;
	const title = file.basename;
	const today = host.today();
	let original = "";
	let converted = "";
	try {
		await writer.apply(file, (current) => {
			original = current;
			converted = convertedText(current, "project", choice.status, choice.area, today);
			return converted;
		});
	} catch (error) {
		new Notice(`Couldn't convert “${title}” to a project: ${message(error)}`);
		return false;
	}

	try {
		await ensureFolder(vault, projectFolder);
		await app.fileManager.renameFile(file, projectPath(host, file));
	} catch (error) {
		const restored = await writer.apply(file, (current) => (current === converted ? original : null)).then(
			(done) => (done ? "It's still a task." : "Its file was changed to a project but not moved."),
			(failure: unknown) => `Its file was changed to a project but not moved, and putting it back failed: ${message(failure)}`,
		);
		new Notice(`Couldn't convert “${title}” to a project: ${message(error)} ${restored}`);
		return false;
	}

	if (choice.extractSubtasks) await extractSubtasks(host, file);
	return true;
}

/** Makes each subtask in the project's body a task under it; once they're all made, their lines leave its file. A failure part way removes only the lines of the tasks made. */
async function extractSubtasks(host: ConvertHost, file: TFile): Promise<void> {
	const { vault } = host.app;
	const project = titleOfPath(file.path);
	const split = splitFrontmatter(await host.writer.read(file));
	const { extracts } = extractAll(split.body);
	if (extracts.length === 0) return;
	const key = (list: Extract[]): string => JSON.stringify(list.map(({ title, status, body }) => [title, status, body]));
	/** Removes the lines of the first `count` subtasks, unless the file's subtasks changed since they were read. */
	const removeLines = (count: number): Promise<boolean> =>
		host.writer.apply(file, (current) => {
			const now = splitFrontmatter(current);
			const found = extractAll(now.body).extracts;
			if (key(found) !== key(extracts)) return null;
			let body = now.body;
			for (const { range } of found.slice(0, count)) body = body.slice(0, range[0]) + body.slice(range[0] + range[1]);
			return now.block + body;
		});

	let made = 0;
	try {
		for (const found of extracts) {
			await createTask(vault, found.title, taskText(found, project, null, host.today()));
			made++;
		}
	} catch (error) {
		if (made === 0) {
			new Notice(`Couldn't make the subtasks of “${project}” its tasks: ${message(error)} They stay in its file.`);
			return;
		}
		const cause = message(error);
		const reason = `Couldn't make the subtasks of “${project}” its tasks: ${cause.endsWith(".") ? cause : `${cause}.`}`;
		const tasks = made === 1 ? "1 task was" : `${made} tasks were`;
		const left = await removeLines(made).then(
			(removed) => (removed ? "only their lines left its file." : "but its file changed meanwhile, so their lines are still in it."),
			(failure: unknown) => `but their lines couldn't be removed: ${message(failure)}`,
		);
		new Notice(`${reason} ${tasks} made, ${left}`);
		return;
	}
	try {
		const removed = await removeLines(made);
		if (!removed) new Notice(`The subtasks of “${project}” were made tasks, but its file changed meanwhile, so they're still in it.`);
	} catch (error) {
		new Notice(`The subtasks of “${project}” were made tasks, but their lines couldn't be removed: ${message(error)}`);
	}
}
