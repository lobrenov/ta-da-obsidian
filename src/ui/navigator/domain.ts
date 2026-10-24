import type { Grouping } from "../../core/index/grouping";

/** What the list pane shows. `search` is the navigation pane's search field. */
export type Domain =
	| { kind: "today" }
	| { kind: "upcoming" }
	| { kind: "loose" }
	| { kind: "logbook" }
	| { kind: "trash" }
	| { kind: "project"; path: string }
	| { kind: "area"; path: string }
	/** A tag's path, or null for Untagged. */
	| { kind: "tag"; path: string | null }
	/** A notes folder; `""` is Loose, the top level. */
	| { kind: "folder"; path: string }
	| { kind: "search"; query: string };

/** The navigation pane's Tasks | Tags | Notes switch. */
export type NavMode = "tasks" | "tags" | "notes";

export const navModes: readonly NavMode[] = ["tasks", "tags", "notes"];

/** A key that names a domain: for the fold, tag filter and selection state kept per list. */
export function domainKey(domain: Domain): string {
	switch (domain.kind) {
		case "project":
		case "area":
		case "folder":
			return `${domain.kind}:${domain.path}`;
		case "tag":
			return `tag:${domain.path ?? ""}`;
		case "search":
			return "search";
		default:
			return domain.kind;
	}
}

export function sameDomain(a: Domain, b: Domain): boolean {
	return domainKey(a) === domainKey(b);
}

/** The navigation mode a domain sits under. */
export function modeOf(domain: Domain): NavMode | null {
	switch (domain.kind) {
		case "project":
		case "area":
			return "tasks";
		case "tag":
			return "tags";
		case "folder":
			return "notes";
		default:
			return null;
	}
}

/** The lists with a Group choice. Every project shares one. */
export type GroupedList = "today" | "loose" | "project";

export function groupedListOf(domain: Domain): GroupedList | null {
	switch (domain.kind) {
		case "today":
		case "loose":
		case "project":
			return domain.kind;
		default:
			return null;
	}
}

/** The Group menu's choices, in order. */
export const groupChoices: Record<GroupedList, readonly Grouping[]> = {
	today: ["Project", "Status", "Open"],
	loose: ["Status", "Date", "Open"],
	project: ["Status", "Date", "Open"],
};

export const defaultGrouping: Record<GroupedList, Grouping> = {
	today: "Project",
	loose: "Status",
	project: "Open",
};

export type Groupings = Partial<Record<GroupedList, Grouping>>;

/** The grouping a list uses: the picked one when it's one of the list's choices, else the default. */
export function groupingOf(list: GroupedList, groupings: Groupings): Grouping {
	const picked = groupings[list];
	return picked && groupChoices[list].includes(picked) ? picked : defaultGrouping[list];
}

/** A domain read back from saved view state; null for anything that isn't one. Search isn't saved. */
export function readDomain(value: unknown): Domain | null {
	if (typeof value !== "object" || value === null) return null;
	const { kind, path } = value as { kind?: unknown; path?: unknown };
	switch (kind) {
		case "today":
		case "upcoming":
		case "loose":
		case "logbook":
		case "trash":
			return { kind };
		case "project":
		case "area":
		case "folder":
			return typeof path === "string" ? { kind, path } : null;
		case "tag":
			return typeof path === "string" || path === null ? { kind, path } : null;
		default:
			return null;
	}
}
