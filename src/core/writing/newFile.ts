import type { LocalDate } from "../model/localDate";
import { type Tag, uniqueTags } from "../model/tag";
import { splitFrontmatter } from "../parsing/frontmatterSplitter";
import { flowItem, quoted } from "./frontmatterEditor";

/*
 * The text of a file Ta Da creates. The title isn't written: it's the filename. Tags go in `tags:` as a flow list.
 */

/** A task names one parent: its project, or else its area. */
export function newTask(options: { project?: string | null; area?: string | null; tags?: Tag[]; today: LocalDate }): string {
	const { project, area, tags = [], today } = options;
	const keys = ["type: task", "status: Not Started"];
	if (project != null) keys.push(`project: ${quoted(`[[${project}]]`)}`);
	else if (area != null) keys.push(`area: ${quoted(`[[${area}]]`)}`);
	keys.push(`createdDate: ${today.toString()}`);
	return block(keys, tags);
}

export function newProject(options: { area?: string | null; tags?: Tag[]; today: LocalDate }): string {
	const { area, tags = [], today } = options;
	const keys = ["type: project", "status: Not Started"];
	if (area != null) keys.push(`area: ${quoted(`[[${area}]]`)}`);
	keys.push(`createdDate: ${today.toString()}`);
	return block(keys, tags);
}

export function newArea(options: { tags?: Tag[]; today: LocalDate }): string {
	const { tags = [], today } = options;
	return block(["type: area", `createdDate: ${today.toString()}`], tags);
}

/** A note always gets `tags:`, `[]` when there are none. */
export function newNote(options: { tags?: Tag[]; today: LocalDate }): string {
	const { tags = [], today } = options;
	const created = `createdDate: ${today.toString()}`;
	return tags.length === 0 ? block([created, "tags: []"], []) : block([created], tags);
}

/** A note's frontmatter, then the template's body. The template's own frontmatter isn't copied. */
export function newDailyNote(template: string | null, today: LocalDate): string {
	return newNote({ today }) + (template === null ? "" : splitFrontmatter(template).body);
}

function block(keys: string[], tags: Tag[]): string {
	const all = tags.length === 0 ? keys : [...keys, `tags: [${uniqueTags(tags).map((tag) => flowItem(tag.name)).join(", ")}]`];
	return ["---", ...all, "---", ""].join("\n");
}
