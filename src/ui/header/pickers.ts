import { type App, Menu, type MenuItem, type Modal, Platform } from "obsidian";
import type { VaultIndex } from "../../core/index/vaultIndex";
import type { Kind } from "../../core/model/item";
import type { LocalDate } from "../../core/model/localDate";
import { isClosed, type Status, statusChoices } from "../../core/model/status";
import { readTag } from "../../core/model/tag";
import type { Parent } from "../../core/writing/parent";
import { parentChoices, pickerTags, type TagChoice, tagChoices } from "./choices";
import { element, icon, statusBox } from "./dom";
import { statusLabel } from "./headerModel";
import { dayOrderOf, firstWeekdayOf } from "./locale";
import type { RepeatMove } from "../../core/index/repeatMove";
import { moveNote, statusTitle } from "../repeatWording";
import { DateModal, type DateRepeat, ParentModal, TagModal } from "./modals";

/** What the pickers need: a file's header and the New task modal both open them, and each decides what a choice does. */
export interface PickerHost {
	app: App;
	index: VaultIndex;
	today(): LocalDate;
}

/** Opens a modal below the chip that opened it (above when there's no room), with the chip marked `is-open` until it closes. */
export function openBelow(modal: Modal, anchor: HTMLElement): void {
	anchor.classList.add("is-open");
	const onClose = modal.onClose.bind(modal);
	modal.onClose = () => {
		onClose();
		anchor.classList.remove("is-open");
	};
	modal.open();
	if (!Platform.isPhone) placeBelow(modal, anchor);
}

/** What a repeating task's status menu says: where completing it moves it. */
export interface StatusRepeat {
	move: RepeatMove | null;
	today: LocalDate;
}

/** The status menu. A `repeat` is a repeating task's: Cancelled reads Skip this time, and Done and Skip say where the task moves. */
export function openStatusMenu(anchor: HTMLElement, kind: Kind, current: Status, choose: (status: Status) => void, repeat?: StatusRepeat): void {
	const menu = new Menu();
	for (const status of statusChoices(kind)) {
		if (status === "Done") menu.addSeparator();
		menu.addItem((item) => {
			const title = statusTitle(status, repeat !== undefined, statusLabel(status));
			const note = repeat?.move && isClosed(status) && status !== current ? moveNote(repeat.move, repeat.today) : null;
			item.setTitle(title);
			item.setIcon("circle");
			markStatus(item, status, status === current, title, note);
			item.onClick(() => choose(status));
		});
	}
	anchor.classList.add("is-open");
	menu.onHide(() => anchor.classList.remove("is-open"));
	const rect = anchor.getBoundingClientRect();
	menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 }, anchor.ownerDocument);
}

/** The project or area menu. Without an anchor the modal opens where Obsidian puts it. */
export function openParentPicker(host: PickerHost, kind: Kind, current: Parent | null, anchor: HTMLElement | null, choose: (parent: Parent | null) => void): void {
	const choices = parentChoices(kind, host.index, current);
	const placeholder = kind === "project" ? "Set the area" : "Move to a project or area";
	const modal = new ParentModal(host.app, placeholder, choices, (choice) => choose(choice.parent));
	if (anchor) openBelow(modal, anchor);
	else modal.open();
}

/** The date menu; `repeat` gives a task's due date menu its Repeat section. */
export function openDatePicker(
	host: PickerHost,
	key: "dueDate" | "deadline",
	current: LocalDate | null,
	anchor: HTMLElement,
	choose: (date: LocalDate | null) => void,
	repeat?: DateRepeat,
): void {
	const modal = new DateModal(host.app, key === "dueDate" ? "Due date" : "Deadline", current, host.today(), dayOrderOf(), firstWeekdayOf(), choose, repeat);
	openBelow(modal, anchor);
}

/** The tag menu; `onFile` are the names already on the file or draft, which a pick removes. */
export function openTagPicker(host: PickerHost, onFile: string[], anchor: HTMLElement, choose: (choice: TagChoice) => void): void {
	const vaultTags = pickerTags(host.index.carriedTags, host.app.metadataCache.getTags?.() ?? {});
	openBelow(new TagModal(host.app, (query) => tagChoices(vaultTags, onFile, query), choose), anchor);
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
function markStatus(item: MenuItem, status: Status, current: boolean, title: string, note: string | null): void {
	const dom = (item as unknown as { dom?: HTMLElement }).dom;
	if (!dom) {
		item.setChecked(current);
		if (note) item.setTitle(`${title} · ${note}`);
		return;
	}
	const doc = dom.ownerDocument;
	dom.querySelector(".menu-item-icon")?.replaceChildren(statusBox(doc, status));
	if (note) dom.appendChild(element(doc, "span", "ta-da-menu-note", note));
	if (current) {
		dom.classList.add("ta-da-current");
		dom.setAttribute("aria-checked", "true");
		dom.appendChild(element(doc, "span", "ta-da-menu-tick")).appendChild(icon(doc, "check", 13, 2.4));
	}
}
