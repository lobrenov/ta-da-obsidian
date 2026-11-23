import type { EditorView } from "@codemirror/view";
import { editorLivePreviewField, MarkdownView, type Plugin, setIcon } from "obsidian";
import { parentItem } from "../core/index/subtaskQueries";
import type { TaDaIndex } from "../TaDaIndex";
import { progressRing } from "./navigator/dom";
import { parentChoices } from "./header/choices";
import { dayOrderOf, firstWeekdayOf } from "./header/locale";
import { DateModal, ParentModal } from "./header/modals";
import { DateSuggest, ParentSuggest } from "./AttributeSuggests";
import { localToday } from "./dates";
import { refreshTaskAttributes, taskAttributeExtension } from "./taskAttributes";

/**
 * Registers the Live Preview pills and chips for `>YYYY-MM-DD` and `@[[Title]]` on checkbox lines, and the `>` and `@`
 * menus that write them; open editors redraw when the index changes.
 */
export function registerTaskAttributes(plugin: Plugin, taDaIndex: TaDaIndex): void {
	const { app } = plugin;
	plugin.registerEditorExtension(
		taskAttributeExtension(
			{
				index: taDaIndex.index,
				today: localToday,
				drawIcon: (parent, kind) => {
					const icon = parent.ownerDocument.createElement("span");
					icon.className = `ta-da-attr-icon is-${kind}`;
					if (kind === "area") setIcon(icon, "box");
					else progressRing(icon, 0);
					parent.appendChild(icon);
				},
				pickDate: (current, choose) => new DateModal(app, "Due date", current, localToday(), dayOrderOf(), firstWeekdayOf(), choose).open(),
				pickParent: (current, choose) => {
					const resolved = parentItem(taDaIndex.index, current);
					const parent = resolved ? { kind: resolved.properties.kind === "area" ? ("area" as const) : ("project" as const), title: resolved.title } : null;
					const choices = parentChoices("task", taDaIndex.index, parent);
					new ParentModal(app, "Move to project or area", choices, (choice) => choose(choice.parent?.title ?? null)).open();
				},
			},
			{ isLivePreview: (state) => state.field(editorLivePreviewField, false) === true },
		),
	);
	const host = { app, index: taDaIndex.index, today: localToday };
	plugin.registerEditorSuggest(new DateSuggest(host));
	plugin.registerEditorSuggest(new ParentSuggest(host));
	const refresh = (): void => {
		for (const leaf of app.workspace.getLeavesOfType("markdown")) {
			if (!(leaf.view instanceof MarkdownView) || leaf.view.getMode() !== "source") continue;
			const cm = (leaf.view.editor as unknown as { cm?: EditorView }).cm;
			cm?.dispatch({ effects: refreshTaskAttributes.of(null) });
		}
	};
	plugin.register(taDaIndex.onChange(refresh));
	void taDaIndex.ready.then(refresh);
	// The overdue tint follows the day.
	let day = localToday();
	plugin.registerInterval(
		window.setInterval(() => {
			const now = localToday();
			if (now.equals(day)) return;
			day = now;
			refresh();
		}, 60_000),
	);
}
