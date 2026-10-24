import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import * as queries from "../src/core/index/queries";
import type { Item, Warning } from "../src/core/model/item";
import { LocalDate } from "../src/core/model/localDate";
import { parseItem } from "../src/core/parsing/parseItem";
import { compareCodeUnits } from "../src/core/text";
import { itemJson } from "./itemJson";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
/** Swift's exports and the fixture vault: the Ta Da repo's `Conformance` folder, beside this repo. */
const conformanceFolder = resolve(repoRoot, "../Ta Da/Packages/TaDaCore/Tests/TaDaCoreTests/Fixtures/Conformance");

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

const readExport = loadJson<ReadExport>("read.json");
const queriesExport = loadJson<QueriesExport>("queries.json");

function parseVault(name: string): { items: Item[]; index: VaultIndex } {
	const folder = vaultFolders[name];
	if (!folder) throw new Error(`No folder for vault ${name}`);
	const items: Item[] = [];
	for (const [path, text] of [...readVault(folder)].sort(([a], [b]) => compareCodeUnits(a, b))) {
		const item = parseItem(text, path);
		if (item) items.push(item);
	}
	return { items, index: new VaultIndex(items) };
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
	const { items, index } = parseVault(vault.name);
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
	};

	it("covers every exported section", () => {
		expect(Object.keys(sections).sort()).toEqual(Object.keys(vault).filter((key) => key !== "name").sort());
	});

	it.each(Object.keys(sections))("%s", (section) => {
		const expected = section === "warnings" ? maskedWarnings(vault[section]) : vault[section];
		expect(sections[section]?.()).toEqual(expected);
	});
});
