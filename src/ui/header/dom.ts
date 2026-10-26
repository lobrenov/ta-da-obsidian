import type { Status } from "../../core/model/status";

const svgNamespace = "http://www.w3.org/2000/svg";

/** Icon paths on a 24px grid, drawn as strokes. */
export const iconPaths = {
	cube: "M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7L12 12l8.7-5M12 22V12",
	ring: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
	calendar: "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18",
	flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
	tag: "M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01",
	plus: "M5 12h14M12 5v14",
	x: "M18 6L6 18M6 6l12 12",
	list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
	repeat: "m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3",
	chevronDown: "M6 9l6 6 6-6",
	chevronLeft: "M15 18l-6-6 6-6",
	chevronRight: "M9 18l6-6-6-6",
	check: "M20 6L9 17l-5-5",
	file: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM14 2v4a2 2 0 0 0 2 2h4",
	alert: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 8v4M12 16h.01",
} as const;

export type IconName = keyof typeof iconPaths;

/** A stroked icon from `iconPaths`, sized in px. */
export function icon(doc: Document, name: IconName, size = 13, strokeWidth = 2): SVGElement {
	const svg = doc.createElementNS(svgNamespace, "svg");
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", String(strokeWidth));
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	svg.classList.add("ta-da-icon");
	const path = doc.createElementNS(svgNamespace, "path");
	path.setAttribute("d", iconPaths[name]);
	svg.appendChild(path);
	return svg;
}

/** An element with classes, text and attributes. File content only ever goes in as text. */
export function element<K extends keyof HTMLElementTagNameMap>(
	doc: Document,
	tag: K,
	classes: string,
	text?: string,
	attributes: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
	const node = doc.createElement(tag);
	if (classes !== "") node.className = classes;
	if (text !== undefined) node.textContent = text;
	for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
	return node;
}

const statusClasses: Record<Status, string> = {
	"Not Started": "is-not-started",
	Doing: "is-doing",
	Ongoing: "is-ongoing",
	Blocked: "is-blocked",
	Done: "is-done",
	Cancelled: "is-cancelled",
};

/** Ta Da's status box: the 14px checkbox shape in the status's colour. */
export function statusBox(doc: Document, status: Status): HTMLElement {
	const box = element(doc, "span", `ta-da-box ${statusClasses[status]}`, undefined, { "aria-hidden": "true" });
	switch (status) {
		case "Done":
			box.appendChild(icon(doc, "check", 10, 3.5));
			break;
		case "Doing":
			box.appendChild(element(doc, "span", "ta-da-box-dot"));
			break;
		case "Ongoing":
			box.appendChild(icon(doc, "chevronRight", 10, 3.5));
			break;
		case "Blocked":
			box.appendChild(element(doc, "span", "ta-da-box-dash"));
			break;
		case "Cancelled":
			box.appendChild(icon(doc, "x", 9, 3));
			break;
		case "Not Started":
			break;
	}
	return box;
}
