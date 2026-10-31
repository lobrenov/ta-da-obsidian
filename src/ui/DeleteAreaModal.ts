import { type App, Modal } from "obsidian";
import { element } from "./header/dom";

/** The question before deleting an area: what goes with it, then Cancel or Delete N files. */
export class DeleteAreaModal extends Modal {
	constructor(
		app: App,
		private readonly title: string,
		private readonly message: string,
		private readonly files: number,
		private readonly confirm: () => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const doc = this.contentEl.ownerDocument;
		this.modalEl.classList.add("ta-da-completion-modal");
		this.titleEl.setText(this.title);
		for (const paragraph of this.message.split("\n\n")) this.contentEl.appendChild(element(doc, "p", "ta-da-completion-message", paragraph));
		const buttons = this.contentEl.appendChild(element(doc, "div", "ta-da-completion-buttons"));
		const cancel = buttons.appendChild(element(doc, "button", "", "Cancel", { type: "button" }));
		cancel.addEventListener("click", () => this.close());
		buttons.appendChild(element(doc, "span", "ta-da-grow"));
		const label = this.files === 1 ? "Delete 1 file" : `Delete ${this.files} files`;
		const remove = buttons.appendChild(element(doc, "button", "mod-warning", label, { type: "button" }));
		remove.addEventListener("click", () => {
			this.close();
			this.confirm();
		});
		this.contentEl.win.setTimeout(() => cancel.focus());
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
