import { type App, Notice, type TFile } from "obsidian";
import type { VaultIndex } from "../../core/index/vaultIndex";
import { LocalDate } from "../../core/model/localDate";
import type { Edit, Writer } from "../../Writer";
import type { StatusActions } from "../statusActions";
import type { HeaderActions } from "./buildHeader";
import { addTagEdit, dateEdit, parentEdit, removeTagEdit } from "./edits";
import type { HeaderModel } from "./headerModel";
import { openDatePicker, openParentPicker, openStatusMenu, openTagPicker } from "./pickers";

/** What the header needs from the plugin. */
export interface HeaderHost {
	app: App;
	index: VaultIndex;
	writer: Writer;
	status: StatusActions;
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

	return {
		openStatus(anchor) {
			openStatusMenu(anchor, model.kind, model.status, (status) => host.status.set(file, status));
		},
		openParent(anchor) {
			openParentPicker(host, model.kind, model.parent, anchor, (parent) => write(parentEdit(parent)));
		},
		openDate(key, anchor) {
			const iso = key === "dueDate" ? model.dueDate : model.deadline;
			openDatePicker(host, key, iso === null ? null : LocalDate.parse(iso), anchor, (date) => write(dateEdit(key, date)));
		},
		openAddTag(anchor) {
			const onFile = model.tags.filter((tag) => tag.inFrontmatter).map((tag) => tag.name);
			openTagPicker(host, onFile, anchor, (choice) => write(choice.current ? removeTagEdit(choice.name) : addTagEdit(choice.name)));
		},
		removeTag(name) {
			write(removeTagEdit(name));
		},
		toggleProperties() {
			return host.toggleProperties(file.path);
		},
	};
}
