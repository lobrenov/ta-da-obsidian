import { type App, Modal, Notice } from "obsidian";
import { type Kind, titleOfPath } from "../../core/model/item";
import { readTag, uniqueTags } from "../../core/model/tag";
import { parseItem } from "../../core/parsing/parseItem";
import { sanitise } from "../../core/writing/fileNaming";
import { changingKind, draftText, type QuickEntryDraft } from "../../core/writing/quickEntryDraft";
import { buildChip, buildTag } from "../header/buildHeader";
import { element, icon } from "../header/dom";
import { buildHeaderModel, type Chip, type TagChip } from "../header/headerModel";
import { openDatePicker, openParentPicker, openStatusMenu, openTagPicker, type PickerHost } from "../header/pickers";
import { createIn } from "../../vaultFiles";
import { placeDraft } from "./place";

const kinds: readonly Kind[] = ["task", "project", "area"];
const quickEntryPath = "Quick Entry";

/**
 * Makes a new task, project or area, as the Mac's Quick Entry: the type switch, the title, the header's chips and
 * Tags row, and the file it will write. The chips' menus change the draft; nothing is written until Create.
 */
export class NewTaskModal extends Modal {
	private draft: QuickEntryDraft;
	private switchEl!: HTMLElement;
	private titleInput!: HTMLInputElement;
	private chipsEl!: HTMLElement;
	private fileEl!: HTMLElement;
	private createButton!: HTMLButtonElement;
	private creating = false;

	constructor(
		app: App,
		private readonly host: PickerHost,
		initial: QuickEntryDraft,
	) {
		super(app);
		this.draft = initial;
	}

