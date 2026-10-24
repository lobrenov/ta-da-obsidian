import { type MarkdownPostProcessor, MarkdownRenderChild, type TFile } from "obsidian";
import { splitFrontmatter } from "../../core/parsing/frontmatterSplitter";
import { buildHeader } from "./buildHeader";
import { headerActions, type HeaderHost } from "./headerActions";
import { modelFromText } from "./headerModel";

/**
 * Reading view: the header goes at the top of the first section after the frontmatter. It redraws itself from the
 * file's text when the file changes, since Obsidian reuses a section whose own text didn't.
 */
export function readingHeaderProcessor(host: HeaderHost): MarkdownPostProcessor {
	return (el, ctx) => {
		const file = host.app.vault.getFileByPath(ctx.sourcePath);
		const info = ctx.getSectionInfo(el);
		if (!file || !info) return;
		const { bodyFirstLineIndex } = splitFrontmatter(info.text);
		if (info.lineStart < bodyFirstLineIndex) return;
		const before = info.text.split("\n").slice(bodyFirstLineIndex, info.lineStart);
		if (before.some((line) => line.trim() !== "")) return;
		if (modelFromText(info.text, file.path, host.index, host.today()) === null) return;
		el.querySelector(":scope > .ta-da-header-host")?.remove();
		const holder = el.ownerDocument.createElement("div");
		holder.className = "ta-da-header-host";
		el.prepend(holder);
		ctx.addChild(new ReadingHeader(holder, host, file, info.text));
	};
}

class ReadingHeader extends MarkdownRenderChild {
	constructor(
		private readonly holder: HTMLElement,
		private readonly host: HeaderHost,
		private readonly file: TFile,
		private readonly text: string,
	) {
		super(holder);
	}

	override onload(): void {
		if (this.holder.closest(".markdown-embed, .hover-popover")) {
			this.holder.remove();
			return;
		}
		this.draw(this.text);
		this.registerEvent(
			this.host.app.metadataCache.on("changed", (file, data) => {
				if (file.path === this.file.path) this.draw(data);
			}),
		);
	}

	private draw(text: string): void {
		const model = modelFromText(text, this.file.path, this.host.index, this.host.today());
		this.holder.replaceChildren();
		if (model === null) return;
		const actions = headerActions(this.host, this.file, model);
		this.holder.appendChild(buildHeader(this.holder.ownerDocument, model, actions, this.host.propertiesShown(this.file.path)));
	}
}
