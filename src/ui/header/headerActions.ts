import { type App, type Modal, Menu, type MenuItem, Notice, Platform, type TFile } from "obsidian";
import type { VaultIndex } from "../../core/index/vaultIndex";
import { LocalDate } from "../../core/model/localDate";
import type { Status } from "../../core/model/status";
import type { Edit, Writer } from "../../Writer";
import type { HeaderActions } from "./buildHeader";
import { parentChoices, tagChoices } from "./choices";
import { element, icon, statusBox } from "./dom";
import { addTagEdit, dateEdit, parentEdit, removeTagEdit, statusEdit } from "./edits";
import { type HeaderModel, statusChoices, statusLabel } from "./headerModel";
import { dayOrderOf, firstWeekdayOf } from "./locale";
import { DateModal, ParentModal, TagModal } from "./modals";

/** What the header needs from the plugin. */
export interface HeaderHost {
	app: App;
	index: VaultIndex;
	writer: Writer;
	today(): LocalDate;
	/** Calls `listener` after the index changes; returns a function that stops it. */
	onIndexChange(listener: () => void): () => void;
	propertiesShown(path: string): boolean;
	/** Flips it for the file and returns the new state. */
	toggleProperties(path: string): boolean;
}

/** The header's actions for one file as the model shows it. Every write goes through `Writer.apply`. */
export function headerActions(host: HeaderHost, file: TFile, model: HeaderModel): HeaderActions {
	const write = (edit: Edit): void => {
		host.writer.apply(file, edit).catch((error: unknown) => {
			new Notice(`Couldn't save the change: ${error instanceof Error ? error.message : String(error)}`);
		});
	};
	/** Opens a modal below the chip that opened it (above when there's no room), with the chip marked `is-open` until it closes. */
	const open = (modal: Modal, anchor: HTMLElement): void => {
		anchor.classList.add("is-open");
		const onClose = modal.onClose.bind(modal);
		modal.onClose = () => {
			onClose();
			anchor.classList.remove("is-open");
		};
		modal.open();
		if (!Platform.isPhone) placeBelow(modal, anchor);
	};

	return {
		openStatus(anchor) {
			const menu = new Menu();
			for (const status of statusChoices(model.kind)) {
				if (status === "Done") menu.addSeparator();
				menu.addItem((item) => {
					item.setTitle(statusLabel(status));
					item.setIcon("circle");
					markStatus(item, status, status === model.status);
					item.onClick(() => write(statusEdit(status, file.path, host.today())));
				});
			}
			anchor.classList.add("is-open");
			menu.onHide(() => anchor.classList.remove("is-open"));
			const rect = anchor.getBoundingClientRect();
			menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 }, anchor.ownerDocument);
		},
		openParent(anchor) {
			const choices = parentChoices(model.kind, host.index, model.parent);
			const placeholder = model.kind === "project" ? "Set the area" : "Move to a project or area";
			open(new ParentModal(host.app, placeholder, choices, (choice) => write(parentEdit(choice.parent))), anchor);
		},
		openDate(key, anchor) {
			const iso = key === "dueDate" ? model.dueDate : model.deadline;
			const modal = new DateModal(
				host.app,
				key === "dueDate" ? "Due date" : "Deadline",
				iso === null ? null : LocalDate.parse(iso),
				host.today(),
				dayOrderOf(),
				firstWeekdayOf(),
				(date) => write(dateEdit(key, date)),
			);
			open(modal, anchor);
		},
		openAddTag(anchor) {
			const onFile = model.tags.filter((tag) => tag.inFrontmatter).map((tag) => tag.name);
			const vaultTags = host.index.carriedTags;
			open(
				new TagModal(
					host.app,
					(query) => tagChoices(vaultTags, onFile, query),
					(choice) => write(choice.current ? removeTagEdit(choice.name) : addTagEdit(choice.name)),
				),
				anchor,
			);
		},
		removeTag(name) {
			write(removeTagEdit(name));
		},
		toggleProperties() {
			return host.toggleProperties(file.path);
		},
	};
}

/** Moves an open modal to the anchor's left edge, below it, or above it when it doesn't fit; kept 8px inside the window. */
function placeBelow(modal: Modal, anchor: HTMLElement): void {
	const win = anchor.ownerDocument.defaultView;
	if (!win) return;
	const chip = anchor.getBoundingClientRect();
	const box = modal.modalEl.getBoundingClientRect();
	const margin = 8;
	const left = Math.max(margin, Math.min(chip.left, win.innerWidth - box.width - margin));
	const below = chip.bottom + 4;
	const top = below + box.height <= win.innerHeight - margin ? below : Math.max(margin, chip.top - 4 - box.height);
	modal.containerEl.classList.add("ta-da-anchored");
	modal.modalEl.setCssProps({ "--ta-da-modal-left": `${left}px`, "--ta-da-modal-top": `${top}px` });
}

/**
 * Draws a status item's box in the icon slot and ticks the current one. Obsidian's `MenuItem` has no public handle on
 * its element; a native menu has none, and falls back to `setChecked`.
 */
function markStatus(item: MenuItem, status: Status, current: boolean): void {
	const dom = (item as unknown as { dom?: HTMLElement }).dom;
	if (!dom) {
		item.setChecked(current);
		return;
	}
	const doc = dom.ownerDocument;
	dom.querySelector(".menu-item-icon")?.replaceChildren(statusBox(doc, status));
	if (current) {
		dom.classList.add("ta-da-current");
		dom.setAttribute("aria-checked", "true");
		dom.appendChild(element(doc, "span", "ta-da-menu-tick")).appendChild(icon(doc, "check", 13, 2.4));
	}
}
