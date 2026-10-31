import type { EditorView } from "@codemirror/view";
import type { Plugin } from "obsidian";
import type { TaDaIndex } from "../TaDaIndex";
import { type DrawBox, linkBoxExtension, linkBoxProcessor, refreshLinkBoxes } from "./linkBox";
import { drawCheckbox } from "./navigator/dom";

/** The navigator row's checkbox, without a click. */
const drawRowBox: DrawBox = (parent, status) => void drawCheckbox(parent, status, status, null);

/** Registers the Live Preview extension and the Reading view post-processor; open editors redraw when the index changes. */
export function registerLinkBoxes(plugin: Plugin, taDaIndex: TaDaIndex): void {
	plugin.registerEditorExtension(linkBoxExtension(taDaIndex.index, drawRowBox));
	plugin.registerMarkdownPostProcessor(linkBoxProcessor(taDaIndex.index, drawRowBox));
	const refresh = (): void => {
		for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
			const cm = (leaf.view as unknown as { editor?: { cm?: EditorView } }).editor?.cm;
			cm?.dispatch({ effects: refreshLinkBoxes.of(null) });
		}
	};
	plugin.register(taDaIndex.onChange(refresh));
	void taDaIndex.ready.then(refresh);
}
