import type { Chip, HeaderModel, TagChip } from "./headerModel";
import { element, icon, statusBox } from "./dom";

/** What the header's buttons do. Each opens its menu under the button it's given, or writes. */
export interface HeaderActions {
	openStatus(anchor: HTMLElement): void;
	openParent(anchor: HTMLElement): void;
	openDate(key: "dueDate" | "deadline", anchor: HTMLElement): void;
	openAddTag(anchor: HTMLElement): void;
	removeTag(name: string): void;
	/** Shows or hides Obsidian's Properties for the file; returns whether they're shown now. */
	toggleProperties(): boolean;
}

/** Draws the header: the chip row, the tag row and the quiet line. Live Preview and Reading view both use this. */
export function buildHeader(doc: Document, model: HeaderModel, actions: HeaderActions, propertiesShown: boolean): HTMLElement {
	const header = element(doc, "div", `ta-da-header is-${model.kind}`, undefined, { contenteditable: "false" });
	const inner = element(doc, "div", "ta-da-header-inner");
	header.appendChild(inner);
	const chips = element(doc, "div", "ta-da-header-chips");
	for (const chip of model.chips) chips.appendChild(buildChip(doc, chip, actions));
	chips.appendChild(element(doc, "span", "ta-da-grow"));
	chips.appendChild(buildPropertiesButton(doc, actions, propertiesShown));
	inner.appendChild(chips);

	const tags = element(doc, "div", "ta-da-header-tags");
	for (const tag of model.tags) tags.appendChild(buildTag(doc, tag, actions));
	const add = element(doc, "button", "ta-da-tag-add", undefined, { type: "button", "aria-label": "Add tag", "aria-haspopup": "menu" });
	add.appendChild(icon(doc, "plus", 11, 2.4));
	add.addEventListener("click", () => actions.openAddTag(add));
	tags.appendChild(add);
	if (model.summary !== "") tags.appendChild(element(doc, "span", "ta-da-summary", model.summary));
	inner.appendChild(tags);
	return header;
}

function buildPropertiesButton(doc: Document, actions: HeaderActions, shown: boolean): HTMLElement {
	const button = element(doc, "button", "ta-da-properties-button", undefined, {
		type: "button",
		"aria-label": "Show Obsidian properties",
		"aria-pressed": String(shown),
	});
	button.classList.toggle("is-on", shown);
	button.appendChild(icon(doc, "list", 13));
	button.appendChild(doc.createTextNode("Properties"));
	button.addEventListener("click", () => {
		const now = actions.toggleProperties();
		button.setAttribute("aria-pressed", String(now));
		button.classList.toggle("is-on", now);
	});
	return button;
}

/** A chip's button; the New task modal draws these too. */
export function buildChip(doc: Document, chip: Chip, actions: Pick<HeaderActions, "openStatus" | "openParent" | "openDate">): HTMLElement {
	const classes = ["ta-da-chip", `is-${chip.kind}`];
	if ("missing" in chip && chip.missing) classes.push("is-missing");
	if (chip.kind === "parent" && chip.unresolved) classes.push("is-unresolved");
	if (chip.kind === "dueDate" || chip.kind === "deadline") classes.push(`tone-${chip.tone}`);
	const button = element(doc, "button", classes.join(" "), undefined, { type: "button", "aria-haspopup": "menu" });
	switch (chip.kind) {
		case "status":
			button.appendChild(statusBox(doc, chip.status));
			break;
		case "parent":
			button.appendChild(icon(doc, chip.icon));
			break;
		case "dueDate":
			button.appendChild(icon(doc, "calendar"));
			break;
		case "deadline":
			button.appendChild(icon(doc, "flag"));
			break;
	}
	button.appendChild(element(doc, "span", "ta-da-chip-label", chip.label));
	if ((chip.kind === "dueDate" || chip.kind === "deadline") && chip.repeat) {
		const suffix = button.appendChild(element(doc, "span", `ta-da-chip-repeat${chip.repeat.readable ? "" : " is-unreadable"}`));
		suffix.appendChild(doc.createTextNode("·"));
		suffix.appendChild(icon(doc, chip.repeat.readable ? "repeat" : "alert", 10, 2.2));
		suffix.appendChild(doc.createTextNode(chip.repeat.label));
		button.title = chip.repeat.tooltip;
	}
	if (chip.kind === "status") button.appendChild(icon(doc, "chevronDown", 10, 2.2));
	button.addEventListener("click", () => {
		switch (chip.kind) {
			case "status":
				return actions.openStatus(button);
			case "parent":
				return actions.openParent(button);
			case "dueDate":
			case "deadline":
				return actions.openDate(chip.kind, button);
		}
	});
	return button;
}

/** A tag's chip, with a remove button for one written in `tags:`. */
export function buildTag(doc: Document, tag: TagChip, actions: Pick<HeaderActions, "removeTag">): HTMLElement {
	const chip = element(doc, "span", `ta-da-tag${tag.inFrontmatter ? "" : " is-text"}`);
	chip.appendChild(icon(doc, "tag", 11, 2));
	const label = element(doc, "span", "ta-da-tag-label");
	const slash = tag.name.lastIndexOf("/");
	if (slash >= 0) label.appendChild(element(doc, "span", "ta-da-tag-path", tag.name.slice(0, slash + 1)));
	label.appendChild(doc.createTextNode(tag.name.slice(slash + 1)));
	chip.appendChild(label);
	if (tag.inFrontmatter) {
		const remove = element(doc, "button", "ta-da-tag-remove", undefined, { type: "button", "aria-label": `Remove tag ${tag.name}` });
		remove.appendChild(icon(doc, "x", 9, 2.6));
		remove.addEventListener("click", () => actions.removeTag(tag.name));
		chip.appendChild(remove);
	} else {
		chip.title = "Written in the text";
	}
	return chip;
}
