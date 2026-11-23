import type { Checkbox } from "../model/checkbox";
import { type Item, isLogged, titleOfPath } from "../model/item";
import type { LocalDate } from "../model/localDate";
import { isClosed } from "../model/status";
import { folderOf } from "../storage/vault";
import { byTitle, type VaultIndex } from "./vaultIndex";

/** The listed subtask lines of one file, in file order. */
export interface SubtaskCard {
	path: string;
	lines: Checkbox[];
	title: string;
	folder: string;
}

/*
 * Subtask lines listed outside their file (Subtasks in `docs/file-format.md`). A line is listed when it's an open box
 * that isn't nested or quoted, in a file that isn't logged or closed, and it's in a note or carries a due date or a
 * parent that resolves. Each query returns cards by source title, then path; `today` is passed in.
 */

/** The project a `@[[Title]]` resolves to, else the area: the first of each by path. */
export function parentItem(index: Pick<VaultIndex, "itemsTitled">, title: string): Item | null {
	const found = index.itemsTitled(title);
	return found.find((item) => item.properties.kind === "project") ?? found.find((item) => item.properties.kind === "area") ?? null;
}

/** Whether `box` in `item` is a listed line. */
export function isListed(index: VaultIndex, box: Checkbox, item: Item): boolean {
	if (box.state !== "open" || box.isNested || box.isQuoted || isLogged(item) || isClosed(item.properties.status)) return false;
	return item.properties.kind === "note" || box.due !== null || (box.parent !== null && parentItem(index, box.parent) !== null);
}

function cards(index: VaultIndex, keep: (item: Item, box: Checkbox) => boolean): SubtaskCard[] {
	const found: { item: Item; lines: Checkbox[] }[] = [];
	for (const item of index.items.values()) {
		if (item.checkboxes.length === 0) continue;
		const lines = item.checkboxes.filter((box) => isListed(index, box, item) && keep(item, box));
		if (lines.length > 0) found.push({ item, lines });
	}
	return found.sort((a, b) => byTitle(a.item, b.item)).map(({ item, lines }) => ({ path: item.path, lines, title: titleOfPath(item.path), folder: folderOf(item.path) }));
}

/** The lines due on `date`; for `today`, also those due earlier (overdue). */
export function noteSubtasksOn(index: VaultIndex, date: LocalDate, today: LocalDate): SubtaskCard[] {
	return cards(index, (_item, box) => box.due !== null && (box.due.equals(date) || (date.equals(today) && box.due.compare(today) < 0)));
}

/** The lines due from `from` through `through`. */
export function noteSubtasksFrom(index: VaultIndex, from: LocalDate, through: LocalDate): SubtaskCard[] {
	return cards(index, (_item, box) => box.due !== null && box.due.compare(from) >= 0 && box.due.compare(through) <= 0);
}

/** The lines whose parent resolves to this project or area, leaving out its own file's. */
export function noteSubtasksIn(index: VaultIndex, parent: Item): SubtaskCard[] {
	return cards(index, (item, box) => item.path !== parent.path && box.parent !== null && parentItem(index, box.parent)?.path === parent.path);
}

/** A note's lines with no due date and no parent that resolves. */
export function looseNoteSubtasks(index: VaultIndex): SubtaskCard[] {
	return cards(index, (item, box) => item.properties.kind === "note" && box.due === null && (box.parent === null || parentItem(index, box.parent) === null));
}
