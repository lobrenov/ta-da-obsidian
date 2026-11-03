import { type App, type TFile } from "obsidian";
import { VaultIndex } from "./core/index/vaultIndex";
import type { LocalDate } from "./core/model/localDate";
import { isLogged, titleOfPath } from "./core/model/item";
import { isClosed } from "./core/model/status";
import { parseItem } from "./core/parsing/parseItem";
import { folderOf } from "./core/storage/vault";
import { planLog, type LogPlan } from "./core/writing/log";
import type { UnlogRequest } from "./core/writing/statusRules";
import { moveName, planUnlog, relinkEdit, resolveRelinks, type FileMove, type ProjectRelink } from "./core/writing/unlog";
import { applyStatus } from "./ui/navigator/actions";
import type { Writer } from "./Writer";

/** Why a put-back stopped: the file it was moving, and the error. */
export interface UnlogFailure {
	path: string;
	error: Error;
}

/**
 * Applies the core's logging and put-back plans to the vault: folders through the vault, names picked from the folder's
 * names just before each `FileManager.renameFile` (so links follow, and a name another device took meanwhile is
 * numbered), text edits through `Writer`. Files it changes are read back into the index, so the next step sees them.
 */
export class Logbook {
	constructor(
		private readonly app: App,
		private readonly index: VaultIndex,
		private readonly writer: Writer,
		private readonly today: () => LocalDate,
		/** Takes a file's current text into the index. */
		private readonly sync: (file: TFile, text: string) => void = (file, text) => {
			const item = parseItem(text, file.path);
			if (item) index.update(item);
			else index.remove(file.path);
		},
	) {}

	/**
	 * Logs `paths`. A file no longer at its path is skipped; a repeating task moves forward in place, and is logged
	 * when that edit leaves it Done or Cancelled. A file that can't be moved doesn't stop the rest. Throws the first error
	 * only when nothing moved and nothing moved forward. Returns each moved file's new path by its old one.
	 */
	async log(paths: string[], today: LocalDate = this.today()): Promise<Record<string, string>> {
		if (paths.length === 0) return {};
		const plan = planLog(this.index, paths, today, (folder) => this.childrenOf(folder));
		const moved = new Map<string, string>();
		const named = new Set<string>();
		let rolled = false;
		let firstError: unknown;
		const edited: string[] = [];
		const stayed: string[] = [];
		for (const { path, edit } of plan.forward) {
			const file = this.app.vault.getFileByPath(path);
			if (!file) continue;
			try {
				let result: string | null = null;
				await this.writer.apply(file, (text) => (result = edit(text)));
				edited.push(path);
				const status = result === null ? undefined : parseItem(result, path)?.properties.status;
				if (status !== undefined && !isClosed(status)) rolled = true;
				else stayed.push(path);
			} catch (error) {
				if (await this.exists(path)) firstError ??= error;
			}
		}
		await this.reread(edited);
		const again: LogPlan[] = stayed.map((path) => planLog(this.index, [path], today, (folder) => this.childrenOf(folder)));
		const moves: FileMove[] = [...plan.moves, ...again.flatMap((replanned) => replanned.moves)];
		for (const move of moves) {
			const file = this.app.vault.getFileByPath(move.from);
			if (!file || !(await this.stillCompleted(move.from))) continue;
			try {
				moved.set(move.from, await this.moveFile(file, move, named));
			} catch (error) {
				if (await this.exists(move.from)) firstError ??= error;
			}
		}
		if (firstError !== undefined && moved.size === 0 && !rolled) throw firstError instanceof Error ? firstError : new Error(String(firstError));
		const relinks: ProjectRelink[] = [...plan.relinks, ...again.flatMap((replanned) => replanned.relinks)];
		const relinked = await this.relink(relinks, moved);
		await this.reread([...moved.values(), ...relinked]);
		return Object.fromEntries(moved);
	}

