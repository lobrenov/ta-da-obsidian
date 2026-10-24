import { areaProjects, looseProjects, looseTasks, type ProjectProgress, todayTasks } from "../../core/index/queries";
import { folderTree, type FolderNode, looseNotes } from "../../core/index/noteQueries";
import { type TagNode, tagTree, untagged } from "../../core/index/tagQueries";
import { isClosed } from "../../core/model/status";
import { tagLeaf } from "../../core/model/tag";
import type { Domain, NavMode } from "./domain";
import type { ListContext } from "./listModel";
import { type IconSpec, projectIcon } from "./rows";

/** One row of the navigation pane: a domain, or a folder of the tag or notes tree. */
export interface NavItem {
	/** Unique in the pane; a tree row's is what its fold is kept under. */
	id: string;
	domain: Domain;
	label: string;
	icon: IconSpec;
	count: number | null;
	depth: number;
	/** An area, tag parent or folder reads in strong type. */
	strong: boolean;
	/** The row has children: whether they show. */
	expanded: boolean | null;
}

export interface NavModel {
	/** Today, Upcoming, Loose tasks, Logbook and Trash. */
	domains: NavItem[];
	/** The rows under the Tasks | Tags | Notes switch. */
	tree: NavItem[];
}

/** The tag and folder tree rows that are open: those whose id is here. Everything else starts closed. */
export type Expanded = ReadonlySet<string>;

/** The navigation pane's rows for `mode`. */
export function buildNav(ctx: ListContext, mode: NavMode, expanded: Expanded): NavModel {
	const { index, today } = ctx;
	const domains: NavItem[] = [
		item("today", { kind: "today" }, "Today", { type: "icon", name: "star", tint: "due", filled: true }, todayTasks(index, today).filter((task) => !isClosed(task.properties.status)).length),
		item("upcoming", { kind: "upcoming" }, "Upcoming", { type: "icon", name: "calendar", tint: "deadline" }, null),
		item("loose", { kind: "loose" }, "Loose tasks", { type: "icon", name: "inbox", tint: "accent" }, looseTasks(index).length),
		item("logbook", { kind: "logbook" }, "Logbook", { type: "icon", name: "book-check", tint: "done" }, null),
		item("trash", { kind: "trash" }, "Trash", { type: "icon", name: "trash-2", tint: "muted" }, ctx.trash.length),
	];
	return { domains, tree: tree(ctx, mode, expanded) };
}

function tree(ctx: ListContext, mode: NavMode, expanded: Expanded): NavItem[] {
	const { index } = ctx;
	switch (mode) {
		case "tasks": {
			const rows: NavItem[] = looseProjects(index).map((entry) => projectItem(ctx, entry, 0));
			for (const { area, projects } of areaProjects(index)) {
				rows.push({ ...item(`area:${area.path}`, { kind: "area", path: area.path }, area.title, { type: "area" }, null), strong: true });
				rows.push(...projects.map((entry) => projectItem(ctx, entry, 1)));
			}
			return rows;
		}
		case "tags": {
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
		case "notes": {
			const rows = [item("folder:", { kind: "folder", path: "" }, "Loose", { type: "icon", name: "inbox", tint: "link" }, looseNotes(index).length)];
			const walk = (nodes: FolderNode[], depth: number): void => {
				for (const node of nodes) {
					const id = `folder:${node.path}`;
					const parent = node.children.length > 0;
					rows.push({ ...item(id, { kind: "folder", path: node.path }, node.name, { type: "icon", name: "folder", tint: "link" }, node.count), depth, expanded: parent ? expanded.has(id) : null });
					if (parent && expanded.has(id)) walk(node.children, depth + 1);
				}
			};
			walk(folderTree(index, ctx.folders), 0);
			return rows;
		}
	}
}

function projectItem(ctx: ListContext, entry: ProjectProgress, depth: number): NavItem {
	const { project } = entry;
	return { ...item(`project:${project.path}`, { kind: "project", path: project.path }, project.title, projectIcon(ctx.index, project), entry.total - entry.done), depth };
}

function item(id: string, domain: Domain, label: string, icon: IconSpec, count: number | null): NavItem {
	return { id, domain, label, icon, count, depth: 0, strong: false, expanded: null };
}

/** The ids of the tree rows above a domain, which open to show it. */
export function ancestorsOf(domain: Domain): string[] {
	const parts = (path: string): string[] => path.split("/").map((_, at, all) => all.slice(0, at + 1).join("/")).slice(0, -1);
	switch (domain.kind) {
		case "tag":
			return domain.path === null ? [] : parts(domain.path).map((path) => `tag:${path}`);
		case "folder":
			return parts(domain.path).map((path) => `folder:${path}`);
		default:
			return [];
	}
}
