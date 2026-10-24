import { type App, Modal } from "obsidian";
import {
	type ClosedStatus,
	type CompletionQuestion,
	questionButton,
	questionMessage,
	questionTitle,
} from "../core/writing/statusRules";
import { element, statusBox } from "./header/dom";
import { statusLabel } from "./header/headerModel";

/**
 * The question for closing a project that has open tasks: close its tasks with it as Done or Cancelled, with the
 * project's own status first, or Cancel to change nothing.
 */
export class CompletionModal extends Modal {
	constructor(
		app: App,
		private readonly question: CompletionQuestion,
		private readonly answer: (tasksAs: ClosedStatus) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const doc = this.contentEl.ownerDocument;
		const { question } = this;
		this.modalEl.classList.add("ta-da-completion-modal");
		this.titleEl.setText(questionTitle(question));
		this.contentEl.appendChild(element(doc, "p", "ta-da-completion-message", questionMessage(question)));
		const list = this.contentEl.appendChild(element(doc, "div", "ta-da-completion-tasks"));
		for (const task of question.tasks) {
			const row = list.appendChild(element(doc, "div", "ta-da-completion-task"));
			row.appendChild(statusBox(doc, task.properties.status));
			row.appendChild(element(doc, "span", "ta-da-completion-title", task.title));
			row.appendChild(element(doc, "span", "ta-da-completion-status", statusLabel(task.properties.status)));
		}
		const own: ClosedStatus = question.status;
		const other: ClosedStatus = own === "Done" ? "Cancelled" : "Done";
		const buttons = this.contentEl.appendChild(element(doc, "div", "ta-da-completion-buttons"));
		const cancel = buttons.appendChild(element(doc, "button", "", "Cancel", { type: "button" }));
		cancel.addEventListener("click", () => this.close());
		buttons.appendChild(element(doc, "span", "ta-da-grow"));
		for (const [status, primary] of [[other, false], [own, true]] as const) {
			const button = buttons.appendChild(element(doc, "button", primary ? "mod-cta" : "", questionButton(question, status), { type: "button" }));
			button.addEventListener("click", () => {
				this.close();
				this.answer(status);
			});
			// After `Modal.open`, which focuses the first button once `onOpen` returns.
			if (primary) this.contentEl.win.setTimeout(() => button.focus());
		}
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
