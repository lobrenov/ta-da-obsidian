import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { makeItem } from "./support";

vi.mock("../src/ui/convert/ConvertModal", () => ({ openConvertModal: vi.fn() }));
vi.mock("../src/ui/extractTask", () => ({ extractSubtask: vi.fn() }));
vi.mock("../src/ui/navigator/NavigatorView", () => ({ NavigatorView: class {} }));
vi.mock("../src/ui/navigator/views", () => ({ viewKinds: [], viewSpecs: {} }));
vi.mock("../src/ui/newTask/NewTaskModal", () => ({ NewTaskModal: class {} }));
vi.mock("../src/ui/fileEdits", () => ({ moveFiles: vi.fn(), dateFiles: vi.fn() }));
vi.mock("../src/ui/statusActions", () => ({ statusItem: () => null }));
vi.mock("obsidian", () => ({ MarkdownView: class {}, Notice: class {}, Plugin: class {}, TFile: class {} }));

const { TFile } = await import("obsidian");
const { registerCommands } = await import("../src/commands");
const { moveFiles, dateFiles } = await import("../src/ui/fileEdits");

interface Command {
	id: string;
	name: string;
	hotkeys?: unknown;
	checkCallback: (checking: boolean) => boolean;
}

const paths = ["Ta Da/tasks/Trip.md", "Ta Da/tasks/Water.md", "Ta Da/projects/Home.md", "Notes/Plain.md"];

/** `picks` are the active Ta Da view's (undefined: the active view isn't one), `active` the active file. */
function setup(active: string | null, picks?: string[]) {
	const index = new VaultIndex([
		makeItem("Ta Da/tasks/Trip.md", "type: task"),
		makeItem("Ta Da/tasks/Water.md", "type: task"),
		makeItem("Ta Da/projects/Home.md", "type: project"),
		makeItem("Notes/Plain.md", ""),
	]);
	const files = new Map(paths.map((path) => [path, Object.assign(new (TFile as unknown as new () => object)(), { path })]));
	const commands: Command[] = [];
	const plugin = {
		app: {
			workspace: {
				getActiveFile: () => (active === null ? null : (files.get(active) ?? null)),
				getActiveViewOfType: () => (picks ? { picks } : null),
				on: () => undefined,
			},
			vault: { getFileByPath: (path: string) => files.get(path) ?? null },
		},
		taDaIndex: { index },
		writer: {},
		addCommand: (command: Command) => void commands.push(command),
		registerEvent: () => undefined,
	};
	registerCommands(plugin as never);
	const command = (id: string) => commands.find((candidate) => candidate.id === id) as Command;
	const filesOf = (list: string[]) => list.map((path) => files.get(path));
	return { command, filesOf };
}

describe("Schedule, Set deadline and Move to project or area", () => {
	it("are sentence case with no default hotkey", () => {
		const { command } = setup(null);
		expect([command("schedule").name, command("set-deadline").name]).toEqual(["Schedule", "Set deadline"]);
		for (const id of ["schedule", "set-deadline", "move-to-project-or-area"]) expect(command(id).hotkeys).toBeUndefined();
	});

	it("act on the picks of the active Ta Da view", () => {
		vi.mocked(dateFiles).mockClear();
		const { command, filesOf } = setup("Ta Da/projects/Home.md", ["Ta Da/tasks/Trip.md", "Ta Da/tasks/Water.md"]);
		command("schedule").checkCallback(false);
		expect(dateFiles).toHaveBeenCalledWith(expect.anything(), expect.anything(), filesOf(["Ta Da/tasks/Trip.md", "Ta Da/tasks/Water.md"]), "dueDate");
		command("set-deadline").checkCallback(false);
		expect(vi.mocked(dateFiles).mock.calls[1]?.[3]).toBe("deadline");
	});

	it("act on the active file when the view has no picks or the active view isn't a Ta Da view", () => {
		vi.mocked(moveFiles).mockClear();
		for (const picks of [[], undefined]) {
			const { command, filesOf } = setup("Ta Da/tasks/Trip.md", picks);
			command("move-to-project-or-area").checkCallback(false);
			expect(moveFiles).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), filesOf(["Ta Da/tasks/Trip.md"]), "task");
		}
	});

	it("are unavailable for a non-Ta Da active file or no file", () => {
		for (const active of ["Notes/Plain.md", null]) {
			const { command } = setup(active);
			for (const id of ["schedule", "set-deadline", "move-to-project-or-area"]) expect(command(id).checkCallback(true)).toBe(false);
		}
	});

	it("are unavailable when a pick isn't a task or project", () => {
		const { command } = setup("Ta Da/tasks/Trip.md", ["Ta Da/tasks/Trip.md", "Notes/Plain.md"]);
		expect(command("schedule").checkCallback(true)).toBe(false);
	});

	it("leave Move out for mixed picks but keep the date commands", () => {
		const { command } = setup(null, ["Ta Da/tasks/Trip.md", "Ta Da/projects/Home.md"]);
		expect(command("move-to-project-or-area").checkCallback(true)).toBe(false);
		expect(command("schedule").checkCallback(true)).toBe(true);
		expect(command("set-deadline").checkCallback(true)).toBe(true);
	});

	it("only open their modals when run, not when checked", () => {
		vi.mocked(dateFiles).mockClear();
		setup("Ta Da/tasks/Trip.md").command("schedule").checkCallback(true);
		expect(dateFiles).not.toHaveBeenCalled();
	});
});
