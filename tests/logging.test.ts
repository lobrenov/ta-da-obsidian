import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { parseItem } from "../src/core/parsing/parseItem";

const notices: string[] = [];
const asked: { project: string; tasks: string[]; answer: (as: "Done" | "Cancelled") => void }[] = [];
vi.mock("obsidian", () => ({
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
	Modal: class {},
}));
vi.mock("../src/ui/CompletionModal", () => ({
	CompletionModal: class {
		constructor(_app: unknown, question: { project: { title: string }; tasks: { title: string }[] }, answer: (as: "Done" | "Cancelled") => void) {
			asked.push({ project: question.project.title, tasks: question.tasks.map((task) => task.title), answer });
		}
		open(): void {}
	},
}));

const { Logbook } = await import("../src/Logbook");
const { DailyLog } = await import("../src/DailyLog");
const { StatusActions } = await import("../src/ui/statusActions");

const today = LocalDate.parse("2026-10-28") as LocalDate;
const yesterday = LocalDate.parse("2026-10-27") as LocalDate;
const done = (extra = "") => `---\ntype: task\nstatus: Done\ncompletedDate: 2026-10-01\n${extra}---\n`;
const open = (extra = "") => `---\ntype: task\nstatus: Doing\n${extra}---\n`;
const project = (status: string) => `---\ntype: project\nstatus: ${status}\n${status === "Done" ? "completedDate: 2026-10-01\n" : ""}---\n`;
const waitFor = (check: () => void) => vi.waitFor(check, { timeout: 500 });

/** An in-memory vault with the index the plugin keeps: `renameFile` throws when the destination exists, as Obsidian's does. */
function setup(initial: Record<string, string>) {
	const files = new Map(Object.entries(initial));
	const folders = new Set<string>();
	const index = new VaultIndex();
	const reindex = (path: string) => {
		const item = files.has(path) ? parseItem(files.get(path) as string, path) : null;
		if (item) index.update(item);
		else index.remove(path);
	};
	for (const path of files.keys()) reindex(path);
	const hooks = { beforeRename: (_from: string, _to: string): void => undefined, beforeFolder: (): void => undefined };
	const app = {
		vault: {
			getFileByPath: (path: string) => (files.has(path) ? { path, name: path.split("/").pop() } : null),
			getFolderByPath: (folder: string) => {
				const names = new Set<string>();
				for (const path of files.keys()) if (path.startsWith(`${folder}/`)) names.add(path.slice(folder.length + 1).split("/")[0] as string);
				return names.size > 0 || folders.has(folder) ? { children: [...names].map((name) => ({ name })) } : null;
			},
			createFolder: async (folder: string) => {
				hooks.beforeFolder();
				folders.add(folder);
			},
		},
		fileManager: {
			renameFile: async (file: { path: string }, to: string) => {
				hooks.beforeRename(file.path, to);
				if (files.has(to)) throw new Error("Destination file already exists!");
				files.set(to, files.get(file.path) as string);
				files.delete(file.path);
				reindex(file.path);
				reindex(to);
			},
		},
	};
	const writer = {
		apply: async (file: { path: string }, edit: (text: string) => string | null) => {
			const text = files.get(file.path) as string;
			const next = edit(text);
			if (next === null || next === text) return false;
			files.set(file.path, next);
			reindex(file.path);
			return true;
		},
		read: async (file: { path: string }) => files.get(file.path) as string,
	};
	const logbook = new Logbook(app as never, index, writer as never, () => today);
	const status = new StatusActions(app as never, index, writer as never, () => today, logbook);
	const settings = { lastLogged: null as LocalDate | null, setLastLogged: vi.fn(async (day: LocalDate) => void (settings.lastLogged = day)) };
	const daily = new DailyLog(app as never, index, logbook, status, settings, () => today);
	return { files, index, hooks, app, logbook, status, settings, daily };
}

beforeEach(() => {
	notices.length = 0;
	asked.length = 0;
});

