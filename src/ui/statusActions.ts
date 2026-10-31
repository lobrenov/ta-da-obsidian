import { type App, Notice, type TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import { type Item, titleOfPath } from "../core/model/item";
import type { LocalDate } from "../core/model/localDate";
import type { Status } from "../core/model/status";
import {
	type ClosedStatus,
	type CompletionQuestion,
	planAnswer,
	planStatus,
	planToggle,
	type StatusChange,
	type StatusPlan,
	type UnlogRequest,
} from "../core/writing/statusRules";
import { planUnlog, relinkEdit } from "../core/writing/unlog";
import { folderOf } from "../core/storage/vault";
import type { Writer } from "../Writer";
import { applyStatus } from "./navigator/actions";
import { CompletionModal } from "./CompletionModal";

/**
 * Every status change the plugin makes goes through here, so the apps' rules hold wherever it's set: the header, the
 * commands, the navigator's checkbox and menu, and Complete.
 */
export class StatusActions {
	constructor(
		private readonly app: App,
		private readonly index: VaultIndex,
		private readonly writer: Writer,
		private readonly today: () => LocalDate,
	) {}

	/** Sets a file's status, asking first when closing a project with open tasks. */
	set(file: TFile, status: Status): void {
		const item = this.index.get(file.path);
		this.run(item ? planStatus(this.index, item, status) : { changes: [{ path: file.path, status }] });
	}

	/**
	 * Sets several files' status: tasks first, then projects, each one after the last is applied and any question answered,
	 * so a project asks only about open tasks that weren't in the set.
	 */
	async setAll(files: TFile[], status: Status): Promise<void> {
		const kindOf = (file: TFile): string | undefined => this.index.get(file.path)?.properties.kind;
		for (const file of [...files.filter((f) => kindOf(f) === "task"), ...files.filter((f) => kindOf(f) !== "task")]) {
			const item = this.index.get(file.path);
			const plan = item ? planStatus(this.index, item, status) : { changes: [{ path: file.path, status }] };
			await this.runAsync("ask" in plan ? withoutSet(plan, files) : plan);
		}
	}

	/** Completes an open file or reopens a closed one. */
	toggle(file: TFile): void {
		const item = this.index.get(file.path);
		if (item) this.run(planToggle(this.index, item));
	}

	private run(plan: StatusPlan): void {
		if ("ask" in plan) this.ask(plan.ask);
		else void this.apply(plan.changes).then(() => (plan.unlog ? this.unlog(plan.unlog) : undefined));
	}

	/** Resolves once the plan is applied, or the question is cancelled. */
	private async runAsync(plan: StatusPlan): Promise<void> {
		if (!("ask" in plan)) {
			await this.apply(plan.changes);
			if (plan.unlog) await this.unlog(plan.unlog);
			return;
		}
		await new Promise<void>((resolve) => {
			let answered = false;
			const { ask } = plan;
			const modal = new CompletionModal(this.app, ask, (tasksAs: ClosedStatus) => {
				answered = true;
				void this.apply(answerChanges(ask, tasksAs)).then(resolve);
			});
			const onClose = modal.onClose.bind(modal);
			modal.onClose = () => {
				onClose();
				queueMicrotask(() => {
					if (!answered) resolve();
				});
			};
			modal.open();
		});
	}

	private ask(question: CompletionQuestion): void {
		new CompletionModal(this.app, question, (tasksAs: ClosedStatus) => void this.apply(planAnswer(this.index, question, tasksAs))).open();
	}

	private async apply(changes: StatusChange[]): Promise<void> {
		for (const change of changes) {
			const file = this.app.vault.getFileByPath(change.path);
			if (file) await applyStatus(this.writer, file, change.status, this.today());
			else new Notice(`Couldn't set the status: “${change.path}” isn't in the vault.`);
		}
	}

	/** Puts logged files back: moves through `FileManager` so links follow, then Doing and the project links at the new paths. */
	private async unlog(request: UnlogRequest): Promise<void> {
		const plan = planUnlog(this.index, request.paths, (folder) => this.filenamesIn(folder), request.doing);
		for (const { from, to } of plan.moves) {
			const file = this.app.vault.getFileByPath(from);
			try {
				if (!file) throw new Error("it isn't in the vault");
				await this.ensureFolder(folderOf(to));
				await this.app.fileManager.renameFile(file, to);
			} catch (error) {
				new Notice(`Couldn't put “${titleOfPath(from)}” back: ${error instanceof Error ? error.message : String(error)}`);
				break;
			}
		}
		const back = plan.doing.filter((path) => this.app.vault.getFileByPath(path));
		await this.apply(back.map((path) => ({ path, status: "Doing" })));
		for (const { path, from, to } of plan.relinks) {
			const file = this.app.vault.getFileByPath(path);
			if (file) await this.writer.apply(file, relinkEdit(path, from, to)).catch(() => undefined);
		}
	}

	private filenamesIn(folder: string): string[] {
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

/** A project's question without the tasks set with it, which the index may not show closed yet; no question when none are left. */
function withoutSet(plan: { ask: CompletionQuestion }, files: TFile[]): StatusPlan {
	const set = new Set(files.map((file) => file.path));
	const tasks = plan.ask.tasks.filter((task) => !set.has(task.path));
	return tasks.length > 0 ? { ask: { ...plan.ask, tasks } } : { changes: [{ path: plan.ask.project.path, status: plan.ask.status }] };
}

/** The project's status, then the question's tasks as `tasksAs`. */
function answerChanges(question: CompletionQuestion, tasksAs: ClosedStatus): StatusChange[] {
	return [{ path: question.project.path, status: question.status }, ...question.tasks.map((task) => ({ path: task.path, status: tasksAs }))];
}

/** The item at the file's path when it's a task or project, for commands that only apply to those. */
export function statusItem(index: VaultIndex, file: TFile): Item | null {
	const item = index.get(file.path);
	const kind = item?.properties.kind;
	return item && (kind === "task" || kind === "project") ? item : null;
}
