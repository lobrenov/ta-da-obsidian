import { setIcon } from "obsidian";
import type { Status } from "../../core/model/status";
import type { IconSpec, Tint } from "./rows";

const svgNamespace = "http://www.w3.org/2000/svg";

/** An SVG element with its attributes. Children are added by the caller. */
function svg(parent: Element, tag: string, attributes: Record<string, string>): SVGElement {
	const element = parent.ownerDocument.createElementNS(svgNamespace, tag);
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
	parent.appendChild(element);
	return element;
}

/** A 16-unit icon of one stroked path. */
function pathIcon(parent: HTMLElement, size: number, path: string): void {
	const root = svg(parent, "svg", { viewBox: "0 0 16 16", width: String(size), height: String(size), fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" });
	svg(root, "path", { d: path });
}

/** An icon: a Lucide icon in a token's colour, a project's progress ring, or an area's cube. */
export function drawIcon(parent: HTMLElement, spec: IconSpec): HTMLElement {
	switch (spec.type) {
		case "icon": {
			const el = parent.createSpan({ cls: `ta-da-icon is-${spec.tint}${spec.filled ? " is-filled" : ""}` });
			setIcon(el, spec.name);
			return el;
		}
		case "area": {
			const el = parent.createSpan({ cls: "ta-da-icon is-doing" });
			setIcon(el, "box");
			return el;
		}
		case "ring": {
			const el = parent.createSpan({ cls: "ta-da-icon is-accent" });
			if (spec.ongoing) setIcon(el, "list-checks");
			else progressRing(el, spec.fraction);
			return el;
		}
	}
}

/** A ring with a pie of `fraction` inside it. */
export function progressRing(parent: HTMLElement, fraction: number): void {
	const root = svg(parent, "svg", { viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": "true" });
	svg(root, "circle", { cx: "8", cy: "8", r: "6.4", fill: "none", stroke: "currentColor", "stroke-width": "1.5" });
	if (fraction >= 1) {
		svg(root, "circle", { cx: "8", cy: "8", r: "3.6", fill: "currentColor" });
	} else if (fraction > 0) {
		const angle = fraction * 2 * Math.PI;
		const x = (8 + 3.6 * Math.sin(angle)).toFixed(3);
		const y = (8 - 3.6 * Math.cos(angle)).toFixed(3);
		svg(root, "path", { d: `M8 8 L8 4.4 A3.6 3.6 0 ${fraction > 0.5 ? 1 : 0} 1 ${x} ${y} Z`, fill: "currentColor" });
	}
}

/** The glyph in a task row's meta line. */
export function metaIcon(parent: HTMLElement, name: string, tint: Tint | null = null): HTMLElement {
	const el = parent.createSpan({ cls: `ta-da-meta-icon${tint ? ` is-${tint}` : ""}` });
	setIcon(el, name);
	return el;
}

/** The checkbox's class for a status. */
export function checkboxClass(status: Status): string {
	switch (status) {
		case "Doing":
			return "is-doing";
		case "Blocked":
			return "is-blocked";
		case "Done":
			return "is-done";
		case "Cancelled":
			return "is-cancelled";
		case "Ongoing":
			return "is-ongoing";
		case "Not Started":
			return "";
	}
}

/**
 * A status checkbox: a button when `onClick` is given, else a plain box. Not Started is empty, Doing a square, Blocked
 * a bar, Done a tick on a filled box, Cancelled a dash and Ongoing an arrow.
 */
export function drawCheckbox(parent: HTMLElement, status: Status, label: string, onClick: ((event: MouseEvent) => void) | null): HTMLElement {
	const cls = `ta-da-checkbox ${checkboxClass(status)}`.trim();
	const box = onClick ? parent.createEl("button", { cls, attr: { type: "button", "aria-label": label } }) : parent.createSpan({ cls });
	switch (status) {
		case "Done":
			pathIcon(box, 11, "M3.5 8.2l2.6 2.6 5.5-5.6");
			break;
		case "Cancelled":
			pathIcon(box, 11, "M4 8h8");
			break;
		case "Ongoing":
			pathIcon(box, 11, "M3.5 8h8M8.5 4.5L12 8l-3.5 3.5");
			break;
		case "Doing":
			box.createSpan({ cls: "ta-da-checkbox-mark is-square" });
			break;
		case "Blocked":
			box.createSpan({ cls: "ta-da-checkbox-mark is-bar" });
			break;
		case "Not Started":
			break;
	}
	if (onClick) box.addEventListener("click", onClick);
	return box;
}
