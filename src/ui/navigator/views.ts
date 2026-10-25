import type { Domain } from "./domain";

/** The three views: each its own sidebar tab and phone drawer entry. */
export const viewKinds = ["agenda", "tasks", "tags"] as const;

export type ViewKind = (typeof viewKinds)[number];

export interface ViewSpec {
	type: string;
	title: string;
	icon: string;
	/** The command and ribbon icon that open it. */
	openName: string;
	commandId: string;
}

export const viewSpecs: Record<ViewKind, ViewSpec> = {
	agenda: { type: "ta-da-agenda", title: "Ta Da: Agenda", icon: "calendar", openName: "Open Ta Da: Agenda", commandId: "open-agenda" },
	tasks: { type: "ta-da-tasks", title: "Ta Da: Tasks", icon: "circle-check", openName: "Open Ta Da: Tasks", commandId: "open-tasks" },
	tags: { type: "ta-da-tags", title: "Ta Da: Tags", icon: "tags", openName: "Open Ta Da: Tags", commandId: "open-tags" },
};

/** Whether a view's list pane can show a domain. Search shows in Tasks and Tags. */
export function offersDomain(view: ViewKind, domain: Domain): boolean {
	switch (domain.kind) {
		case "agenda":
			return view === "agenda";
		case "loose":
		case "logbook":
		case "trash":
		case "project":
		case "area":
			return view === "tasks";
		case "tag":
			return view === "tags";
		case "search":
			return view !== "agenda";
	}
}

/** What a view's list pane shows until something else is picked. */
export function defaultDomain(view: ViewKind): Domain {
	switch (view) {
		case "agenda":
			return { kind: "agenda" };
		case "tasks":
			return { kind: "loose" };
		case "tags":
			return { kind: "tag", path: null };
	}
}