	/**
	 * Puts logged files back and sets `request.doing` (and each task's logged project) to Doing. The first file that
	 * can't be moved ends the moves; the files before it still get their Doing and links.
	 */
	async unlog(request: UnlogRequest): Promise<{ moved: Map<string, string>; failed: UnlogFailure | null }> {
		const plan = planUnlog(this.index, request.paths, (folder) => this.childrenOf(folder), request.doing);
		const moved = new Map<string, string>();
		const named = new Set<string>();
		let failed: UnlogFailure | null = null;
		for (const move of plan.moves) {
			const file = this.app.vault.getFileByPath(move.from);
			const item = this.index.get(move.from);
			if (!file || !item || !isLogged(item)) continue;
			try {
				moved.set(move.from, await this.moveFile(file, move, named));
			} catch (error) {
				if (!(await this.exists(move.from))) continue;
				failed = { path: move.from, error: error instanceof Error ? error : new Error(String(error)) };
				break;
			}
		}
		const settled = plan.moves.flatMap((move) => (plan.doing.includes(move.to) && moved.has(move.from) ? [moved.get(move.from) as string] : []));
		await this.reread([...moved.values()]);
		for (const path of settled) {
			const file = this.app.vault.getFileByPath(path);
			if (file) await applyStatus(this.writer, file, "Doing", this.today());
		}
		const relinked = await this.relink(plan.relinks, moved);
		await this.reread([...settled, ...relinked]);
		return { moved, failed };
	}

	/** Whether a file is still there to move; another logger may have moved it. */
	private exists(path: string): Promise<boolean> {
		return this.app.vault.adapter.exists(path);
	}

	/** Whether the file at `path`, as it is now, is still a live Done or Cancelled task or project: a reopen since the plan stops its move. */
	private async stillCompleted(path: string): Promise<boolean> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) return false;
		try {
			const item = parseItem(await this.writer.read(file), path);
			return item !== null && !isLogged(item) && isClosed(item.properties.status);
		} catch {
			return false;
		}
	}

	/** Moves a file into the folder of its planned destination, under the name that folder allows now. Returns the new path. */
	private async moveFile(file: TFile, move: FileMove, named: Set<string>): Promise<string> {
		const item = this.index.get(move.from);
		if (!item) throw new Error("it isn't in the index");
		const folder = folderOf(move.to);
		await this.ensureFolder(folder);
		const name = moveName(item, this.childrenOf(folder), named, this.index.projectFilenames(item.path));
		const to = `${folder}/${name}`;
		await this.app.fileManager.renameFile(file, to);
		if (item.properties.kind === "project") named.add(name);
		return to;
	}

	/** Points the links of the moved projects' tasks at their new titles. Returns the paths changed. */
	private async relink(relinks: ProjectRelink[], moved: ReadonlyMap<string, string>): Promise<string[]> {
		const changed: string[] = [];
		for (const { path, from, to } of resolveRelinks(relinks, moved)) {
			const file = this.app.vault.getFileByPath(path);
			if (!file) continue;
			if (await this.writer.apply(file, relinkEdit(path, from, to)).catch(() => false)) changed.push(path);
		}
		return changed;
	}

	/** Reads the files at `paths` into the index; a path no longer in the vault leaves it. */
	async reread(paths: string[]): Promise<void> {
		for (const path of paths) {
			const file = this.app.vault.getFileByPath(path);
			if (!file) {
				this.index.remove(path);
				continue;
			}
			try {
				this.sync(file, await this.writer.read(file));
			} catch {
				// The file's own change events bring the index up to date.
			}
		}
	}

	private childrenOf(folder: string): string[] {
		return this.app.vault.getFolderByPath(folder)?.children.map((child) => child.name) ?? [];
	}

	private async ensureFolder(folder: string): Promise<void> {
		let path = "";
		for (const part of folder.split("/")) {
			path = path === "" ? part : `${path}/${part}`;
			if (!this.app.vault.getFolderByPath(path)) await this.app.vault.createFolder(path);
		}
	}
}

/** The message for a put-back that stopped. */
export function unlogMessage(failure: UnlogFailure): string {
	return `Couldn't put “${titleOfPath(failure.path)}” back: ${failure.error.message}`;
}
