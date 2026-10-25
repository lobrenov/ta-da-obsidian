import { Notice, type Plugin, TFile } from "obsidian";
import type { Writer } from "./Writer";
import type { TaDaIndex } from "./TaDaIndex";
import { localToday } from "./ui/dates";
import { parentEdit } from "./ui/header/edits";
import { buildHeaderModel } from "./ui/header/headerModel";
import { openParentPicker } from "./ui/header/pickers";
import { NavigatorView } from "./ui/navigator/NavigatorView";
import { viewKinds, viewSpecs } from "./ui/navigator/views";
import { NewTaskModal } from "./ui/newTask/NewTaskModal";
import { type NewTaskContext, prefillDraft } from "./ui/newTask/prefill";
import { type StatusActions, statusItem } from "./ui/statusActions";

/** What the commands need from the plugin. */
export type CommandsPlugin = Plugin & { taDaIndex: TaDaIndex; writer: Writer; statusActions: StatusActions };

/** New task, Complete, and Move to project or area. None has a default hotkey. */
/** Returns the New task action, for the views' header buttons. */
export function registerCommands(plugin: CommandsPlugin): { newTask: (context?: NewTaskContext) => void } {
	const { app } = plugin;
	const index = plugin.taDaIndex.index;
	const host = { app, index, today: localToday };
	const activeItem = (): { file: TFile; kind: "task" | "project" } | null => {
		const file = app.workspace.getActiveFile();
		const item = file instanceof TFile ? statusItem(index, file) : null;
		return file instanceof TFile && item ? { file, kind: item.properties.kind as "task" | "project" } : null;
	};

	/** From `context`, else from the active Ta Da view, else the first one showing. */
	const newTask = (context?: NewTaskContext): void => {
		const views = viewKinds
			.flatMap((kind) => app.workspace.getLeavesOfType(viewSpecs[kind].type))
			.map((leaf) => leaf.view)
			.filter((candidate): candidate is NavigatorView => candidate instanceof NavigatorView && candidate.containerEl.isShown());
		const view = app.workspace.getActiveViewOfType(NavigatorView) ?? views[0];
		new NewTaskModal(app, host, prefillDraft(context ?? view?.newTaskContext() ?? null, index)).open();
	};
	plugin.addCommand({ id: "new-task", name: "New task", callback: () => newTask() });

	plugin.addCommand({
		id: "complete",
		name: "Complete",
		checkCallback: (checking) => {
			const active = activeItem();
			if (!active) return false;
			if (!checking) plugin.statusActions.toggle(active.file);
			return true;
		},
	});

	plugin.addCommand({
		id: "move-to-project-or-area",
		name: "Move to project or area",
		checkCallback: (checking) => {
			const active = activeItem();
			if (!active) return false;
			if (!checking) {
				const item = index.get(active.file.path);
				const current = item ? (buildHeaderModel(item, index, localToday())?.parent ?? null) : null;
				openParentPicker(host, active.kind, current, null, (parent) => {
					plugin.writer.apply(active.file, parentEdit(parent)).catch((error: unknown) => {
						new Notice(`Couldn't move the file: ${error instanceof Error ? error.message : String(error)}`);
					});
				});
			}
			return true;
		},
	});

	return { newTask };
}
