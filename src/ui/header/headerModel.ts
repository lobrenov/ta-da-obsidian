import { type Item, type Kind, subtasks } from "../../core/model/item";
import { parseItem } from "../../core/parsing/parseItem";
import type { LocalDate } from "../../core/model/localDate";
import { isClosed, type Status } from "../../core/model/status";
import { linkTitle } from "../../core/model/wikiLink";
import type { Parent } from "../../core/writing/parent";

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** How a date chip is coloured: its key's colour, or the deadline's once the day has passed, or muted when closed. */
export type DateTone = "due" | "deadline" | "muted";

export type Chip =
	| { kind: "status"; status: Status; label: string }
	| { kind: "parent"; label: string; icon: "ring" | "cube"; missing: boolean; unresolved: boolean }
	| { kind: "dueDate" | "deadline"; label: string; missing: boolean; tone: DateTone };

export interface TagChip {
	name: string;
	/** Tags written only in the body show without a remove button. */
	inFrontmatter: boolean;
}

/** What the header draws for a file, and what its menus need to mark the current choice. */
export interface HeaderModel {
	kind: Kind;
	status: Status;
	parent: Parent | null;
	dueDate: string | null;
	deadline: string | null;
	chips: Chip[];
	tags: TagChip[];
	/** The quiet line: subtasks and the created day. */
	summary: string;
}

/** The file a task or project is filed under, as `VaultIndex.parentOf` finds it. */
export interface ParentLookup {
	parentOf(item: Item): Item | null;
}

/** `Tue 6 Oct`, with the year when it isn't the current one; `Today` for today. */
export function dateLabel(date: LocalDate, today: LocalDate): string {
	if (date.equals(today)) return "Today";
	const base = `${weekdayNames[date.weekday - 1]} ${date.day} ${monthNames[date.month - 1]}`;
	return date.year === today.year ? base : `${base} ${date.year}`;
}

/** The header of a task, project or area; null for a note. */
export function buildHeaderModel(item: Item, lookup: ParentLookup, today: LocalDate): HeaderModel | null {
	const { kind, status } = item.properties;
	if (kind === "note") return null;
	const { project, area, dueDate, deadline, createdDate } = item.properties;
	const parent: Parent | null = project
		? { kind: "project", title: linkTitle(project) }
		: area
			? { kind: "area", title: linkTitle(area) }
			: null;
	const chips: Chip[] = [];
	if (kind !== "area") {
		chips.push({ kind: "status", status, label: status });
		if (parent) {
			chips.push({
				kind: "parent",
				label: parent.title,
				icon: parent.kind === "project" ? "ring" : "cube",
				missing: false,
				unresolved: lookup.parentOf(item) === null,
			});
		} else {
			chips.push({ kind: "parent", label: kind === "task" ? "Project" : "Area", icon: kind === "task" ? "ring" : "cube", missing: true, unresolved: false });
		}
		const closed = isClosed(status);
		for (const [key, date, name] of [
			["dueDate", dueDate, "Due"],
			["deadline", deadline, "Deadline"],
		] as const) {
			if (date === null) {
				chips.push({ kind: key, label: name, missing: true, tone: "muted" });
				continue;
			}
			const tone: DateTone = closed ? "muted" : date.compare(today) < 0 ? "deadline" : key === "dueDate" ? "due" : "deadline";
			chips.push({ kind: key, label: `${name} ${dateLabel(date, today)}`, missing: false, tone });
		}
	}
	const parts: string[] = [];
	const { done, total } = subtasks(item);
	if (total > 0) parts.push(`${done}/${total} subtasks`);
	if (createdDate) parts.push(`Created ${dateLabel(createdDate, today)}`.replace("Created Today", "Created today"));
	return {
		kind,
		status,
		parent,
		dueDate: dueDate?.toString() ?? null,
		deadline: deadline?.toString() ?? null,
		chips,
		tags: item.tags.map((use) => ({ name: use.tag.name, inFrontmatter: use.inFrontmatter })),
		summary: parts.join(" · "),
	};
}

/** The header for a file's text, as typed; null for a note or a file Ta Da doesn't read. */
export function modelFromText(text: string, path: string, lookup: ParentLookup, today: LocalDate): HeaderModel | null {
	const item = parseItem(text, path);
	return item === null ? null : buildHeaderModel(item, lookup, today);
}

/** The statuses a menu offers, in the app's order; Ongoing only for projects. */
export function statusChoices(kind: Kind): Status[] {
	return kind === "project"
		? ["Not Started", "Doing", "Ongoing", "Blocked", "Done", "Cancelled"]
		: ["Not Started", "Doing", "Blocked", "Done", "Cancelled"];
}
