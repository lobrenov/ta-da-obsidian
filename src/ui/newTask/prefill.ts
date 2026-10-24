import type { Item } from "../../core/model/item";
import type { Tag } from "../../core/model/tag";
import { emptyDraft, type QuickEntryDraft } from "../../core/writing/quickEntryDraft";
import type { Domain } from "../navigator/domain";
import type { AgendaState } from "../navigator/agenda";

/** The list the navigator shows, and the Agenda's selection. */
export interface NewTaskContext {
	domain: Domain;
	selection: AgendaState["selection"];
}

/** What the prefill reads from the index. */
export interface PrefillIndex {
	get(path: string): Item | undefined;
	carriedTags: Tag[];
}

/**
 * A new task from what the navigator shows: in the shown project or area, tagged with the shown tag, or due on the
 * Agenda's selected day. Anywhere else, or with no navigator, a loose task.
 */
export function prefillDraft(context: NewTaskContext | null, index: PrefillIndex): QuickEntryDraft {
	const draft = emptyDraft();
	if (!context) return draft;
	const { domain, selection } = context;
	switch (domain.kind) {
		case "project":
		case "area": {
			const item = index.get(domain.path);
			if (item?.properties.kind === domain.kind) draft.parent = { kind: domain.kind, title: item.title };
			break;
		}
		case "tag": {
			const tag = domain.path === null ? undefined : index.carriedTags.find((candidate) => candidate.path === domain.path);
			if (tag) draft.tags = [tag];
			break;
		}
		case "agenda":
			if (selection.kind === "day") draft.dueDate = selection.date;
			break;
		default:
			break;
	}
	return draft;
}
