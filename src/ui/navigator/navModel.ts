import { areaProjects, looseProjects, looseTasks, type ProjectProgress } from "../../core/index/queries";
import { type TagNode, tagTree, untagged } from "../../core/index/tagQueries";
import { tagLeaf } from "../../core/model/tag";
import type { Domain } from "./domain";
import type { ListContext } from "./listModel";
import { type IconSpec, projectIcon } from "./rows";
import type { ViewKind } from "./views";

/** One row of the navigation pane: a domain, or a row of the Tasks tree or the tag tree. */
export interface NavItem {
	/** Unique in the pane; a tree row's is what its fold is kept under. */
	id: string;
	domain: Domain;
	label: string;
	icon: IconSpec;
	count: number | null;
	depth: number;
	/** Space above the row, where the tree begins and where each area with its projects begins. */
	gap: boolean;
	/** An area or tag parent reads in strong type. */
	strong: boolean;
	/** The row has children: whether they show. */
	expanded: boolean | null;
}

/** The tag tree rows that are open: those whose id is here. Everything else starts closed. */
export type Expanded = ReadonlySet<string>;

/** The navigation pane's rows for the Tasks or Tags view. */
export function buildNav(ctx: ListContext, view: Exclude<ViewKind, "agenda">, expanded: Expanded): NavItem[] {
	const { index } = ctx;
	if (view === "tags") {
		const rows = [item("untagged", { kind: "tag", path: null }, "Untagged", { type: "icon", name: "tag", tint: "muted" }, untagged(index).length)];
		const walk = (nodes: TagNode[], depth: number): void => {
			for (const node of nodes) {
				const id = `tag:${node.tag.path}`;
				const parent = node.children.length > 0;
				rows.push({ ...item(id, { kind: "tag", path: node.tag.path }, tagLeaf(node.tag), { type: "icon", name: "tag", tint: "accent" }, node.count), depth, expanded: parent ? expanded.has(id) : null });
				if (parent && expanded.has(id)) walk(node.children, depth + 1);
			}
		};
		walk(tagTree(index), 0);
		return rows;
	}
	const rows: NavItem[] = [
		item("loose", { kind: "loose" }, "Loose tasks", { type: "icon", name: "inbox", tint: "accent" }, looseTasks(index).length),
		item("logbook", { kind: "logbook" }, "Logbook", { type: "icon", name: "book-check", tint: "done" }, null),
		item("trash", { kind: "trash" }, "Trash", { type: "icon", name: "trash-2", tint: "muted" }, ctx.trash.length),
	];
	const treeStart = rows.length;
	rows.push(...looseProjects(index).map((entry) => projectItem(ctx, entry, 0)));
	for (const { area, projects } of areaProjects(index)) {
		rows.push({ ...item(`area:${area.path}`, { kind: "area", path: area.path }, area.title, { type: "area" }, null), strong: true, gap: true });
		rows.push(...projects.map((entry) => projectItem(ctx, entry, 0)));
	}
	const [top] = rows.slice(treeStart);
	if (top) rows[treeStart] = { ...top, gap: true };
	return rows;
}

function projectItem(ctx: ListContext, entry: ProjectProgress, depth: number): NavItem {
	const { project } = entry;
	return { ...item(`project:${project.path}`, { kind: "project", path: project.path }, project.title, projectIcon(ctx.index, project), entry.total - entry.done), depth };
}

function item(id: string, domain: Domain, label: string, icon: IconSpec, count: number | null): NavItem {
	return { id, domain, label, icon, count, depth: 0, strong: false, gap: false, expanded: null };
}

/** The ids of the tag rows above a domain, which open to show it. */
export function ancestorsOf(domain: Domain): string[] {
	const parts = (path: string): string[] => path.split("/").map((_, at, all) => all.slice(0, at + 1).join("/")).slice(0, -1);
	switch (domain.kind) {
		case "tag":
			return domain.path === null ? [] : parts(domain.path).map((path) => `tag:${path}`);
		default:
			return [];
	}
}
