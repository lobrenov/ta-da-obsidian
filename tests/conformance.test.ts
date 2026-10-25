import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { TagFilter, groupings, listSections, type ListSection } from "../src/core/index/grouping";
import { type FolderNode, folderTree, notesIn } from "../src/core/index/noteQueries";
import * as queries from "../src/core/index/queries";
import { type TagNode, itemsTagged, tagBrowser, tagSuggestions, tagTree, untagged } from "../src/core/index/tagQueries";
import { type Item, isLogged, type Warning } from "../src/core/model/item";
import { LocalDate } from "../src/core/model/localDate";
import { parseItem } from "../src/core/parsing/parseItem";
import { contentsOf, tasksOf, trashedItems, type TrashedItem } from "../src/core/storage/trash";
import { compareCodeUnits } from "../src/core/text";
import { itemJson } from "./itemJson";
import { taDaRepo } from "./taDaRepo";

/** Swift's exports and the fixture vault: the Ta Da repo's `Conformance` folder, beside this repo. */
const conformanceFolder = resolve(taDaRepo, "Packages/TaDaCore/Tests/TaDaCoreTests/Fixtures/Conformance");

const vaultFolders: Record<string, string> = {
	DesignVault: resolve(conformanceFolder, "../DesignVault"),
	HomeVault: resolve(conformanceFolder, "HomeVault"),
};

interface ReadExport {
	today: string;
	vaults: { name: string; files: { path: string; item: unknown }[] }[];
}

interface QueriesExport {
	today: string;
	vaults: ({ name: string } & Record<string, unknown>)[];
}

function loadJson<T>(name: string): T {
	return JSON.parse(readFileSync(join(conformanceFolder, name), "utf8")) as T;
}

/** Every `.md` file under `folder`, hidden folders included, by `/` path relative to it. */
function readVault(folder: string): Map<string, string> {
	const files = new Map<string, string>();
	const walk = (directory: string, prefix: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.isDirectory()) walk(join(directory, entry.name), `${prefix}${entry.name}/`);
			else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
				files.set(`${prefix}${entry.name}`, readFileSync(join(directory, entry.name), "utf8"));
			}
		}
	};
	walk(folder, "");
	return files;
}

/** `invalidYAML` warnings compare on their case only: the problem text and line come from different YAML libraries. */
const maskYaml = (warnings: Warning[]): unknown[] =>
	warnings.map((warning) => (warning.case === "invalidYAML" ? { case: "invalidYAML" } : warning));

const sortedPaths = (items: Item[]): string[] => items.map((item) => item.path).sort(compareCodeUnits);
const inOrder = (items: Item[]): string[] => items.map((item) => item.path);
const entries = (list: queries.AgendaEntry[]): unknown =>
	list.map((entry) => ({ path: entry.item.path, date: entry.date.toString(), kind: entry.kind }));
const progress = (list: queries.ProjectProgress[]): unknown =>
	list.map((entry) => ({ path: entry.project.path, done: entry.done, total: entry.total }));

const tagNodeJson = (node: TagNode): unknown => ({ tag: node.tag.name, path: node.tag.path, count: node.count, children: node.children.map(tagNodeJson) });
const allTagNodes = (nodes: TagNode[]): TagNode[] => nodes.flatMap((node) => [node, ...allTagNodes(node.children)]);
const folderJson = (node: FolderNode): unknown => ({ path: node.path, name: node.name, count: node.count, children: node.children.map(folderJson) });
const allFolders = (nodes: FolderNode[]): string[] => nodes.flatMap((node) => [node.path, ...allFolders(node.children)]);
const sectionJson = (section: ListSection): unknown => ({
	title: section.title,
	kind: { case: section.kind.case, value: "value" in section.kind ? section.kind.value : null },
	tasks: section.tasks.map((task) => task.path),
});
const trashedPaths = (list: TrashedItem[]): string[] => list.map((entry) => entry.item.path);
const fromPaths = (entries: [string, unknown][]): Record<string, unknown> => Object.fromEntries(entries);

