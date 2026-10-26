import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { makeItem } from "./support";

// jsdom's window by hand: the jsdom environment can't resolve a mocked "obsidian".
const { shown, dom } = await vi.hoisted(async () => ({ shown: [] as HTMLElement[], dom: new (await import("jsdom")).JSDOM("") }));
const { document, window } = dom.window;
vi.mock("obsidian", () => ({
	Notice: class {},
	Menu: class {},
	Platform: {},
	Modal: class {
		contentEl = Object.assign(document.createElement("div"), { win: window, empty() {} });
		modalEl = document.createElement("div");
		titleEl = { setText: () => undefined };
		constructor(public app: unknown) {}
		open(): void {
			shown.push(this.contentEl);
			(this as unknown as { onOpen(): void }).onOpen();
		}
		close(): void {}
	},
}));
vi.mock("../src/ui/header/pickers", () => ({ openStatusMenu: vi.fn(), openParentPicker: vi.fn() }));

const { openConvertModal } = await import("../src/ui/convert/ConvertModal");

const today = LocalDate.parse("2026-10-26") as LocalDate;
const index = new VaultIndex([
	makeItem("Ta Da/tasks/Trip.md", 'type: task\nstatus: Doing\nproject: "[[Holiday]]"'),
	makeItem("Ta Da/projects/Holiday.md", 'type: project\narea: "[[Home]]"'),
	makeItem("Ta Da/areas/Home.md", "type: area"),
	makeItem("Ta Da/projects/Trip.md", "type: project"),
]);

let links: unknown;
const renamed: string[] = [];
const made: string[] = [];
const rewrites: (string | null)[] = [];
const file = { path: "Ta Da/tasks/Trip.md", basename: "Trip" };

/** Opens the modal for the task with `body`, and resolves to its content. */
async function opened(body: string): Promise<HTMLElement> {
	const text = `---\ntype: task\nstatus: Doing\nproject: "[[Holiday]]"\n---\n${body}`;
	const app = {
		vault: { read: async () => text, getFolderByPath: () => null, createFolder: async () => undefined, create: async (path: string) => void made.push(path), getConfig: () => links },
		fileManager: { renameFile: async (_file: unknown, path: string) => void renamed.push(path) },
		workspace: { getLeaf: () => ({ openFile: async () => undefined }) },
	};
	await openConvertModal({ app, index, writer: { apply: async (_file: unknown, edit: (text: string) => string | null) => void rewrites.push(edit(text)) }, today: () => today } as never, file as never);
	return shown[shown.length - 1] as HTMLElement;
}

beforeEach(() => {
	links = true;
	renamed.length = 0;
	made.length = 0;
	rewrites.length = 0;
});

describe("the Convert to project modal", () => {
	it("opens with the task's status and its project's area, and shows the subtask toggle on when it has subtasks", async () => {
		const modal = await opened("- [ ] One\n- [ ] Two\n");
		expect(modal.querySelector(".is-status")?.textContent).toBe("Doing");
		expect(modal.querySelector(".is-parent")?.textContent).toBe("Home");
		const toggle = modal.querySelector<HTMLInputElement>('input[type="checkbox"]');
		expect(toggle?.checked).toBe(true);
		expect(modal.querySelector(".ta-da-convert-subtasks")?.textContent).toBe("Make its 2 subtasks tasks under the project");
	});

	it("says subtask in the singular for one", async () => {
		const modal = await opened("- [ ] One\n");
		expect(modal.querySelector(".ta-da-convert-subtasks")?.textContent).toBe("Make its subtask a task under the project");
	});

	it("hides the toggle when the task has no subtasks", async () => {
		const modal = await opened("Just text\n");
		expect(modal.querySelector(".ta-da-convert-subtasks")).toBeNull();
	});

	it("says where the file moves and that the name is taken", async () => {
		const modal = await opened("");
		expect(modal.querySelector(".ta-da-new-path")?.textContent).toBe("Ta Da/tasks/Trip.md moves to Ta Da/projects/Trip 2.md");
		expect(modal.querySelector(".ta-da-new-warning")?.textContent).toBe("There's already a project called Trip. This one will be Trip 2.");
	});

	it("warns that links won't follow only when Obsidian's link updating is off", async () => {
		links = false;
		const modal = await opened("Just text\n");
		const warning = [...modal.querySelectorAll(".ta-da-new-warning")].map((node) => node.textContent);
		expect(warning).toContain("Obsidian isn't set to update internal links, so links to it won't follow it.");
		links = true;
		const again = await opened("Just text\n");
		expect(again.textContent).not.toContain("update internal links");
	});

	it("converts with its choice: the status and area written, the file moved, the subtasks left without the toggle", async () => {
		const modal = await opened("- [ ] One\n");
		const toggle = modal.querySelector<HTMLInputElement>('input[type="checkbox"]') as HTMLInputElement;
		toggle.checked = false;
		toggle.dispatchEvent(new window.Event("change"));
		[...modal.querySelectorAll("button")].find((button) => button.textContent === "Convert to project")?.click();
		await vi.waitFor(() => expect(renamed).toEqual(["Ta Da/projects/Trip 2.md"]));
		expect(rewrites[0]).toContain("type: project");
		expect(rewrites[0]).toContain('area: "[[Home]]"');
		expect(made).toEqual([]);
	});

	it("makes the subtasks tasks with the toggle on", async () => {
		const modal = await opened("- [ ] One\n");
		[...modal.querySelectorAll("button")].find((button) => button.textContent === "Convert to project")?.click();
		await vi.waitFor(() => expect(made).toEqual(["Ta Da/tasks/One.md"]));
	});
});
