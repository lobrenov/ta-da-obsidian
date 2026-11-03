import { type App, Modal, Notice, type TFile } from "obsidian";
import { titleOfPath } from "../../core/model/item";
import { parseItem } from "../../core/parsing/parseItem";
import { text as convertedText } from "../../core/writing/noteConversion";
import { sanitise } from "../../core/writing/fileNaming";
import { buildChip } from "../header/buildHeader";
import { element, icon } from "../header/dom";
import { buildHeaderModel } from "../header/headerModel";
import { openParentPicker, openStatusMenu, type PickerHost } from "../header/pickers";
import { type ConvertChoice, type ConvertHost, convertDefaults, convertToProject, projectPath, subtaskCount } from "../convertTask";

/**
 * Convert to project, as the Mac's sheet for a task: its status and area as chips, whether its subtasks become the
 * project's tasks, and where the file moves. The chips change the choice; nothing is written until Convert to project.
 */
export class ConvertModal extends Modal {
	private choice: ConvertChoice;
	private chipsEl!: HTMLElement;
	private fileEl!: HTMLElement;

	constructor(
		app: App,
		private readonly host: ConvertHost & PickerHost,
		private readonly file: TFile,
		private readonly text: string,
		defaults: Pick<ConvertChoice, "status" | "area">,
	) {
		super(app);
		this.choice = { ...defaults, extractSubtasks: true };
	}

	override onOpen(): void {
		const doc = this.contentEl.ownerDocument;
		this.modalEl.classList.add("ta-da-new-modal");
		this.containerEl.classList.add("ta-da-top-modal");
		this.titleEl.setText(`Convert “${this.file.basename}” to a project`);
		this.chipsEl = element(doc, "div", "ta-da-header ta-da-new-header");
		this.contentEl.appendChild(this.chipsEl);

		const subtasks = subtaskCount(this.text);
		if (subtasks > 0) {
			const label = element(doc, "label", "ta-da-convert-subtasks");
			const box = label.appendChild(element(doc, "input", "", undefined, { type: "checkbox" }));
			box.checked = this.choice.extractSubtasks;
			box.addEventListener("change", () => (this.choice.extractSubtasks = box.checked));
			label.appendChild(element(doc, "span", "", `Make its ${subtasks === 1 ? "subtask a task" : `${subtasks} subtasks tasks`} under the project`));
			this.contentEl.appendChild(label);
		}

		this.fileEl = this.contentEl.appendChild(element(doc, "div", "ta-da-new-file"));
		const footer = this.contentEl.appendChild(element(doc, "div", "ta-da-new-footer"));
		footer.appendChild(element(doc, "span", "ta-da-grow"));
		const cancel = footer.appendChild(element(doc, "button", "", "Cancel", { type: "button" }));
		cancel.addEventListener("click", () => this.close());
		const convert = footer.appendChild(element(doc, "button", "mod-cta", "Convert to project", { type: "button" }));
		convert.addEventListener("click", () => void this.convert());
		this.draw();
		// After `Modal.open`, which focuses the first button once `onOpen` returns.
		this.contentEl.win.setTimeout(() => convert.focus());
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private change(change: (choice: ConvertChoice) => void): void {
		change(this.choice);
		this.draw();
	}

	/** The status and area chips of the project it will be, and where its file moves. */
	private draw(): void {
		const doc = this.contentEl.ownerDocument;
		const { index } = this.host;
		const today = this.host.today();
		const { status, area } = this.choice;
		const item = parseItem(convertedText(this.text, "project", status, area, today), this.file.path);
		const chips = (item ? buildHeaderModel(item, index, today)?.chips ?? [] : []).filter((chip) => chip.kind === "status" || chip.kind === "parent");
		const actions = {
			openStatus: (anchor: HTMLElement) => openStatusMenu(anchor, "project", status, (picked) => this.change((choice) => (choice.status = picked))),
			openParent: (anchor: HTMLElement) => openParentPicker(this.host, "project", area, anchor, (parent) => this.change((choice) => (choice.area = parent))),
			openDate: () => undefined,
		};
		const inner = element(doc, "div", "ta-da-header-inner");
		const row = inner.appendChild(element(doc, "div", "ta-da-header-chips"));
		for (const chip of chips) row.appendChild(buildChip(doc, chip, actions));
		this.chipsEl.replaceChildren(inner);

		const path = projectPath(this.host, this.file);
		this.fileEl.replaceChildren();
		const line = this.fileEl.appendChild(element(doc, "div", "ta-da-new-path"));
		line.appendChild(icon(doc, "file", 12));
		line.appendChild(element(doc, "span", "", `${this.file.path} moves to ${path}`));
		if (titleOfPath(path) !== sanitise(this.file.basename)) {
			const warning = this.fileEl.appendChild(element(doc, "div", "ta-da-new-warning"));
			warning.appendChild(icon(doc, "alert", 13));
			warning.appendChild(element(doc, "span", "", `There's already a project called ${sanitise(this.file.basename)}. This one will be ${titleOfPath(path)}.`));
		}
	}

	private async convert(): Promise<void> {
		this.close();
		if (await convertToProject(this.host, this.file, this.choice)) await this.app.workspace.getLeaf(false).openFile(this.file);
	}
}

/** Opens Convert to project for a task file, its subtasks counted from its current text. */
export async function openConvertModal(host: ConvertHost & PickerHost, file: TFile): Promise<void> {
	const defaults = convertDefaults(host.index, file.path);
	if (!defaults) return;
	try {
		new ConvertModal(host.app, host, file, await host.writer.read(file), defaults).open();
	} catch (error) {
		new Notice(`Couldn't open Convert to project: ${error instanceof Error ? error.message : String(error)}`);
	}
}