const readExport = loadJson<ReadExport>("read.json");
const queriesExport = loadJson<QueriesExport>("queries.json");

function parseVault(name: string): { items: Item[]; index: VaultIndex; trashed: TrashedItem[] } {
	const folder = vaultFolders[name];
	if (!folder) throw new Error(`No folder for vault ${name}`);
	const items: Item[] = [];
	const files = [...readVault(folder)].sort(([a], [b]) => compareCodeUnits(a, b));
	// The index follows `Vault.markdownPaths()`: hidden folders are left out.
	const indexed = (path: string): boolean => !path.split("/").some((part) => part.startsWith("."));
	for (const [path, text] of files.filter(([path]) => indexed(path))) {
		const item = parseItem(text, path);
		if (item) items.push(item);
	}
	const trashed = trashedItems(files.filter(([path]) => path.startsWith(".trash/")).map(([path, text]) => ({ path, text })));
	return { items, index: new VaultIndex(items), trashed: trashed.sort((a, b) => compareCodeUnits(a.item.path, b.item.path)) };
}

describe.each(readExport.vaults)("read: $name", ({ name, files }) => {
	const folder = vaultFolders[name] as string;
	const texts = readVault(folder);

	it("has the same files", () => {
		expect([...texts.keys()].sort(compareCodeUnits)).toEqual(files.map((file) => file.path).sort(compareCodeUnits));
	});

	it.each(files.map((file) => [file.path, file.item] as const))("%s", (path, expected) => {
		const item = parseItem(texts.get(path) as string, path);
		const actual = item === null ? null : (itemJson(item) as { warnings: Warning[] });
		const want = expected === null ? null : (expected as { warnings: Warning[] });
		expect(actual && { ...actual, warnings: maskYaml(actual.warnings) }).toEqual(want && { ...want, warnings: maskYaml(want.warnings) });
	});
});

const maskedWarnings = (value: unknown): unknown =>
	Object.fromEntries(Object.entries(value as Record<string, Warning[]>).map(([path, warnings]) => [path, maskYaml(warnings)]));

