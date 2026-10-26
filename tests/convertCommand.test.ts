import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { makeItem } from "./support";

vi.mock("../src/ui/convert/ConvertModal", () => ({ openConvertModal: vi.fn() }));
vi.mock("../src/ui/extractTask", () => ({ extractSubtask: vi.fn() }));
vi.mock("../src/ui/navigator/NavigatorView", () => ({ NavigatorView: class {} }));
vi.mock("../src/ui/navigator/views", () => ({ viewKinds: [], viewSpecs: {} }));
vi.mock("../src/ui/newTask/NewTaskModal", () => ({ NewTaskModal: class {} }));
vi.mock("../src/ui/header/pickers", () => ({ openParentPicker: vi.fn() }));
vi.mock("../src/ui/statusActions", () => ({
	statusItem: (index: VaultIndex, file: { path: string }) => {
		const kind = index.get(file.path)?.properties.kind;
		return kind === "task" || kind === "project" ? index.get(file.path) : null;
	},
}));
vi.mock("obsidian", () => ({ MarkdownView: class {}, Notice: class {}, Plugin: class {}, TFile: class {} }));

const { TFile } = await import("obsidian");
const { registerCommands } = await import("../src/commands");
const { openConvertModal } = await import("../src/ui/convert/ConvertModal");

interface Command {
	id: string;
	name: string;
	hotkeys?: unknown;
	checkCallback: (checking: boolean) => boolean;
}

function setup(active: string | null) {
	const index = new VaultIndex([
		makeItem("Ta Da/tasks/Trip.md", "type: task"),
		makeItem("Ta Da/projects/Home.md", "type: project"),
		makeItem("Notes/Plain.md", ""),
	]);
	const commands: Command[] = [];
	const file = active === null ? null : Object.assign(new (TFile as unknown as new () => object)(), { path: active });
	const writer = {};
	const plugin = {
		app: { workspace: { getActiveFile: () => file, on: () => undefined } },
		taDaIndex: { index },
		writer,
		addCommand: (command: Command) => void commands.push(command),
		registerEvent: () => undefined,
	};
	registerCommands(plugin as never);
	return { command: commands.find((candidate) => candidate.id === "convert-task-to-project") as Command, file, writer };
}

describe("the Convert task to project command", () => {
	it("is named in sentence case with no default hotkey", () => {
		const { command } = setup(null);
		expect(command.name).toBe("Convert task to project");
		expect(command.hotkeys).toBeUndefined();
	});

	it("is available only when the active file is a task", () => {
		expect(setup("Ta Da/tasks/Trip.md").command.checkCallback(true)).toBe(true);
		expect(setup("Ta Da/projects/Home.md").command.checkCallback(true)).toBe(false);
		expect(setup("Notes/Plain.md").command.checkCallback(true)).toBe(false);
		expect(setup(null).command.checkCallback(true)).toBe(false);
	});

	it("opens the modal for the active file only when run, not when checked", () => {
		vi.mocked(openConvertModal).mockClear();
		const { command, file, writer } = setup("Ta Da/tasks/Trip.md");
		command.checkCallback(true);
		expect(openConvertModal).not.toHaveBeenCalled();
		command.checkCallback(false);
		expect(openConvertModal).toHaveBeenCalledWith(expect.objectContaining({ writer }), file);
	});
});
