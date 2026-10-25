import { defaultDailyNoteNames } from "../src/core/index/dailyNotes";
import type { LocalDate } from "../src/core/model/localDate";
import type { VaultIndex } from "../src/core/index/vaultIndex";
import { buildList, type ListContext, type ListModel, type ListOptions, type SectionHeader } from "../src/ui/navigator/listModel";
import type { Domain } from "../src/ui/navigator/domain";
import type { ListRow } from "../src/ui/navigator/rows";
import { agendaOn } from "../src/ui/navigator/agenda";

export function context(index: VaultIndex, today: LocalDate, extra: Partial<ListContext> = {}): ListContext {
	return { index, today, trash: [], agenda: agendaOn(today), notes: { names: defaultDailyNoteNames, weekNotes: true }, ...extra };
}

export function options(extra: Partial<ListOptions> = {}): ListOptions {
	return { groupings: {}, picked: new Set(), folds: new Set(), ...extra };
}

export function list(domain: Domain, ctx: ListContext, extra: Partial<ListOptions> = {}): ListModel {
	const model = buildList(domain, ctx, options(extra));
	if (!model) throw new Error(`No list for ${JSON.stringify(domain)}`);
	return model;
}

function headerText(header: SectionHeader | null): string {
	if (!header) return "-";
	switch (header.style) {
		case "count":
			return `${header.quiet ? "quiet " : ""}${header.title} ${header.count}`;
		case "area":
			return `area ${header.title} ${header.count}`;
		case "project":
			return `${header.sub ? "sub" : "project"} ${header.title} ${header.count}${header.area ? ` (${header.area})` : ""}`;
		case "loose":
			return "Loose";
		case "dayTitle":
			return `day ${header.title}${header.relative ? ` (${header.relative})` : ""}`;
		case "scheduled":
			return "scheduled";
		case "weekTitle":
			return `week ${header.title} ${header.range}${header.thisWeek ? " (this week)" : ""}`;
		case "archive":
			return `${header.title}${header.note ? ` [${header.note}]` : ""}`;
	}
}

function rowText(row: ListRow): string {
	switch (row.type) {
		case "task": {
			const parts = [row.title, `[${row.status}]`];
			if (row.place) parts.push(`in ${row.place}`);
			if (row.subtasks) parts.push(`${row.subtasks.done}/${row.subtasks.total}`);
			if (row.date) parts.push(`${row.date.kind === "deadline" ? "deadline " : "due "}${row.date.text}${row.date.overdue ? " (overdue)" : ""}`);
			if (row.tags > 0) parts.push(`${row.tags} tag${row.tags === 1 ? "" : "s"}`);
			return parts.join(" | ");
		}
		case "project":
		case "area":
			return [row.type, row.title, row.variant, row.meta, row.deadline?.text, row.open === null ? null : `${row.open} open`].filter((part) => part !== null && part !== undefined).join(" | ");
		case "note":
			return ["note", row.title, row.folder].filter((part) => part !== null).join(" | ");
		case "periodNote":
			return ["periodNote", row.name, row.path === null ? "create" : null, row.file, row.summary, row.open > 0 ? `${row.open} open` : null, row.subtasks ? `${row.subtasks.done}/${row.subtasks.total}` : null].filter((part) => part !== null).join(" | ");
		case "day":
			return ["day", row.label, row.summary || null, row.hasOpenTasks ? "dot" : null, row.hasOpenBoxes ? "ring" : null, row.today ? "today" : null].filter((part) => part !== null).join(" | ");
		case "logged":
		case "trashed":
			return [row.type, row.kind, row.title, `[${row.status}]`, row.meta, row.date].filter((part) => part !== null).join(" | ");
	}
}

/** A list as lines: each section's header (`+` while folded) and its rows indented. */
export function describeList(model: ListModel): string[] {
	const lines: string[] = [];
	for (const section of model.sections) {
		lines.push(`${section.folded ? "+" : "#"} ${headerText(section.header)}${section.message ? ` {${section.message}}` : ""}`);
		for (const row of section.rows) lines.push(`    ${rowText(row)}`);
	}
	return lines;
}
