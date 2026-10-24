import { editorInfoField, MarkdownView, type Plugin, type TFile } from "obsidian";
import type { EditorView } from "@codemirror/view";
import type { TaDaIndex } from "../../TaDaIndex";
import type { TaDaSettings } from "../../settingsData";
import type { Writer } from "../../Writer";
import { buildHeader } from "./buildHeader";
import { headerActions, type HeaderHost } from "./headerActions";
import { headerExtension, refreshHeader } from "./headerExtension";
import { modelFromText } from "./headerModel";
import { hidesProperties, ShownProperties, taDaFileClass } from "./propertiesVisibility";
import { readingHeaderProcessor } from "./readingHeader";
import { localToday } from "../dates";

/**
 * Registers the Ta Da header: the Live Preview widget, the Reading view post-processor, and the `ta-da-file` class
 * that hides Obsidian's Properties. Returns what to call when the setting changes.
 */
export function registerHeader(plugin: Plugin, taDaIndex: TaDaIndex, writer: Writer, settings: TaDaSettings): { refresh(): void } {
	const { app } = plugin;
	const shown = new ShownProperties();
	const host: HeaderHost = {
		app,
		index: taDaIndex.index,
		writer,
		today: localToday,
		onIndexChange: (listener) => taDaIndex.onChange(listener),
		propertiesShown: (path) => shown.has(path),
		toggleProperties: (path) => {
			const now = shown.toggle(path);
			refreshClasses();
			return now;
		},
	};

	plugin.registerEditorExtension(
		headerExtension<TFile>({
			fileOf: (state) => state.field(editorInfoField, false)?.file ?? null,
			modelOf: (text, file) => modelFromText(text, file.path, host.index, localToday()),
			render: (model, file, doc) => buildHeader(doc, model, headerActions(host, file, model), shown.has(file.path)),
		}),
	);
	plugin.registerMarkdownPostProcessor(readingHeaderProcessor(host));

	const markdownViews = (): MarkdownView[] =>
		app.workspace.getLeavesOfType("markdown").flatMap((leaf) => (leaf.view instanceof MarkdownView ? [leaf.view] : []));

	function refreshClasses(): void {
		for (const view of markdownViews()) {
			const path = view.file?.path;
			const kind = path === undefined ? undefined : taDaIndex.index.get(path)?.properties.kind;
			const hide = hidesProperties(kind, settings.hideProperties, path !== undefined && shown.has(path));
			view.containerEl.classList.toggle(taDaFileClass, hide);
		}
	}

	/** Redraws the Live Preview headers of Ta Da files from the index, for a parent that changed in another file. */
	const refreshEditors = (): void => {
		for (const view of markdownViews()) {
			const kind = view.file ? taDaIndex.index.get(view.file.path)?.properties.kind : undefined;
			if (kind !== "task" && kind !== "project" && kind !== "area") continue;
			const cm = (view.editor as unknown as { cm?: EditorView }).cm;
			cm?.dispatch({ effects: refreshHeader.of(null) });
		}
	};
	const refresh = (): void => {
		refreshClasses();
		refreshEditors();
	};
	plugin.registerEvent(app.workspace.on("active-leaf-change", refreshClasses));
	plugin.registerEvent(app.workspace.on("file-open", refreshClasses));
	plugin.registerEvent(app.workspace.on("layout-change", refreshClasses));
	plugin.registerEvent(app.vault.on("rename", (file, oldPath) => shown.rename(oldPath, file.path)));
	/** The index changes after an edit pauses, a save, a rename or a delete; the header and the class follow it. */
	plugin.register(taDaIndex.onChange(refresh));
	void taDaIndex.ready.then(refresh);
	return { refresh };
}