	override onOpen(): void {
		const doc = this.contentEl.ownerDocument;
		this.modalEl.classList.add("ta-da-new-modal");
		this.switchEl = element(doc, "div", "ta-da-new-switch", undefined, { role: "group", "aria-label": "Type" });
		this.titleInput = element(doc, "input", "ta-da-new-title", undefined, { type: "text", "aria-label": "Title" });
		this.titleInput.value = this.draft.title;
		this.titleInput.addEventListener("input", () => {
			this.draft.title = this.titleInput.value;
			this.drawFile();
		});
		this.titleInput.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || event.isComposing) return;
			event.preventDefault();
			void this.create();
		});
		this.chipsEl = element(doc, "div", "ta-da-header ta-da-new-header");
		this.fileEl = element(doc, "div", "ta-da-new-file");
		const footer = element(doc, "div", "ta-da-new-footer");
		footer.appendChild(element(doc, "span", "ta-da-grow"));
		const cancel = footer.appendChild(element(doc, "button", "", "Cancel", { type: "button" }));
		cancel.addEventListener("click", () => this.close());
		this.createButton = footer.appendChild(element(doc, "button", "mod-cta", "Create", { type: "button" }));
		this.createButton.addEventListener("click", () => void this.create());

		this.contentEl.append(this.switchEl, this.titleInput, this.chipsEl, this.fileEl, footer);
		this.draw();
		// After `Modal.open`, which focuses the first button once `onOpen` returns.
		this.contentEl.win.setTimeout(() => this.titleInput.focus());
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private change(change: (draft: QuickEntryDraft) => void): void {
		change(this.draft);
		this.draw();
		// After `Modal.open`, which focuses the first button once `onOpen` returns.
		this.contentEl.win.setTimeout(() => this.titleInput.focus());
	}

	private draw(): void {
		this.titleEl.setText(`New ${this.draft.kind}`);
		this.titleInput.placeholder = `New ${this.draft.kind}`;
		this.drawSwitch();
		this.drawHeader();
		this.drawFile();
	}

	private drawSwitch(): void {
		const doc = this.contentEl.ownerDocument;
		this.switchEl.replaceChildren();
		for (const kind of kinds) {
			const on = this.draft.kind === kind;
			const button = element(doc, "button", `ta-da-new-kind${on ? " is-on" : ""}`, kind.slice(0, 1).toUpperCase() + kind.slice(1), {
				type: "button",
				"aria-pressed": String(on),
			});
			button.addEventListener("click", () => {
				this.draft = changingKind(this.draft, kind);
				this.draw();
				this.titleInput.focus();
			});
			this.switchEl.appendChild(button);
		}
	}

	/** The chips and tags of the draft as the header draws a file. */
	private drawHeader(): void {
		const doc = this.contentEl.ownerDocument;
		const item = parseItem(draftText(this.draft, this.host.today()), quickEntryPath);
		const model = item ? buildHeaderModel(item, this.host.index, this.host.today()) : null;
		const chips: Chip[] = model?.chips ?? [];
		const tags: TagChip[] = this.draft.tags.map((tag) => ({ name: tag.name, inFrontmatter: true }));
		const actions = {
			openStatus: (anchor: HTMLElement) =>
				openStatusMenu(anchor, this.draft.kind, this.draft.status, (status) => this.change((draft) => (draft.status = status))),
			openParent: (anchor: HTMLElement) =>
				openParentPicker(this.host, this.draft.kind, this.draft.parent, anchor, (parent) => this.change((draft) => (draft.parent = parent))),
			openDate: (key: "dueDate" | "deadline", anchor: HTMLElement) =>
				openDatePicker(this.host, key, this.draft[key], anchor, (date) => this.change((draft) => (draft[key] = date))),
			removeTag: (name: string) => this.change((draft) => (draft.tags = draft.tags.filter((tag) => tag.path !== readTag(name)?.path))),
		};

		const inner = element(doc, "div", "ta-da-header-inner");
		if (chips.length > 0) {
			const row = inner.appendChild(element(doc, "div", "ta-da-header-chips"));
			for (const chip of chips) row.appendChild(buildChip(doc, chip, actions));
		}
		const tagRow = inner.appendChild(element(doc, "div", "ta-da-header-tags"));
		for (const tag of tags) tagRow.appendChild(buildTag(doc, tag, actions));
		const add = tagRow.appendChild(element(doc, "button", "ta-da-tag-add", undefined, { type: "button", "aria-label": "Add tag", "aria-haspopup": "menu" }));
		add.appendChild(icon(doc, "plus", 11, 2.4));
		add.addEventListener("click", () =>
			openTagPicker(
				this.host,
				this.draft.tags.map((tag) => tag.name),
				add,
				(choice) =>
					this.change((draft) => {
						const tag = readTag(choice.name);
						if (!tag) return;
						draft.tags = choice.current ? draft.tags.filter((existing) => existing.path !== tag.path) : uniqueTags([...draft.tags, tag]);
					}),
			),
		);
		this.chipsEl.replaceChildren(inner);
	}

	/** The file it will write, and a warning when its name is taken and gets a number. */
	private drawFile(): void {
		const doc = this.contentEl.ownerDocument;
		const canCreate = this.draft.title.trim() !== "";
		this.createButton.disabled = !canCreate;
		this.fileEl.replaceChildren();
		if (!canCreate) return;
		const placement = this.place();
		const line = this.fileEl.appendChild(element(doc, "div", "ta-da-new-path"));
		line.appendChild(icon(doc, "file", 12));
		line.appendChild(element(doc, "span", "", placement.path));
		if (placement.numbered) {
			const warning = this.fileEl.appendChild(element(doc, "div", "ta-da-new-warning"));
			warning.appendChild(icon(doc, "alert", 13));
			warning.appendChild(element(doc, "span", "", `There's already a ${this.draft.kind} called ${sanitise(this.draft.title)}. This one will be ${titleOfPath(placement.path)}.`));
		}
	}

	private place(): ReturnType<typeof placeDraft> {
		const { vault } = this.app;
		const folder = vault.getFolderByPath(placeDraft(this.draft, [], []).folder);
		const folderNames = (folder?.children ?? []).map((child) => child.name);
		const projectNames: string[] = [];
		for (const item of this.host.index.items.values()) {
			if (item.properties.kind === "project") projectNames.push(item.path.slice(item.path.lastIndexOf("/") + 1));
		}
		return placeDraft(this.draft, folderNames, projectNames);
	}

	private async create(): Promise<void> {
		if (this.draft.title.trim() === "" || this.creating) return;
		this.creating = true;
		this.createButton.disabled = true;
		const { vault, workspace } = this.app;
		const placement = this.place();
		try {
			const file = await createIn(vault, placement.folder, placement.path, draftText(this.draft, this.host.today()));
			this.close();
			await workspace.getLeaf(false).openFile(file);
		} catch (error) {
			new Notice(`Couldn't create the file: ${error instanceof Error ? error.message : String(error)}`);
			this.creating = false;
			this.draw();
		}
	}
}
