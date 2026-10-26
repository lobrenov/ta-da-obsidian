import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { makeItem } from "./support";

const notices: { message: string; click: () => void }[] = [];
vi.mock("obsidian", () => ({
	Notice: class {
		messageEl = {
			addEventListener: (_type: string, listener: () => void) => {
				notices[notices.length - 1]!.click = listener;
			},
		};
		constructor(message: string) {
			notices.push({ message, click: () => undefined });
		}
	},
}));

const { extractSubtask } = await import("../src/ui/extractTask");

const today = LocalDate.parse("2026-10-26") as LocalDate;
const source = "---\ntype: task\n---\n- [ ] Book flights\n  - detail\n- [ ] Pack\n";
const location = source.indexOf("- [ ] Book");
const file = { path: "Ta Da/tasks/Trip.md", basename: "Trip" } as never;

/** The log of writes, in order, against a vault that holds `taken` filenames in Ta Da/tasks. */
function setup(options: { taken?: string[]; createFails?: boolean; current?: string; hostItem?: ReturnType<typeof makeItem> } = {}) {
	const log: string[] = [];
	const created: { path: string; text: string }[] = [];
	const opened: unknown[] = [];
	const folder = { children: (options.taken ?? []).map((name) => ({ name })) };
	const app = {
		vault: {
			getFolderByPath: () => folder,
			createFolder: vi.fn(),
			create: vi.fn(async (path: string, text: string) => {
				if (options.createFails) throw new Error("disk full");
				log.push("create");
				created.push({ path, text });
				return { path, basename: path.slice(path.lastIndexOf("/") + 1, -3) };
			}),
		},
		workspace: { getLeaf: () => ({ openFile: async (opened_: unknown) => void opened.push(opened_) }) },
	};
	const index = new VaultIndex([
		options.hostItem ?? makeItem("Ta Da/tasks/Trip.md", "type: task\nproject: \"[[Holiday]]\""),
		makeItem("Ta Da/projects/Holiday.md", "type: project"),
	]);
	let result: string | undefined;
	const writer = {
		apply: vi.fn(async (_file: unknown, edit: (text: string) => string | null) => {
			log.push("remove");
			const next = edit(options.current ?? source);
			result = next ?? undefined;
			return next !== null;
		}),
	};
	const host = { app, index, writer, today: () => today } as never;
	return { host, log, created, opened, writer, removed: () => result };
}

beforeEach(() => void (notices.length = 0));

describe("extractSubtask", () => {
	it("makes the task file first, filed under the file's project, then removes the lines", async () => {
		const run = setup();
		await extractSubtask(run.host, file, source, location);
		expect(run.log).toEqual(["create", "remove"]);
		expect(run.created[0]?.path).toBe("Ta Da/tasks/Book flights.md");
		expect(run.created[0]?.text).toContain('project: "[[Holiday]]"');
		expect(run.created[0]?.text.endsWith("detail\n")).toBe(true);
		expect(run.removed()).toBe("---\ntype: task\n---\n- [ ] Pack\n");
		expect(notices.map((notice) => notice.message)).toEqual(["Extracted to a task in Holiday"]);
	});

	it("numbers a name that's taken", async () => {
		const run = setup({ taken: ["Book flights.md"] });
		await extractSubtask(run.host, file, source, location);
		expect(run.created[0]?.path).toBe("Ta Da/tasks/Book flights 2.md");
	});

	it("files under the file itself when it's a project, and loose for a task without a parent", async () => {
		const project = setup({ hostItem: makeItem("Ta Da/tasks/Trip.md", "type: project") });
		await extractSubtask(project.host, file, source, location);
		expect(project.created[0]?.text).toContain('project: "[[Trip]]"');
		const loose = setup({ hostItem: makeItem("Ta Da/tasks/Trip.md", "type: task") });
		await extractSubtask(loose.host, file, source, location);
		expect(loose.created[0]?.text).not.toContain("project:");
		expect(notices[1]?.message).toBe("Extracted to a task in Loose");
	});

	it("leaves the file untouched and says so when the task can't be made", async () => {
		const run = setup({ createFails: true });
		await extractSubtask(run.host, file, source, location);
		expect(run.writer.apply).not.toHaveBeenCalled();
		expect(notices.map((notice) => notice.message)).toEqual(["Couldn't extract the subtask, so it's still in the file. disk full"]);
	});

	it("keeps the lines and says so when they changed after the task was made", async () => {
		const run = setup({ current: source.replace("Book flights", "Book trains") });
		await extractSubtask(run.host, file, source, location);
		expect(run.log).toEqual(["create", "remove"]);
		expect(run.removed()).toBeUndefined();
		expect(notices[0]?.message).toContain("its subtask changed meanwhile");
	});

	it("opens the new task when the notice is clicked", async () => {
		const run = setup();
		await extractSubtask(run.host, file, source, location);
		notices[0]?.click();
		expect(run.opened).toEqual([run.created[0] && expect.objectContaining({ path: "Ta Da/tasks/Book flights.md" })]);
	});

	it("does nothing on a line that isn't a subtask", async () => {
		const run = setup();
		await extractSubtask(run.host, file, source, 0);
		expect(run.log).toEqual([]);
	});
});
