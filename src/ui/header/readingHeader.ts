import { type MarkdownPostProcessor, type MarkdownPostProcessorContext, MarkdownRenderChild, type TFile } from "obsidian";
import { buildHeader } from "./buildHeader";
import { headerActions, type HeaderHost } from "./headerActions";
import { buildHeaderModel, modelFromText } from "./headerModel";
import { kindOfFrontmatter, ownsHeader } from "./sections";

/**
 * Reading view: the header goes at the top of the first section after the frontmatter, or in the frontmatter's own
 * section when the file has no body. It redraws itself from the index when that changes, since Obsidian reuses a
 * section whose own text didn't change.
 */
export function readingHeaderProcessor(host: HeaderHost): MarkdownPostProcessor {
	return (el, ctx) => {
		const file = host.app.vault.getFileByPath(ctx.sourcePath);
		if (!file) return;
		const kind = host.index.get(file.path)?.properties.kind ?? kindOfFrontmatter(ctx.frontmatter);
		if (kind !== "task" && kind !== "project" && kind !== "area") return;
		const info = ctx.getSectionInfo(el);
		if (!info || !ownsHeader(info.text, info.lineStart)) return;
		el.querySelector(":scope > .ta-da-header-host")?.remove();
		const holder = el.ownerDocument.createElement("div");
		holder.className = "ta-da-header-host";
		el.classList.add("ta-da-header-section");
		el.prepend(holder);
		ctx.addChild(new ReadingHeader(el, holder, ctx, host, file, info.text));
	};
}

class ReadingHeader extends MarkdownRenderChild {
	constructor(
		private readonly section: HTMLElement,
		private readonly holder: HTMLElement,
		private readonly ctx: MarkdownPostProcessorContext,
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
		this.draw();
		this.register(this.host.onIndexChange(() => this.draw()));
	}

	/** Draws from the index, which follows the editor; empty when this section is no longer the header's. */
	private draw(): void {
		this.holder.replaceChildren();
		const info = this.ctx.getSectionInfo(this.section);
		if (info && !ownsHeader(info.text, info.lineStart)) return;
		const today = this.host.today();
		const item = this.host.index.get(this.file.path);
		const model = item ? buildHeaderModel(item, this.host.index, today) : modelFromText(this.text, this.file.path, this.host.index, today);
		if (model === null) return;
		const actions = headerActions(this.host, this.file, model);
		this.holder.appendChild(buildHeader(this.holder.ownerDocument, model, actions, this.host.propertiesShown(this.file.path)));
	}
}
