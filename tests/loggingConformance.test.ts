import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { filesToLog, loggedProjectsWithOpenTasks, reopenedLogged } from "../src/core/index/logQueries";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import type { Item } from "../src/core/model/item";
import { isClosed } from "../src/core/model/status";
import { parseItem } from "../src/core/parsing/parseItem";
import { setStatus } from "../src/core/writing/completion";
import { planLog, type LogPlan } from "../src/core/writing/log";
import { moveName, planUnlog, relinkEdit, resolveRelinks, type FileMove, type UnlogPlan } from "../src/core/writing/unlog";
import { taDaRepo } from "./taDaRepo";

interface Step {
	step: "log" | "unlogReopened" | "unlogWaiting";
	paths: string[];
	moved: Record<string, string>;
	threw: boolean;
}
interface LoggingExport {
	vault: string;
	today: string;
	filesToLog: { completedBefore: string | null; paths: string[] }[];
	reopenedLogged: string[];
	loggedProjectsWithOpenTasks: string[];
	log: { name: string; paths: string[]; moved: Record<string, string>; written: Record<string, string> }[];
	dailyRun: { steps: Step[]; written: Record<string, string>; again: { name: string; steps: Step[]; written: Record<string, string> }[] };
}

const conformance = resolve(taDaRepo, "Packages/TaDaCore/Tests/TaDaCoreTests/Fixtures/Conformance");
const fixture = JSON.parse(readFileSync(resolve(conformance, "logging.json"), "utf8")) as LoggingExport;
const today = LocalDate.parse(fixture.today) as LocalDate;

type Files = Map<string, string>;

/** Every `.md` file under the fixture vault, with its text. */
function loadFiles(): Files {
	const files: Files = new Map();
	const walk = (directory: string, prefix: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.name.startsWith(".")) continue;
			if (entry.isDirectory()) walk(join(directory, entry.name), `${prefix}${entry.name}/`);
			else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.set(`${prefix}${entry.name}`, readFileSync(join(directory, entry.name), "utf8"));
		}
	};
	walk(resolve(conformance, fixture.vault), "");
	return files;
}

const indexOf = (files: Files): VaultIndex =>
	new VaultIndex([...files].flatMap(([path, text]) => parseItem(text, path) ?? []));

const filenamesIn = (files: Files) => (folder: string) =>
	[...files.keys()].filter((path) => path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes("/")).map((path) => path.slice(folder.length + 1));

/** Files that are new or changed since `before`, with their text. */
function changed(before: Files, after: Files): Record<string, string> {
	return Object.fromEntries([...after].filter(([path, text]) => before.get(path) !== text));
}

/** `renameFile`: throws when there's no file at `from` or one at `to`. */
function rename(files: Files, from: string, to: string): void {
	const text = files.get(from);
	if (text === undefined) throw new Error(`No file at ${from}`);
	if (files.has(to)) throw new Error(`${to} exists`);
	files.delete(from);
	files.set(to, text);
}

function splice(files: Files, path: string, edit: (text: string) => string | null): void {
	const text = files.get(path);
	const result = text === undefined ? null : edit(text);
	if (result !== null) files.set(path, result);
}

/** Moves a file as step 4 does: the name is picked now, from the folder's names now. Returns the new path. */
function moveNow(files: Files, index: VaultIndex, planned: FileMove, named: Set<string>): string {
	const item = index.get(planned.from) as Item;
	const folder = planned.to.slice(0, planned.to.lastIndexOf("/"));
	const name = moveName(item, filenamesIn(files)(folder), named, index.projectFilenames(item.path));
	const to = `${folder}/${name}`;
	rename(files, planned.from, to);
	if (item.properties.kind === "project") named.add(name);
	return to;
}

/**
 * Applies a plan as step 4 will: a file no longer at its path is skipped, a forward edit that leaves it closed is
 * skipped, any other failure is recorded and the rest go on. Fails only when nothing moved and nothing rolled forward.
 */
function applyLog(files: Files, index: VaultIndex, plan: LogPlan): Record<string, string> {
	const moved: Record<string, string> = {};
	const named = new Set<string>();
	let rolled = false;
	let firstError: unknown;
	for (const { path, edit } of plan.forward) {
		const text = files.get(path);
		if (text === undefined) continue;
		const result = edit(text);
		const item = parseItem(result, path);
		if (item && !isClosed(item.properties.status)) {
			files.set(path, result);
			rolled = true;
		}
	}
	for (const move of plan.moves) {
		if (!files.has(move.from)) continue;
		try {
			moved[move.from] = moveNow(files, index, move, named);
		} catch (error) {
			firstError ??= error;
		}
	}
	if (firstError !== undefined && Object.keys(moved).length === 0 && !rolled) throw firstError;
	for (const { path, from, to } of resolveRelinks(plan.relinks, moved)) splice(files, path, relinkEdit(path, from, to));
	return moved;
}

