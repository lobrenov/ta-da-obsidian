import { type Menu, type Plugin, TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import type { Item } from "../core/model/item";
import { isClosed, statusChoices } from "../core/model/status";
import type { Edit, Writer } from "../Writer";
import { localToday } from "./dates";
import { deleteItem } from "./deleteFiles";
import { fileSetKind } from "./fileActions";
import { dateFiles, moveFiles, writeEdit } from "./fileEdits";
import { addTagEdit, removeTagEdit } from "./header/edits";
import { buildHeaderModel, statusLabel } from "./header/headerModel";
import { openTagPicker, type PickerHost } from "./header/pickers";
import { moveNote, statusContext, statusTitle } from "./repeatWording";
import type { StatusActions } from "./statusActions";

/**
 * Adds the plugin's items to Obsidian's file menu (one file) and files menu (several), wherever they show, for task and
 * project files: Status…, Move…, Schedule…, Set deadline…, Tags… (one file), and Convert to project… on a task. An area has Tags… only. In the plugin's own views (source `ta-da`) a project or area also has Delete.
 */
export function registerFileMenu(plugin: Plugin, index: VaultIndex, status: StatusActions, convert: (file: TFile) => void, writer: Writer): void {
	const host: PickerHost = { app: plugin.app, index, today: localToday };
	const write = (file: TFile, edit: Edit): void => writeEdit(writer, file, edit);
	const section = (menu: Menu, title: string, icon: string, onClick: () => void): void => {
		menu.addItem((entry) => entry.setTitle(title).setIcon(icon).setSection("ta-da").onClick(onClick));
	};

	const addStatus = (menu: Menu, files: TFile[], kind: "task" | "project" | "mixed"): void => {
		const [only] = files;
		const item = files.length === 1 && only ? index.get(only.path) : undefined;
		menu.addItem((entry) => {
			entry.setTitle("Status…").setIcon("circle-dot").setSection("ta-da");
			const submenu = entry.setSubmenu();
			const today = localToday();
			const { repeating, move } = item ? statusContext(item, index, today) : { repeating: false, move: null };
			const current = item?.properties.status;
			for (const option of statusChoices(kind === "mixed" ? "task" : kind)) {
				if (option === "Done") submenu.addSeparator();
				submenu.addItem((sub) => {
					const note = move && isClosed(option) && option !== current ? ` · ${moveNote(move, today)}` : "";
					sub.setTitle(`${statusTitle(option, repeating, statusLabel(option))}${note}`);
					if (item) sub.setChecked(option === current);
					sub.onClick(() => void status.setAll(files, option));
				});
			}
		});
	};

	const addMove = (menu: Menu, files: TFile[], kind: "task" | "project"): void => {
		section(menu, "Move…", "folder-tree", () => moveFiles(host, writer, files, kind));
	};

	const addDate = (menu: Menu, files: TFile[], key: "dueDate" | "deadline"): void => {
		section(menu, key === "dueDate" ? "Schedule…" : "Set deadline…", key === "dueDate" ? "calendar" : "flag", () => dateFiles(host, writer, files, key));
	};

	const addTags = (menu: Menu, file: TFile, item: Item): void => {
		section(menu, "Tags…", "tag", () => {
			const model = buildHeaderModel(item, index, localToday());
			const onFile = (model?.tags ?? []).filter((tag) => tag.inFrontmatter).map((tag) => tag.name);
			openTagPicker(host, onFile, null, (choice) => write(file, choice.current ? removeTagEdit(choice.name) : addTagEdit(choice.name)));
		});
	};

	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file, source) => {
			if (!(file instanceof TFile)) return;
			const item = index.get(file.path);
			if (!item) return;
			const { kind } = item.properties;
			if (kind !== "task" && kind !== "project" && kind !== "area") return;
			if (kind !== "area") {
				addStatus(menu, [file], kind);
				addMove(menu, [file], kind);
				addDate(menu, [file], "dueDate");
				addDate(menu, [file], "deadline");
			}
			addTags(menu, file, item);
			if (kind === "task") section(menu, "Convert to project…", "folder-input", () => convert(file));
			if (kind !== "task" && source === "ta-da") {
				menu.addItem((entry) =>
					entry.setTitle(`Delete ${kind}`).setIcon("trash-2").setSection("danger").setWarning(true).onClick(() => deleteItem(plugin.app, index, file)),
				);
			}
		}),
	);

	plugin.registerEvent(
		plugin.app.workspace.on("files-menu", (menu, files) => {
			const tfiles = files.filter((file): file is TFile => file instanceof TFile);
			if (tfiles.length !== files.length) return;
			const kind = fileSetKind(index, tfiles.map((file) => file.path));
			if (!kind) return;
			addStatus(menu, tfiles, kind);
			if (kind !== "mixed") addMove(menu, tfiles, kind);
			addDate(menu, tfiles, "dueDate");
			addDate(menu, tfiles, "deadline");
		}),
	);
}
