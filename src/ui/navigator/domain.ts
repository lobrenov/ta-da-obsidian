import { type Grouping, groupings } from "../../core/index/grouping";

/** What the list pane shows. `search` is the navigation pane's search field. */
export type Domain =
	/** The Agenda; its day or week is kept apart, in `AgendaState`. */
	| { kind: "agenda" }
	| { kind: "loose" }
	| { kind: "logbook" }
	| { kind: "trash" }
	| { kind: "project"; path: string }
	| { kind: "area"; path: string }
	/** A tag's path, or null for Untagged. */
	| { kind: "tag"; path: string | null }
	| { kind: "search"; query: string };

/** A key that names a domain: for the fold, tag filter and selection state kept per list. */
export function domainKey(domain: Domain): string {
	switch (domain.kind) {
		case "project":
		case "area":
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

/** The lists with a Group choice. Every project shares one. */
export type GroupedList = "agenda" | "loose" | "project";

export function groupedListOf(domain: Domain): GroupedList | null {
	switch (domain.kind) {
		case "agenda":
		case "loose":
		case "project":
			return domain.kind;
		default:
			return null;
	}
}

/** The Group menu's choices, in order. */
export const groupChoices: Record<GroupedList, readonly Grouping[]> = {
	agenda: ["Project", "Status", "Open"],
	loose: ["Status", "Date", "Open"],
	project: ["Status", "Date", "Open"],
};

export const defaultGrouping: Record<GroupedList, Grouping> = {
	agenda: "Project",
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
		case "agenda":
		case "loose":
		case "logbook":
		case "trash":
			return { kind };
		// Saved before the Agenda replaced both.
		case "today":
		case "upcoming":
			return { kind: "agenda" };
		case "project":
		case "area":
			return typeof path === "string" ? { kind, path } : null;
		case "tag":
			return typeof path === "string" || path === null ? { kind, path } : null;
		default:
			return null;
	}
}

/** Groupings read back from saved view state: only a list's own choices, any other key or value dropped. */
export function readGroupings(value: unknown): Groupings {
	const saved = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
	const result: Groupings = {};
	for (const list of ["agenda", "loose", "project"] as const) {
		const choice = saved[list];
		if (typeof choice === "string" && (groupings as readonly string[]).includes(choice) && groupChoices[list].includes(choice as Grouping)) result[list] = choice as Grouping;
	}
	return result;
}
