import { type App, Modal } from "obsidian";
import { isValidTagName, readTag, type Tag } from "../core/model/tag";
import { element } from "./header/dom";
import { fileCount } from "./tagEdits";

/** The new name a rename modal's text would give: valid, not the tag's name as it is, and not under the tag's own path; null otherwise. */
export function renamedTag(tag: Tag, text: string): Tag | null {
	const typed = text.trim();
	const to = isValidTagName(typed) ? readTag(typed) : null;
	return to !== null && to.name !== tag.name && !to.path.startsWith(`${tag.path}/`) ? to : null;
}

/** Asks for a tag's new name: Cancel or Rename. Rename waits for a valid name that differs; Enter submits. */
export class RenameTagModal extends Modal {
	constructor(
		app: App,
		private readonly tag: Tag,
		private readonly files: number,
		private readonly submit: (to: Tag) => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const doc = this.contentEl.ownerDocument;
		this.modalEl.classList.add("ta-da-completion-modal");
		this.titleEl.setText(`Rename “${this.tag.name}”`);
		const label = this.contentEl.appendChild(element(doc, "label", "ta-da-tag-field"));
		label.appendChild(element(doc, "span", "ta-da-tag-field-label", "New name"));
		const input = label.appendChild(element(doc, "input", "ta-da-tag-input", undefined, { type: "text", spellcheck: "false" }));
		input.value = this.tag.name;
		this.contentEl.appendChild(element(doc, "p", "ta-da-completion-message", `Changes ${fileCount(this.files)}, including child tags. This can’t be undone.`));
		const buttons = this.contentEl.appendChild(element(doc, "div", "ta-da-completion-buttons"));
		const cancel = buttons.appendChild(element(doc, "button", "", "Cancel", { type: "button" }));
		cancel.addEventListener("click", () => this.close());
		buttons.appendChild(element(doc, "span", "ta-da-grow"));
		const rename = buttons.appendChild(element(doc, "button", "mod-cta", "Rename", { type: "button" }));
		const go = (): void => {
			const to = renamedTag(this.tag, input.value);
			if (to === null) return;
			this.close();
			this.submit(to);
		};
		const sync = (): void => {
			rename.disabled = renamedTag(this.tag, input.value) === null;
		};
		sync();
		input.addEventListener("input", sync);
		input.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || event.isComposing) return;
			event.preventDefault();
			go();
		});
		rename.addEventListener("click", go);
		this.contentEl.win.setTimeout(() => {
			input.focus();
			input.select();
		});
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}

/** The question before deleting a tag: what goes with it, then Cancel or Delete. */
export class DeleteTagModal extends Modal {
	constructor(
		app: App,
		private readonly tag: Tag,
		private readonly files: number,
		private readonly confirm: () => void,
	) {
		super(app);
	}

	override onOpen(): void {
		const doc = this.contentEl.ownerDocument;
		this.modalEl.classList.add("ta-da-completion-modal");
		this.titleEl.setText(`Delete “${this.tag.name}”?`);
		this.contentEl.appendChild(element(doc, "p", "ta-da-completion-message", `Removes it and its child tags from ${fileCount(this.files)}. This can’t be undone.`));
		const buttons = this.contentEl.appendChild(element(doc, "div", "ta-da-completion-buttons"));
		const cancel = buttons.appendChild(element(doc, "button", "", "Cancel", { type: "button" }));
		cancel.addEventListener("click", () => this.close());
		buttons.appendChild(element(doc, "span", "ta-da-grow"));
		const remove = buttons.appendChild(element(doc, "button", "mod-warning", "Delete", { type: "button" }));
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