/** Applies a plan as step 4 will: names are picked at each move, and the first failure ends the step. Returns the moved paths. */
function applyUnlog(files: Files, index: VaultIndex, plan: UnlogPlan): Record<string, string> {
	const moved: Record<string, string> = {};
	const named = new Set<string>();
	for (const move of plan.moves) moved[move.from] = moveNow(files, index, move, named);
	for (const path of plan.doing) splice(files, moved[plan.moves.find((move) => move.to === path)?.from ?? ""] ?? path, (text) => setStatus("Doing", text, today));
	for (const { path, from, to } of resolveRelinks(plan.relinks, moved)) splice(files, path, relinkEdit(path, from, to));
	return moved;
}

const pathsOf = (items: { path: string }[]): string[] => items.map((item) => item.path);

/** One step of the daily run on `files`. A stale step uses the index and paths from an earlier read. */
function runStep(files: Files, name: Step["step"], stale?: { index: VaultIndex; paths: string[] }): Step & { index: VaultIndex } {
	const index = stale?.index ?? indexOf(files);
	const paths =
		stale?.paths ??
		(name === "log"
			? pathsOf(filesToLog(index, today))
			: pathsOf(name === "unlogReopened" ? reopenedLogged(index) : loggedProjectsWithOpenTasks(index)));
	const step = { step: name, paths, moved: {}, threw: false, index };
	if (paths.length === 0) return step;
	try {
		if (name === "log") step.moved = applyLog(files, index, planLog(index, paths, today, filenamesIn(files)));
		else step.moved = applyUnlog(files, index, planUnlog(index, paths, filenamesIn(files), name === "unlogWaiting" ? paths : []));
	} catch {
		step.threw = true;
	}
	return step;
}

const stepNames: Step["step"][] = ["log", "unlogReopened", "unlogWaiting"];
const stepJson = ({ step, paths, moved, threw }: Step): Step => ({ step, paths, moved, threw });

describe("logging: queries", () => {
	const index = indexOf(loadFiles());
	it.each(fixture.filesToLog.map((entry) => [entry.completedBefore ?? "any day", entry] as const))("filesToLog before %s", (_, entry) => {
		const before = entry.completedBefore === null ? null : (LocalDate.parse(entry.completedBefore) as LocalDate);
		expect(pathsOf(filesToLog(index, before))).toEqual(entry.paths);
	});
	it("reopenedLogged", () => expect(pathsOf(reopenedLogged(index))).toEqual(fixture.reopenedLogged));
	it("loggedProjectsWithOpenTasks", () => expect(pathsOf(loggedProjectsWithOpenTasks(index))).toEqual(fixture.loggedProjectsWithOpenTasks));
});

describe("logging: log", () => {
	it.each(fixture.log.map((entry) => [entry.name, entry] as const))("%s", (_, entry) => {
		const files = loadFiles();
		const before = new Map(files);
		const index = indexOf(files);
		const plan = planLog(index, entry.paths, today, filenamesIn(files));
		expect(applyLog(files, index, plan)).toEqual(entry.moved);
		expect(changed(before, files)).toEqual(entry.written);
		expect(plan.folders).toEqual([...new Set(plan.moves.map((move) => move.to.slice(0, move.to.lastIndexOf("/"))))]);
	});

	it("keeps a forward-moved file out of the moves, and ends a series at its project", () => {
		const plan = planLog(indexOf(loadFiles()), fixture.log[0]!.paths, today, () => []);
		expect(plan.forward.map((move) => move.path)).toEqual(["Ta Da/tasks/Fortnightly.md", "Ta Da/tasks/Skip bins.md", "Ta Da/tasks/Water plants.md"]);
		expect(plan.moves.map((move) => move.from)).not.toContain("Ta Da/tasks/Water plants.md");
	});
});

describe("logging: daily run", () => {
	const run = fixture.dailyRun;
	it("runs the three steps with re-indexing between them, then stale and fresh again", () => {
		const files = loadFiles();
		const start = new Map(files);
		const first = stepNames.map((name) => runStep(files, name));
		expect(first.map(stepJson)).toEqual(run.steps);
		expect(changed(start, files)).toEqual(run.written);

		const afterFirst = new Map(files);
		const stale = first.map((step) => runStep(files, step.step, { index: step.index, paths: step.paths }));
		expect(stale.map(stepJson)).toEqual(run.again[0]!.steps);
		expect(changed(afterFirst, files)).toEqual(run.again[0]!.written);

		const afterStale = new Map(files);
		const fresh = stepNames.map((name) => runStep(files, name));
		expect(fresh.map(stepJson)).toEqual(run.again[1]!.steps);
		expect(changed(afterStale, files)).toEqual(run.again[1]!.written);
	});
});
