import { type App, Notice, type TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import { type Item } from "../core/model/item";
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
import { Logbook, unlogMessage } from "../Logbook";
import type { Writer } from "../Writer";
import { CompletionModal } from "./CompletionModal";
import { statusEdit } from "./header/edits";

/**
 * Every status change the plugin makes goes through here, so the apps' rules hold wherever it's set: the header, the
 * commands, the navigator's checkbox and menu, and Complete.
 */
export class StatusActions {
	private readonly logbook: Logbook;

	constructor(
		private readonly app: App,
		private readonly index: VaultIndex,
		private readonly writer: Writer,
		private readonly today: () => LocalDate,
		logbook?: Logbook,
	) {
		this.logbook = logbook ?? new Logbook(app, index, writer, today);
	}

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
		const failures: Failures = { count: 0, reason: null };
		const kindOf = (file: TFile): string | undefined => this.index.get(file.path)?.properties.kind;
		for (const file of [...files.filter((f) => kindOf(f) === "task"), ...files.filter((f) => kindOf(f) !== "task")]) {
			const item = this.index.get(file.path);
			const plan = item ? planStatus(this.index, item, status) : { changes: [{ path: file.path, status }] };
			addFailures(failures, await this.runAsync("ask" in plan ? withoutSet(plan, files) : plan));
		}
		this.report(failures);
	}

	/** Completes an open file or reopens a closed one. */
	toggle(file: TFile): void {
		const item = this.index.get(file.path);
		if (item) this.run(planToggle(this.index, item));
	}

	private run(plan: StatusPlan): void {
		if ("ask" in plan) this.ask(plan.ask);
		else void this.apply(plan.changes).then((failures) => (this.report(failures), plan.unlog ? this.unlog(plan.unlog) : undefined));
	}

	/** Resolves once the plan is applied, or the question is cancelled, to the changes that failed. */
	private async runAsync(plan: StatusPlan): Promise<Failures> {
		if (!("ask" in plan)) {
			const failures = await this.apply(plan.changes);
			if (plan.unlog) await this.unlog(plan.unlog);
			return failures;
		}
		const none: Failures = { count: 0, reason: null };
		return new Promise<Failures>((resolve) => {
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
					if (!answered) resolve(none);
				});
			};
			modal.open();
		});
	}

	private ask(question: CompletionQuestion): void {
		new CompletionModal(this.app, question, (tasksAs: ClosedStatus) => void this.apply(planAnswer(this.index, question, tasksAs)).then((failures) => this.report(failures))).open();
	}

	/** Applies each change, carrying on past one that fails; the failures are returned, not shown. */
	private async apply(changes: StatusChange[]): Promise<Failures> {
		const failures: Failures = { count: 0, reason: null };
		for (const change of changes) {
			const file = this.app.vault.getFileByPath(change.path);
			try {
				if (!file) throw new Error("A file isn't in the vault.");
				await this.writer.apply(file, statusEdit(change.status, file.path, this.today()));
			} catch (error) {
				addFailures(failures, { count: 1, reason: error instanceof Error ? error.message : String(error) });
			}
		}
		return failures;
	}

	/** One notice with how many files failed and the first reason, never their names. */
	private report({ count, reason }: Failures): void {
		if (count > 0) new Notice(`Couldn't set the status of ${count === 1 ? "1 file" : `${count} files`}: ${reason}`);
	}

	/** Puts logged files back through the `Logbook`, so links follow, then Doing and the project links at the new paths. */
	private async unlog(request: UnlogRequest): Promise<void> {
		const { failed } = await this.logbook.unlog(request);
		if (failed) new Notice(unlogMessage(failed));
	}

	/** Answers a question: sets the project and the tasks it has open now. Returns the paths set. */
	async answer(question: CompletionQuestion, tasksAs: ClosedStatus): Promise<string[]> {
		const changes = planAnswer(this.index, question, tasksAs);
		this.report(await this.apply(changes));
		return changes.map((change) => change.path);
	}
}

/** How many status changes failed, and why the first did. */
interface Failures {
	count: number;
	reason: string | null;
}

function addFailures(total: Failures, more: Failures): void {
	total.count += more.count;
	total.reason ??= more.reason;
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