describe("logIfDue", () => {
	it.each([
		["no day kept", null, true],
		["yesterday", yesterday, true],
		["today", today, false],
	])("with %s, runs: %s", async (_, last, runs) => {
		const { files, settings, daily } = setup({ "Ta Da/tasks/A.md": done() });
		settings.lastLogged = last;
		settings.setLastLogged.mockClear();
		await daily.logIfDue();
		expect(files.has("Ta Da/logbook/2026-10/A.md")).toBe(runs);
		expect(settings.setLastLogged).toHaveBeenCalledTimes(runs ? 1 : 0);
	});

	it("keeps the day it logged, and does nothing the second time", async () => {
		const { settings, daily, files } = setup({ "Ta Da/tasks/A.md": done() });
		await daily.logIfDue();
		expect(settings.lastLogged?.toString()).toBe("2026-10-28");
		files.set("Ta Da/tasks/B.md", done());
		await daily.logIfDue();
		expect(files.has("Ta Da/tasks/B.md")).toBe(true);
	});

	it("doesn't start while it's running", async () => {
		const { daily, hooks, files } = setup({ "Ta Da/tasks/A.md": done() });
		let second: Promise<void> | undefined;
		hooks.beforeRename = () => void (second ??= daily.logIfDue());
		await daily.logIfDue();
		await second;
		expect(files.has("Ta Da/logbook/2026-10/A.md")).toBe(true);
		expect(notices).toEqual([]);
	});

	it("keeps the old day after a failed step, and still runs the other steps", async () => {
		const { files, settings, hooks, daily } = setup({
			"Ta Da/tasks/A.md": done(),
			"Ta Da/logbook/2026-09/Back.md": open(),
		});
		settings.lastLogged = yesterday;
		hooks.beforeRename = (from) => {
			if (from === "Ta Da/tasks/A.md") throw new Error("disk full");
		};
		await daily.logIfDue();
		expect(notices).toEqual(["Couldn't log the files: disk full"]);
		expect(files.has("Ta Da/tasks/Back.md")).toBe(true);
		expect(settings.setLastLogged).not.toHaveBeenCalled();
		expect(settings.lastLogged).toBe(yesterday);
	});

	it("puts back a logged project with open tasks as Doing", async () => {
		const { files, daily } = setup({
			"Ta Da/logbook/2026-09/P.md": project("Done"),
			"Ta Da/tasks/T.md": open('project: "[[P]]"\n'),
		});
		await daily.logIfDue();
		expect(files.get("Ta Da/projects/P.md")).toContain("status: Doing");
		expect(files.has("Ta Da/logbook/2026-09/P.md")).toBe(false);
	});
});

describe("Logbook.log", () => {
	const repeating = (extra = "") => done(`dueDate: 2026-10-01\nrepeat: every week\n${extra}`);

	it("moves a repeating task forward in place", async () => {
		const { files, logbook } = setup({ "Ta Da/tasks/R.md": repeating() });
		expect(await logbook.log(["Ta Da/tasks/R.md"], today)).toEqual({});
		expect(files.get("Ta Da/tasks/R.md")).toContain("status: Not Started");
	});

	it("logs a repeating task whose forward edit leaves it closed, planning it again", async () => {
		const { files, index, logbook } = setup({ "Ta Da/tasks/R.md": repeating() });
		files.set("Ta Da/tasks/R.md", done()); // the file lost its rule after the index read it
		expect(index.get("Ta Da/tasks/R.md")?.properties.repeatRule).toBeTruthy();
		expect(await logbook.log(["Ta Da/tasks/R.md"], today)).toEqual({ "Ta Da/tasks/R.md": "Ta Da/logbook/2026-10/R.md" });
		expect(files.has("Ta Da/tasks/R.md")).toBe(false);
	});

	it("numbers a move whose planned name was taken by the time it ran", async () => {
		const { files, hooks, logbook } = setup({ "Ta Da/tasks/A.md": done() });
		hooks.beforeFolder = () => void files.set("Ta Da/logbook/2026-10/A.md", done()); // another device logs a file of that name
		expect(await logbook.log(["Ta Da/tasks/A.md"], today)).toEqual({ "Ta Da/tasks/A.md": "Ta Da/logbook/2026-10/A 2.md" });
	});

	it("skips a file that's gone and throws only when nothing moved", async () => {
		const { files, logbook } = setup({ "Ta Da/tasks/A.md": done(), "Ta Da/tasks/B.md": done() });
		files.delete("Ta Da/tasks/A.md");
		expect(await logbook.log(["Ta Da/tasks/A.md", "Ta Da/tasks/B.md"], today)).toEqual({ "Ta Da/tasks/B.md": "Ta Da/logbook/2026-10/B.md" });
		const { logbook: other, hooks: otherHooks } = setup({ "Ta Da/tasks/C.md": done() });
		otherHooks.beforeRename = () => {
			throw new Error("locked");
		};
		await expect(other.log(["Ta Da/tasks/C.md"], today)).rejects.toThrow("locked");
	});

	it("points a renamed project's tasks at its new title", async () => {
		const { files, logbook } = setup({
			"Ta Da/projects/Kombi.md": project("Done"),
			"Ta Da/logbook/2026-10/Kombi.md": project("Done"),
			"Ta Da/tasks/T.md": done('project: "[[Kombi]]"\n'),
		});
		const moved = await logbook.log(["Ta Da/projects/Kombi.md", "Ta Da/tasks/T.md"], today);
		expect(moved["Ta Da/projects/Kombi.md"]).toBe("Ta Da/logbook/2026-10/Kombi 2.md");
		expect(files.get(moved["Ta Da/tasks/T.md"] as string)).toContain("[[Kombi 2]]");
	});
});