describe.each(queriesExport.vaults)("queries: $name", (vault) => {
	const today = LocalDate.parse(queriesExport.today) as LocalDate;
	const { items, index, trashed } = parseVault(vault.name);
	const sections: Record<string, () => unknown> = {
		liveTasks: () => sortedPaths(index.tasks),
		projects: () => sortedPaths(index.projects),
		areas: () => sortedPaths(index.areas),
		notes: () => sortedPaths(index.notes),
		logged: () => sortedPaths(index.logged),
		today: () => inOrder(queries.todayTasks(index, today)),
		overdue: () => sortedPaths(items.filter((item) => queries.isOverdue(item, today))),
		upcoming: () => entries(queries.upcoming(index, today)),
		agendaWeek: () => entries(queries.agendaWeek(index, today.isoWeek)),
		dayMarks: () => {
			const from = LocalDate.parse("2026-10-01") as LocalDate;
			const through = LocalDate.parse("2026-10-31") as LocalDate;
			const marks = queries.dayMarks(index, from, through);
			return [...marks.keys()].sort(compareCodeUnits).map((key) => ({ date: key, ...marks.get(key) }));
		},
		loose: () => inOrder(queries.looseTasks(index)),
		activeProjects: () => progress(queries.activeProjects(index)),
		looseProjects: () => progress(queries.looseProjects(index)),
		areaProjects: () => queries.areaProjects(index).map((entry) => ({ area: entry.area.path, projects: progress(entry.projects) })),
		parents: () => Object.fromEntries(items.map((item) => [item.path, index.parentOf(item)?.path ?? null])),
		warnings: () => {
			const result: Record<string, unknown[]> = {};
			for (const item of items) {
				const warnings = index.warnings(item);
				if (warnings.length > 0) result[item.path] = maskYaml(warnings);
			}
			return result;
		},
		tagTree: () => tagTree(index).map(tagNodeJson),
		tagged: () => fromPaths(allTagNodes(tagTree(index)).map((node) => [node.tag.path, inOrder(itemsTagged(index, node.tag))])),
		untagged: () => inOrder(untagged(index)),
		tagBrowsers: () => {
			const browser = (tag: Parameters<typeof tagBrowser>[1]): unknown => {
				const page = tagBrowser(index, tag);
				return {
					areasAndProjects: inOrder(page.areasAndProjects),
					groups: page.groups.map((group) => ({ parent: group.parent?.path ?? null, tasks: inOrder(group.tasks) })),
					completed: inOrder(page.completed),
					notes: inOrder(page.notes),
					children: page.children.map(tagNodeJson),
				};
			};
			return fromPaths([["", browser(null)], ...allTagNodes(tagTree(index)).map((node): [string, unknown] => [node.tag.path, browser(node.tag)])]);
		},
		tagSuggestions: () => fromPaths(["", "c", "ca", "work/"].map((query) => [query, tagSuggestions(index, query).map(tagNodeJson)])),
		folderTree: () => folderTree(index).map(folderJson),
		notesIn: () => fromPaths(["", ...allFolders(folderTree(index))].map((folder) => [folder, inOrder(notesIn(index, folder))])),
		sections: () => {
			const bySections = (tasks: Item[]): unknown =>
				fromPaths(groupings.map((grouping) => [grouping, listSections(tasks, grouping, today).map(sectionJson)]));
			return { today: bySections(queries.todayTasks(index, today)), loose: bySections(queries.looseTasks(index)) };
		},
		tagFilterTags: () => TagFilter.tags([...index.tasks].sort((a, b) => compareCodeUnits(a.path, b.path))).map((entry) => ({ tag: entry.tag.name, count: entry.count })),
		trash: () =>
			trashed.map((entry) => {
				const json = itemJson(entry.item) as { warnings: Warning[] };
				return { path: entry.item.path, item: { ...json, warnings: maskYaml(json.warnings) } };
			}),
		...trashRelations(),
	};

	/** Live projects and areas with trashed members under `trashTasksOf` and `trashContentsOf`, trashed ones under the `…Trashed` keys. */
	function trashRelations(): Record<string, () => unknown> {
		const isLive = (item: Item): boolean => !item.path.startsWith(".trash/");
		const owners = (kind: Item["properties"]["kind"]): Item[] => {
			const byPath = new Map(items.filter((item) => item.properties.kind === kind && !isLogged(item)).map((item) => [item.path, item]));
			for (const entry of trashed) if (entry.item.properties.kind === kind) byPath.set(entry.item.path, entry.item);
			return [...byPath.values()].sort((a, b) => compareCodeUnits(a.path, b.path));
		};
		const projectTasks = (live: boolean): unknown =>
			fromPaths(
				owners("project")
					.filter((project) => isLive(project) === live)
					.flatMap((project): [string, unknown][] => {
						const found = trashedPaths(tasksOf(project, trashed));
						return found.length > 0 ? [[project.path, found]] : [];
					}),
			);
		const areaContents = (live: boolean): unknown =>
			fromPaths(
				owners("area")
					.filter((area) => isLive(area) === live)
					.flatMap((area): [string, unknown][] => {
						const found = contentsOf(area, trashed);
						return found.projects.length > 0 || found.tasks.length > 0
							? [[area.path, { projects: trashedPaths(found.projects), tasks: trashedPaths(found.tasks) }]]
							: [];
					}),
			);
		return {
			trashTasksOf: () => projectTasks(true),
			trashContentsOf: () => areaContents(true),
			trashTasksOfTrashed: () => projectTasks(false),
			trashContentsOfTrashed: () => areaContents(false),
		};
	}

	it("covers every exported section", () => {
		expect(Object.keys(sections).sort()).toEqual(Object.keys(vault).filter((key) => key !== "name").sort());
	});

	it.each(Object.keys(sections))("%s", (section) => {
		expect(vault, `queries.json has no \`${section}\``).toHaveProperty(section);
		const expected = section === "warnings" ? maskedWarnings(vault[section]) : vault[section];
		expect(sections[section]?.()).toEqual(expected);
	});
});
