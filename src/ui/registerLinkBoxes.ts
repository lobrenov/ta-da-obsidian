import { editorInfoField, editorLivePreviewField, MarkdownRenderChild, MarkdownView, type Plugin } from "obsidian";
import type { EditorView } from "@codemirror/view";
import type { TaDaIndex } from "../TaDaIndex";
import { type DrawBox, type LinkBoxHost, linkBoxExtension, linkBoxProcessor, refreshLinkBoxes } from "./linkBox";
import { drawCheckbox } from "./navigator/dom";

/** The navigator row's checkbox, without a click. */
const drawRowBox: DrawBox = (parent, status) => void drawCheckbox(parent, status, status, null);

/** Redraws a post-processed section from the index when that changes. */
class LinkBoxSection extends MarkdownRenderChild {
	constructor(
		section: HTMLElement,
		private readonly draw: () => void,
		private readonly onIndexChange: (listener: () => void) => () => void,
	) {
		super(section);
	}

	override onload(): void {
		this.draw();
		this.register(this.onIndexChange(this.draw));
	}
}

/** Registers the Live Preview extension and the Reading view post-processor; open editors and sections redraw when the index changes. Returns the redraw for when `enabled` changes. */
export function registerLinkBoxes(plugin: Plugin, taDaIndex: TaDaIndex, enabled: () => boolean): () => void {
	const { app } = plugin;
	const host: LinkBoxHost = {
		index: taDaIndex.index,
		resolve: (linkpath, sourcePath) => app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)?.path ?? null,
		draw: drawRowBox,
		enabled,
	};
	plugin.registerEditorExtension(
		linkBoxExtension(host, {
			sourceOf: (state) => state.field(editorInfoField, false)?.file?.path ?? "",
			isLivePreview: (state) => state.field(editorLivePreviewField, false) === true,
		}),
	);
	const sections = new Set<() => void>();
	plugin.registerMarkdownPostProcessor(linkBoxProcessor(host, (section, draw) => new LinkBoxSection(section, draw, (listener) => {
				const stop = taDaIndex.onChange(listener);
				sections.add(listener);
				return () => {
					stop();
					sections.delete(listener);
				};
			})));
	const refresh = (): void => {
		for (const leaf of app.workspace.getLeavesOfType("markdown")) {
			if (!(leaf.view instanceof MarkdownView) || leaf.view.getMode() !== "source") continue;
			const cm = (leaf.view.editor as unknown as { cm?: EditorView }).cm;
			cm?.dispatch({ effects: refreshLinkBoxes.of(null) });
		}
	};
	plugin.register(taDaIndex.onChange(refresh));
	void taDaIndex.ready.then(refresh);
	return () => {
		refresh();
		for (const draw of [...sections]) draw();
	};
}
