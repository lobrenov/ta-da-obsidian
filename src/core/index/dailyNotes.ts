import type { Item } from "../model/item";
import { isLogged } from "../model/item";
import { ISOWeek, LocalDate } from "../model/localDate";
import { identityKey } from "../text";
import type { VaultIndex } from "./vaultIndex";

/**
 * Where daily and week notes live and how they're named: `<dailyFolder>/YYYY-MM-DD.md` and `<weekFolder>/GGGG-[W]WW.md`.
 * The two folders can be the same. The folder's case is ignored when a path is read.
 */
export interface DailyNoteNames {
	dailyFolder: string;
	weekFolder: string;
}

export const defaultDailyNoteNames: DailyNoteNames = { dailyFolder: "Periodic Notes/Daily Notes", weekFolder: "Periodic Notes/Weekly Notes" };

export function pathForDate(names: DailyNoteNames, date: LocalDate): string {
	return pathIn(names.dailyFolder, date.toString());
}

export function pathForWeek(names: DailyNoteNames, week: ISOWeek): string {
	return pathIn(names.weekFolder, week.toString());
}

function pathIn(folder: string, name: string): string {
	return folder === "" ? `${name}.md` : `${folder}/${name}.md`;
}

/** The date a path names, or null for any other path. */
export function dateAtPath(names: DailyNoteNames, path: string): LocalDate | null {
	const name = nameOf(path, names.dailyFolder);
	return name === null ? null : LocalDate.parse(name);
}

/** The week a path names, or null for any other path. */
export function weekAtPath(names: DailyNoteNames, path: string): ISOWeek | null {
	const name = nameOf(path, names.weekFolder);
	if (name === null) return null;
	const match = /^(\d{4})-W(\d{2})$/.exec(name);
	if (!match) return null;
	const year = Number(match[1]);
	const week = Number(match[2]);
	const fourth = LocalDate.of(year, 12, 28);
	return fourth && week >= 1 && week <= fourth.isoWeek.week ? new ISOWeek(year, week) : null;
}

/** The filename without `.md` when the path is straight in `folder`, whose case is ignored. */
function nameOf(path: string, folder: string): string | null {
	const prefix = folder === "" ? "" : `${folder}/`;
	if (!path.endsWith(".md")) return null;
	let rest = path;
	if (prefix !== "") {
		if (!identityKey(path).startsWith(identityKey(prefix))) return null;
		rest = path.slice(prefix.length);
	}
	const name = rest.slice(0, -3);
	return name.includes("/") ? null : name;
}

/** Daily notes are plain notes found by their name, in the folder in any case. */
export function dailyNote(index: VaultIndex, date: LocalDate, names: DailyNoteNames = defaultDailyNoteNames): Item | null {
	return (
		index
			.itemsTitled(date.toString())
			.find((item) => item.properties.kind === "note" && !isLogged(item) && dateAtPath(names, item.path)?.equals(date) === true) ?? null
	);
}

export function weekNote(index: VaultIndex, week: ISOWeek, names: DailyNoteNames = defaultDailyNoteNames): Item | null {
	return (
		index
			.itemsTitled(week.toString())
			.find((item) => item.properties.kind === "note" && !isLogged(item) && weekAtPath(names, item.path)?.equals(week) === true) ?? null
	);
}

/** The unchecked boxes in a file: those with the open state (`[ ]`, `[/]`, `[>]`, `[<]`). */
export function openCheckboxCount(item: Item): number {
	return item.checkboxes.filter((box) => box.state === "open").length;
}
