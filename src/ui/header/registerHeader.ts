import { editorInfoField, MarkdownView, debounce, type Plugin, type TFile } from "obsidian";
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
import { today } from "./today";

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
		today,
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
			modelOf: (text, file) => modelFromText(text, file.path, host.index, today()),
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

	/** Redraws every Live Preview header from the index, for a parent that changed in another file. */
	const refreshEditors = (): void => {
		for (const view of markdownViews()) {
			const cm = (view.editor as unknown as { cm?: EditorView }).cm;
			cm?.dispatch({ effects: refreshHeader.of(null) });
		}
	};
	const refresh = (): void => {
		refreshClasses();
		refreshEditors();
	};
	/** After `TaDaIndex` has taken the change. */
	const refreshSoon = debounce(refresh, 300, true);
	plugin.registerEvent(app.workspace.on("active-leaf-change", refreshClasses));
	plugin.registerEvent(app.workspace.on("file-open", refreshClasses));
	plugin.registerEvent(app.workspace.on("layout-change", refreshClasses));
	plugin.registerEvent(app.metadataCache.on("changed", refreshSoon));
	plugin.registerEvent(app.vault.on("rename", (file, oldPath) => shown.rename(oldPath, file.path)));
	void taDaIndex.ready.then(refresh);
	return { refresh };
}
