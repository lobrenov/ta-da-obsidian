import { type App, Notice, type TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import type { Item } from "../core/model/item";
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
} from "../core/writing/statusRules";
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

	/** Completes an open file or reopens a closed one. */
	toggle(file: TFile): void {
		const item = this.index.get(file.path);
		if (item) this.run(planToggle(this.index, item));
	}

	private run(plan: StatusPlan): void {
		if ("ask" in plan) this.ask(plan.ask);
		else this.apply(plan.changes);
	}

	private ask(question: CompletionQuestion): void {
		new CompletionModal(this.app, question, (tasksAs: ClosedStatus) => this.apply(planAnswer(this.index, question, tasksAs))).open();
	}

	private apply(changes: StatusChange[]): void {
		for (const change of changes) {
			const file = this.app.vault.getFileByPath(change.path);
			if (file) applyStatus(this.writer, file, change.status, this.today());
			else new Notice(`Couldn't set the status: “${change.path}” isn't in the vault.`);
		}
	}
}

/** The item at the file's path when it's a task or project, for commands that only apply to those. */
export function statusItem(index: VaultIndex, file: TFile): Item | null {
	const item = index.get(file.path);
	const kind = item?.properties.kind;
	return item && (kind === "task" || kind === "project") ? item : null;
}
