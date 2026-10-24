import { clearProperty, setProperty } from "./frontmatterEditor";

/** What a task or project is filed under, by title. A task names one project or one area; a project names an area. */
export interface Parent {
	kind: "project" | "area";
	title: string;
}

/** Writes `parent` as a link and empties the other key; null empties both. Keys that are missing stay missing. */
export function setParent(parent: Parent | null, text: string): string {
	if (parent === null) return clearProperty("area", clearProperty("project", text));
	const other = parent.kind === "project" ? "area" : "project";
	return clearProperty(other, setProperty(parent.kind, { kind: "link", title: parent.title }, text));
}
