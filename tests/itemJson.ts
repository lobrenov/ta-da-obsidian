import { type Item, isLogged, isNotePath, subtasks } from "../src/core/model/item";
import type { LocalDate } from "../src/core/model/localDate";
import type { WikiLink } from "../src/core/model/wikiLink";

const link = (value: WikiLink | null): unknown => value && { target: value.target, heading: value.heading, alias: value.alias };
const date = (value: LocalDate | null): string | null => (value === null ? null : value.toString());

/** An item as the export's JSON has it. */
export function itemJson(item: Item): unknown {
	const p = item.properties;
	return {
		path: item.path,
		title: item.title,
		kind: p.kind,
		status: p.status,
		area: link(p.area),
		project: link(p.project),
		createdDate: date(p.createdDate),
		completedDate: date(p.completedDate),
		dueDate: date(p.dueDate),
		deadline: date(p.deadline),
		repeat: p.repeatRule,
		tags: p.tags.map((tag) => tag.name),
		summary: item.summary,
		hasNote: item.hasNote,
		subtasks: subtasks(item),
		checkboxes: item.checkboxes.map((box) => ({ marker: box.marker, lineIndex: box.lineIndex, column: box.column, state: box.state })),
		links: item.links.map(link),
		embeds: item.embeds.map(link),
		tagUses: item.tags.map((use) => ({ tag: use.tag.name, inFrontmatter: use.inFrontmatter, inBody: use.inBody })),
		warnings: item.warnings,
		isLogged: isLogged(item),
		isNotePath: isNotePath(item.path),
	};
}
