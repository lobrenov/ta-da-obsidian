import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { makeItem } from "./support";

const notices: string[] = [];
vi.mock("obsidian", () => ({
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
}));

const { convertDefaults, convertToProject, projectPath } = await import("../src/ui/convertTask");

const today = LocalDate.parse("2026-10-26") as LocalDate;
const task = '---\ntype: task\nstatus: Doing\nproject: "[[Holiday]]"\n---\nIntro\n- [ ] Book flights\n  - detail\n- [x] Pack\n';
const choice = { status: "Doing" as const, area: { kind: "area" as const, title: "Home" }, extractSubtasks: true };

interface Options {
	text?: string;
	renameFails?: boolean;
	createFailsAt?: number;
	rewriteFails?: boolean;
	removeFails?: boolean;
	projects?: string[];
	tasks?: string[];
}

/** A vault holding one task file, with every write logged in order. */
function setup(options: Options = {}) {
	const log: string[] = [];
	const created: { path: string; text: string }[] = [];
	const state = { text: options.text ?? task };
	const file = { path: "Ta Da/tasks/Trip.md", basename: "Trip" };
	const projectFolder = { children: (options.projects ?? []).map((name) => ({ name })) };
	const taskFolder = { children: (options.tasks ?? []).map((name) => ({ name })) };
	let applies = 0;
	const writer = {
		apply: vi.fn(async (_file: unknown, edit: (text: string) => string | null) => {
			applies++;
			const step = log.includes("rename") ? "remove" : applies === 1 ? "rewrite" : "restore";
			log.push(step);
			if (step === "rewrite" && options.rewriteFails) throw new Error("locked");
			if (step === "remove" && options.removeFails) throw new Error("locked");
			const next = edit(state.text);
			if (next === null || next === state.text) return false;
			state.text = next;
			return true;
		}),
	};
	const app = {
		vault: {
			getFolderByPath: (path: string) => (path === "Ta Da/projects" ? projectFolder : path === "Ta Da/tasks" ? taskFolder : { children: [] }),
			createFolder: vi.fn(async () => undefined),
			read: vi.fn(async () => state.text),
			create: vi.fn(async (path: string, text: string) => {
				if (created.length === options.createFailsAt) throw new Error("disk full");
				log.push("create");
				created.push({ path, text });
				taskFolder.children.push({ name: path.slice(path.lastIndexOf("/") + 1) });
				return { path };
			}),
		},
		fileManager: {
			renameFile: vi.fn(async (target: typeof file, path: string) => {
				if (options.renameFails) throw new Error("exists");
				log.push("rename");
				target.path = path;
				target.basename = path.slice(path.lastIndexOf("/") + 1, -3);
			}),
		},
	};
	const index = new VaultIndex([
		makeItem("Ta Da/tasks/Trip.md", 'type: task\nproject: "[[Holiday]]"'),
		makeItem("Ta Da/projects/Holiday.md", 'type: project\narea: "[[Home]]"'),
		makeItem("Ta Da/areas/Home.md", "type: area"),
		...(options.projects ?? []).map((name) => makeItem(`Ta Da/projects/${name}`, "type: project")),
		makeItem("Ta Da/logbook/Old.md", "type: project\nstatus: Done\ncompletedDate: 2026-01-01"),
	]);
	const host = { app, index, writer, today: () => today } as never;
	return { host, file: file as never, log, created, state, writer, app };
}

beforeEach(() => void (notices.length = 0));

