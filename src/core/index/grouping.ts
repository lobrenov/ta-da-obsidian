import type { Item } from "../model/item";
import type { LocalDate } from "../model/localDate";
import { isClosed, type Status } from "../model/status";
import { type Tag, tagParent } from "../model/tag";
import { compareTitles } from "./vaultIndex";

/** How a browser list groups its tasks. */
export const groupings = ["Project", "Status", "Date", "Open"] as const;
export type Grouping = (typeof groupings)[number];

/** Open tasks by their nearer date: Today (due or at its deadline today or earlier), Upcoming (a date after today, none by today), Someday (neither). */
export type DateGroup = "Today" | "Upcoming" | "Someday";

export type SectionKind =
	| { case: "status"; value: Status }
	| { case: "date"; value: DateGroup }
	| { case: "open" }
	| { case: "completed" };

/** A group of a Status, Date or Open list. */
export interface ListSection {
	kind: SectionKind;
	tasks: Item[];
	title: string;
}

/** Status groups' order, top to bottom. Ongoing, a project's status, follows Doing. */
export const statusOrder: readonly Status[] = ["Doing", "Ongoing", "Blocked", "Not Started", "Done", "Cancelled"];

const dateGroups: readonly DateGroup[] = ["Today", "Upcoming", "Someday"];

function section(kind: SectionKind, tasks: Item[]): ListSection {
	const title = kind.case === "status" || kind.case === "date" ? kind.value : kind.case === "open" ? "Open" : "Completed";
	return { kind, tasks, title };
}

/**
 * `tasks` split by `grouping`, keeping their order within each section and leaving empty sections out.
 * `Project` groups by area then project (`grouped`); here it gives Open and Completed.
 */
export function listSections(tasks: Item[], grouping: Grouping, today: LocalDate): ListSection[] {
	const open = tasks.filter((task) => !isClosed(task.properties.status));
	const closed = tasks.filter((task) => isClosed(task.properties.status));
	let sections: ListSection[];
	switch (grouping) {
		case "Status":
			sections = statusOrder.map((status) => section({ case: "status", value: status }, tasks.filter((task) => task.properties.status === status)));
			break;
		case "Date":
			sections = [
				...dateGroups.map((group) => section({ case: "date", value: group }, open.filter((task) => dateGroupOf(task, today) === group))),
				section({ case: "completed" }, closed),
			];
			break;
		case "Open":
		case "Project":
			sections = [section({ case: "open" }, open), section({ case: "completed" }, closed)];
			break;
	}
	return sections.filter((entry) => entry.tasks.length > 0);
}

/** Where an open item goes when grouped by date. */
export function dateGroupOf(item: Item, today: LocalDate): DateGroup {
	const dates = [item.properties.dueDate, item.properties.deadline].filter((date): date is LocalDate => date !== null);
	if (dates.some((date) => date.compare(today) <= 0)) return "Today";
	return dates.length === 0 ? "Someday" : "Upcoming";
}

/**
 * The tags picked to narrow a list. A file passes when it carries a picked tag or a child of one; with none picked,
 * every file passes.
 */
export class TagFilter {
	/** `picked` is the picked tags' paths. */
	constructor(readonly picked: ReadonlySet<string> = new Set()) {}

	get isActive(): boolean {
		return this.picked.size > 0;
	}

	matches(item: Item): boolean {
		if (!this.isActive) return true;
		return item.tags.some((use) => this.picked.has(use.tag.path) || [...this.picked].some((path) => use.tag.path.startsWith(`${path}/`)));
	}

	apply(items: Item[]): Item[] {
		return this.isActive ? items.filter((item) => this.matches(item)) : items;
	}

	/**
	 * The tags `items` carry and their parents, each with how many of the items carry it or a child of it, so a tag's
	 * count is what picking it shows. By path, as the tag tree sorts. Each tag keeps its first spelling.
	 */
	static tags(items: Item[]): { tag: Tag; count: number }[] {
		const found = new Map<string, { tag: Tag; count: number }>();
		for (const item of items) {
			const seen = new Set<string>();
			for (const use of item.tags) {
				let node: Tag | null = use.tag;
				while (node && !seen.has(node.path)) {
					seen.add(node.path);
					const current = found.get(node.path);
					found.set(node.path, { tag: current?.tag ?? node, count: (current?.count ?? 0) + 1 });
					node = tagParent(node);
				}
			}
		}
		return [...found.values()].sort((a, b) => compareTitles(a.tag.path, b.tag.path));
	}
}