describe("Log now", () => {
	it("logs at once when no completed project has open tasks", async () => {
		const { files, daily } = setup({ "Ta Da/tasks/A.md": done() });
		await daily.logNow();
		expect(asked).toEqual([]);
		expect(files.has("Ta Da/logbook/2026-10/A.md")).toBe(true);
	});

	it("asks first about a completed project with open tasks, then logs everything", async () => {
		const { files, daily } = setup({
			"Ta Da/projects/P.md": project("Done"),
			"Ta Da/tasks/T.md": open('project: "[[P]]"\n'),
			"Ta Da/tasks/D.md": done(),
		});
		await daily.logNow();
		expect(asked.map((question) => [question.project, question.tasks])).toEqual([["P", ["T"]]]);
		expect(files.has("Ta Da/tasks/D.md")).toBe(true);
		asked[0]?.answer("Done");
		await waitFor(() => expect(files.has("Ta Da/logbook/2026-10/D.md")).toBe(true));
		expect([...files.keys()].filter((path) => path.startsWith("Ta Da/logbook/2026-10/")).sort()).toEqual([
			"Ta Da/logbook/2026-10/D.md",
			"Ta Da/logbook/2026-10/P.md",
			"Ta Da/logbook/2026-10/T.md",
		]);
	});
});

describe("StatusActions unlog", () => {
	it("puts a reopened task and its logged project back through the shared apply", async () => {
		const { files, status, app } = setup({
			"Ta Da/logbook/2026-09/P.md": project("Done"),
			"Ta Da/logbook/2026-09/T.md": done('project: "[[P]]"\n'),
		});
		status.set(app.vault.getFileByPath("Ta Da/logbook/2026-09/T.md") as never, "Doing");
		await waitFor(() => expect(files.has("Ta Da/projects/P.md")).toBe(true));
		await waitFor(() => expect(files.get("Ta Da/tasks/T.md")).toContain("status: Doing"));
		expect(files.get("Ta Da/projects/P.md")).toContain("status: Doing");
	});
});

describe("Logbook header", () => {
	it("enables Log now when a file waits to be logged", async () => {
		const { context, list } = await import("./navigatorSupport");
		const waiting = setup({ "Ta Da/tasks/A.md": done() });
		const none = setup({ "Ta Da/logbook/2026-09/A.md": done() });
		expect(list({ kind: "logbook" }, context(waiting.index, today)).header.logNow).toEqual({ enabled: true });
		expect(list({ kind: "logbook" }, context(none.index, today)).header.logNow).toEqual({ enabled: false });
	});
});
