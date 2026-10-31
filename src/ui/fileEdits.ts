import { Notice, type TFile } from "obsidian";
import type { Parent } from "../core/writing/parent";
import type { RepeatRule } from "../core/model/repeatRule";
import type { Edit, Writer } from "../Writer";
import { localToday } from "./dates";
import { agreedDate, agreedParent, sameParent } from "./fileActions";
import { dateEdit, parentEdit, repeatEdit } from "./header/edits";
import { buildHeaderModel } from "./header/headerModel";
import { openDatePicker, openParentPicker, type PickerHost } from "./header/pickers";

/** Writes an edit to a file; a failure is a notice. */
export function writeEdit(writer: Writer, file: TFile, edit: Edit): void {
	writer.apply(file, edit).catch((error: unknown) => {
		new Notice(`Couldn't save the change: ${error instanceof Error ? error.message : String(error)}`);
	});
}

/** Opens the project or area picker for files that are all tasks or all projects, and moves each to the pick. */
export function moveFiles(host: PickerHost, writer: Writer, files: TFile[], kind: "task" | "project"): void {
	const parents = files.flatMap((file) => {
		const item = host.index.get(file.path);
		return item ? [buildHeaderModel(item, host.index, localToday())?.parent ?? null] : [];
	});
	const agreed = agreedParent(parents);
	openParentPicker(host, kind, agreed ?? null, null, (parent) => moveFilesTo(writer, files, parent), agreed !== undefined);
}

/** The files not already under `parent`, so a move leaves their links as written. */
export function filesNotUnder(host: PickerHost, files: TFile[], parent: Parent): TFile[] {
	return files.filter((file) => {
		const item = host.index.get(file.path);
		return !item || !sameParent(buildHeaderModel(item, host.index, localToday())?.parent ?? null, parent);
	});
}

/** Files each file under `parent`. */
export function moveFilesTo(writer: Writer, files: TFile[], parent: Parent | null): void {
	for (const file of files) writeEdit(writer, file, parentEdit(parent));
}

/** Opens the date picker for the files' due date or deadline, filled when they agree. Exactly one task gets the Repeat section. */
export function dateFiles(host: PickerHost, writer: Writer, files: TFile[], key: "dueDate" | "deadline"): void {
	const items = files.flatMap((file) => host.index.get(file.path) ?? []);
	const [only] = items;
	const [first] = files;
	const repeat =
		key === "dueDate" && first && only?.properties.kind === "task" && items.length === 1
			? { item: only, index: host.index, set: (rule: RepeatRule | null) => writeEdit(writer, first, repeatEdit(rule, first.path, localToday())) }
			: undefined;
	openDatePicker(host, key, agreedDate(items, key), null, (date) => {
		for (const file of files) writeEdit(writer, file, dateEdit(key, date));
	}, repeat);
}