describe("convertToProject", () => {
	it("rewrites the frontmatter, moves the file, makes the tasks, then removes their lines", async () => {
		const run = setup();
		expect(await convertToProject(run.host, run.file, choice)).toBe(true);
		expect(run.log).toEqual(["rewrite", "rename", "create", "create", "remove"]);
		expect(run.app.fileManager.renameFile).toHaveBeenCalledWith(run.file, "Ta Da/projects/Trip.md");
		expect(run.created.map((made) => made.path)).toEqual(["Ta Da/tasks/Book flights.md", "Ta Da/tasks/Pack.md"]);
		expect(run.created[0]?.text).toContain('project: "[[Trip]]"');
		expect(run.created[0]?.text.endsWith("detail\n")).toBe(true);
		expect(run.state.text).toContain("type: project");
		expect(run.state.text).toContain('area: "[[Home]]"');
		expect(run.state.text.endsWith("---\nIntro\n")).toBe(true);
		expect(notices).toEqual([]);
	});

	it("leaves the subtasks where they are without the toggle", async () => {
		const run = setup();
		await convertToProject(run.host, run.file, { ...choice, extractSubtasks: false });
		expect(run.log).toEqual(["rewrite", "rename"]);
		expect(run.state.text).toContain("- [ ] Book flights");
	});

	it("does nothing more for a task without subtasks", async () => {
		const run = setup({ text: "---\ntype: task\n---\nJust text\n" });
		await convertToProject(run.host, run.file, choice);
		expect(run.log).toEqual(["rewrite", "rename"]);
	});

	it("numbers the name against every project's title, logged ones too", async () => {
		const run = setup({ projects: ["Trip.md"] });
		await convertToProject(run.host, run.file, choice);
		expect(run.app.fileManager.renameFile).toHaveBeenCalledWith(run.file, "Ta Da/projects/Trip 2.md");
		expect(run.created[0]?.text).toContain('project: "[[Trip 2]]"');
		const logged = setup();
		expect(projectPath({ app: logged.app as never, index: new VaultIndex([makeItem("Ta Da/logbook/Trip.md", "type: project\nstatus: Done")]) }, logged.file)).toBe(
			"Ta Da/projects/Trip 2.md",
		);
	});

	it("puts the task's text back when the move fails, and makes no tasks", async () => {
		const run = setup({ renameFails: true });
		expect(await convertToProject(run.host, run.file, choice)).toBe(false);
		expect(run.log).toEqual(["rewrite", "restore"]);
		expect(run.state.text).toBe(task);
		expect(run.created).toEqual([]);
		expect(notices).toEqual(["Couldn't convert “Trip” to a project: exists It's still a task."]);
	});

	it("stops without moving when the frontmatter can't be written", async () => {
		const run = setup({ rewriteFails: true });
		expect(await convertToProject(run.host, run.file, choice)).toBe(false);
		expect(run.app.fileManager.renameFile).not.toHaveBeenCalled();
		expect(notices).toEqual(["Couldn't convert “Trip” to a project: locked"]);
	});

	it("removes no lines when a task can't be made, and says so", async () => {
		const run = setup({ createFailsAt: 1 });
		expect(await convertToProject(run.host, run.file, choice)).toBe(true);
		expect(run.log).toEqual(["rewrite", "rename", "create"]);
		expect(run.state.text).toContain("- [ ] Book flights");
		expect(run.state.text).toContain("- [x] Pack");
		expect(notices).toEqual(["Couldn't make the subtasks of “Trip” its tasks: disk full They stay in its file."]);
	});

	it("says so when the lines can't be removed", async () => {
		const run = setup({ removeFails: true });
		await convertToProject(run.host, run.file, choice);
		expect(notices).toEqual(["The subtasks of “Trip” were made tasks, but their lines couldn't be removed: locked"]);
	});

	it("keeps the lines when the subtasks changed after the tasks were made", async () => {
		const run = setup();
		run.app.vault.create.mockImplementationOnce(async (path: string) => {
			run.state.text = run.state.text.replace("Pack", "Unpack");
			return { path };
		});
		await convertToProject(run.host, run.file, choice);
		expect(run.state.text).toContain("Unpack");
		expect(notices).toEqual(["The subtasks of “Trip” were made tasks, but its file changed meanwhile, so they're still in it."]);
	});
});

describe("convertDefaults", () => {
	const index = new VaultIndex([
		makeItem("Ta Da/tasks/InProject.md", 'type: task\nstatus: Blocked\nproject: "[[Holiday]]"'),
		makeItem("Ta Da/tasks/InArea.md", 'type: task\narea: "[[Home]]"'),
		makeItem("Ta Da/tasks/Loose.md", "type: task\nstatus: Doing"),
		makeItem("Ta Da/projects/Holiday.md", 'type: project\narea: "[[Home]]"'),
		makeItem("Ta Da/projects/NoArea.md", "type: project"),
		makeItem("Ta Da/tasks/InBare.md", 'type: task\nproject: "[[NoArea]]"'),
		makeItem("Ta Da/areas/Home.md", "type: area"),
	]);

	it("takes the task's status and its project's area", () => {
		expect(convertDefaults(index, "Ta Da/tasks/InProject.md")).toEqual({ status: "Blocked", area: { kind: "area", title: "Home" } });
	});

	it("takes the task's own area", () => {
		expect(convertDefaults(index, "Ta Da/tasks/InArea.md")).toEqual({ status: "Not Started", area: { kind: "area", title: "Home" } });
	});

	it("has no area for a loose task or one in a project without one", () => {
		expect(convertDefaults(index, "Ta Da/tasks/Loose.md")).toEqual({ status: "Doing", area: null });
		expect(convertDefaults(index, "Ta Da/tasks/InBare.md")?.area).toBeNull();
	});

	it("is null for anything but a task", () => {
		expect(convertDefaults(index, "Ta Da/projects/Holiday.md")).toBeNull();
		expect(convertDefaults(index, "gone.md")).toBeNull();
	});
});
