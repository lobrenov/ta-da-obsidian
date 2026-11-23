import type { Checkbox } from "../model/checkbox";
import { type Item, isLogged, titleOfPath } from "../model/item";
import type { LocalDate } from "../model/localDate";
import { isClosed } from "../model/status";
import { folderOf } from "../storage/vault";
import { identityKey } from "../text";
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

/** The live project a `@[[Title]]` resolves to, else the live area: the first of each by path. A logged file resolves nothing. */
export function parentItem(index: Pick<VaultIndex, "itemsTitled">, title: string): Item | null {
	const found = index.itemsTitled(title).filter((item) => !isLogged(item));
	return found.find((item) => item.properties.kind === "project") ?? found.find((item) => item.properties.kind === "area") ?? null;
}

/** An open box that isn't nested or quoted, in a file that isn't logged or closed. */
function isOpenLine(box: Checkbox, item: Item): boolean {
	return box.state === "open" && !box.isNested && !box.isQuoted && !isLogged(item) && !isClosed(item.properties.status);
}

/** Whether `box` in `item` is a listed line. */
export function isListed(index: VaultIndex, box: Checkbox, item: Item): boolean {
	if (!isOpenLine(box, item)) return false;
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

/** Every project's and area's cards at once, by the parent's path, as `noteSubtasksIn` gives them, in one pass. */
export function noteSubtasksByParent(index: VaultIndex): Map<string, SubtaskCard[]> {
	const resolved = new Map<string, string | null>();
	const pathOf = (title: string): string | null => {
		const key = identityKey(title);
		const known = resolved.get(key);
		if (known !== undefined) return known;
		const found = parentItem(index, title)?.path ?? null;
		resolved.set(key, found);
		return found;
	};
	const grouped = new Map<string, { item: Item; lines: Checkbox[] }[]>();
	for (const item of index.items.values()) {
		const byParent = new Map<string, Checkbox[]>();
		for (const box of item.checkboxes) {
			if (!isOpenLine(box, item) || box.parent === null) continue;
			const parent = pathOf(box.parent);
			if (parent !== null && parent !== item.path) byParent.set(parent, [...(byParent.get(parent) ?? []), box]);
		}
		for (const [parent, lines] of byParent) grouped.set(parent, [...(grouped.get(parent) ?? []), { item, lines }]);
	}
	return new Map([...grouped].map(([parent, found]) => [parent, found.sort((a, b) => byTitle(a.item, b.item)).map(({ item, lines }) => ({ path: item.path, lines, title: titleOfPath(item.path), folder: folderOf(item.path) }))]));
}

/** A note's lines with no due date and no parent that resolves. */
export function looseNoteSubtasks(index: VaultIndex): SubtaskCard[] {
	return cards(index, (item, box) => item.properties.kind === "note" && box.due === null && (box.parent === null || parentItem(index, box.parent) === null));
}
