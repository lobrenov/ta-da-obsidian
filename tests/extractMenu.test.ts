import { describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/extractTask", () => ({ extractSubtask: vi.fn(async () => undefined) }));
vi.mock("obsidian", () => ({
	MarkdownView: class MarkdownView {
		file = { path: "Ta Da/tasks/Trip.md" };
	},
	Notice: class {},
	Plugin: class {},
	TFile: class {},
}));
vi.mock("../src/ui/navigator/NavigatorView", () => ({ NavigatorView: class {} }));
vi.mock("../src/ui/navigator/views", () => ({ viewKinds: [], viewSpecs: {} }));
vi.mock("../src/ui/newTask/NewTaskModal", () => ({ NewTaskModal: class {} }));
vi.mock("../src/ui/header/pickers", () => ({ openParentPicker: vi.fn() }));
vi.mock("../src/ui/statusActions", () => ({ statusItem: vi.fn() }));

const { MarkdownView } = await import("obsidian");
const { registerCommands } = await import("../src/commands");
const { extractSubtask } = await import("../src/ui/extractTask");

const text = "- [ ] First\n- [ ] Second\n";

describe("the editor menu's Extract to task", () => {
	it("acts on the line the menu was opened on, not where the caret moved after", async () => {
		let handler: (menu: unknown, editor: unknown, view: unknown) => void = () => undefined;
		let line = 0;
		const editor = {
			getValue: () => text,
			getCursor: () => ({ line, ch: 0 }),
			posToOffset: (pos: { line: number }) => text.split("\n").slice(0, pos.line).join("\n").length + (pos.line > 0 ? 1 : 0),
		};
		const plugin = {
			app: { workspace: { on: (_name: string, callback: typeof handler) => void (handler = callback) } },
			taDaIndex: { index: {} },
			addCommand: () => undefined,
			registerEvent: () => undefined,
		};
		registerCommands(plugin as never);

		let click: () => void = () => undefined;
		const item = {
			setTitle: () => item,
			setIcon: () => item,
			onClick: (callback: () => void) => void ((click = callback), item),
		};
		handler({ addItem: (add: (item: unknown) => void) => add(item) }, editor, new (MarkdownView as unknown as new () => object)());
		line = 1;
		click();

		expect(extractSubtask).toHaveBeenCalledTimes(1);
		expect(vi.mocked(extractSubtask).mock.calls[0]?.[3]).toBe(0);
	});
});
