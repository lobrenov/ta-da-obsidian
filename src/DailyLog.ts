import { type App, Notice } from "obsidian";
import { filesToLog, loggedProjectsWithOpenTasks, reopenedLogged } from "./core/index/logQueries";
import { byTitle, type VaultIndex } from "./core/index/vaultIndex";
import type { Item } from "./core/model/item";
import type { LocalDate } from "./core/model/localDate";
import { isClosed } from "./core/model/status";
import type { ClosedStatus } from "./core/writing/statusRules";
import { Logbook, unlogMessage } from "./Logbook";
import { CompletionModal } from "./ui/CompletionModal";
import type { StatusActions } from "./ui/statusActions";

/** The part of the settings the run keeps its day in. */
export interface LastLogged {
	lastLogged: LocalDate | null;
	setLastLogged(day: LocalDate): Promise<void>;
}

const paths = (items: Item[]): string[] => items.map((item) => item.path);

/**
 * Logging as Ta Da's `logIfDue` and Log Now do: the daily run, which logs the files completed before today, puts back
 * reopened logged files and puts back logged projects with open tasks as Doing; and Log Now, which logs every
 * completed file.
 */
export class DailyLog {
	private running = false;

	constructor(
		private readonly app: App,
		private readonly index: VaultIndex,
		private readonly logbook: Logbook,
		private readonly status: StatusActions,
		private readonly settings: LastLogged,
		private readonly today: () => LocalDate,
	) {}

	/**
	 * Runs when the last logged day isn't today, and not while it's already running. Each step reads the index as the
	 * step before left it, and a failed step doesn't stop the next. The day is kept only when all three succeed, so a
	 * failure is tried again at the next open or day change.
	 */
	async logIfDue(): Promise<void> {
		const day = this.today();
		if (this.running || this.settings.lastLogged?.equals(day)) return;
		this.running = true;
		try {
			let succeeded = await this.step("log the files", async () => void (await this.logbook.log(paths(filesToLog(this.index, day)), day)));
			succeeded = (await this.step("put back the reopened files", () => this.putBack(paths(reopenedLogged(this.index)), []))) && succeeded;
			const waiting = paths(loggedProjectsWithOpenTasks(this.index));
			succeeded = (await this.step("put back the projects with open tasks", () => this.putBack(waiting, waiting))) && succeeded;
			if (succeeded) await this.settings.setLastLogged(day);
		} finally {
			this.running = false;
		}
	}

	/** Logs every completed file. A completed project that still has open tasks asks first, and logging goes on once it's answered. */
	async logNow(): Promise<void> {
		const project = this.index.projects
			.filter((item) => isClosed(item.properties.status) && this.index.openTasksIn(item).length > 0)
			.sort(byTitle)[0];
		if (!project) {
			await this.step("log the files", async () => void (await this.logbook.log(paths(filesToLog(this.index, null)))));
			return;
		}
		const tasks = this.index.openTasksIn(project);
		const question = { project, status: project.properties.status as ClosedStatus, tasks };
		new CompletionModal(this.app, question, (tasksAs) => {
			void this.status
				.answer(question, tasksAs)
				.then((changed) => this.logbook.reread(changed))
				.then(() => this.step("log the files", async () => void (await this.logbook.log(paths(filesToLog(this.index, null))))));
		}).open();
	}

	private async putBack(files: string[], doing: string[]): Promise<void> {
		if (files.length === 0) return;
		const { failed } = await this.logbook.unlog({ paths: files, doing });
		if (failed) throw new Error(unlogMessage(failed));
	}

	/** Runs a step; a failure shows a notice and returns false. */
	private async step(action: string, run: () => Promise<void>): Promise<boolean> {
		try {
			await run();
			return true;
		} catch (error) {
			new Notice(`Couldn't ${action}: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		}
	}
}
