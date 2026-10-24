import type { Item } from "../model/item";
import { isLogged } from "../model/item";
import { LocalDate } from "../model/localDate";
import { identityKey } from "../text";
import type { VaultIndex } from "./vaultIndex";

/**
 * Where daily notes live and how they're named: `<dailyFolder>/YYYY-MM-DD.md`. The folder's case is ignored when
 * a path is read.
 */
export interface DailyNoteNames {
	dailyFolder: string;
}

export const defaultDailyNoteNames: DailyNoteNames = { dailyFolder: "Periodic Notes/Daily Notes" };

/** The date a path names, or null for any other path. */
export function dateAtPath(names: DailyNoteNames, path: string): LocalDate | null {
	const name = nameOf(path, names.dailyFolder);
	return name === null ? null : LocalDate.parse(name);
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

/** The unchecked boxes in a file: those with the open state (`[ ]`, `[/]`, `[>]`, `[<]`). */
export function openCheckboxCount(item: Item): number {
	return item.checkboxes.filter((box) => box.state === "open").length;
}
