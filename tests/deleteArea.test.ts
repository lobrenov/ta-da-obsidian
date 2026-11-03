import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { makeItem } from "./support";

// jsdom's window by hand: the jsdom environment can't resolve a mocked "obsidian".
const { dom } = await vi.hoisted(async () => ({ dom: new (await import("jsdom")).JSDOM("") }));
const { document, window } = dom.window;
vi.mock("obsidian", () => ({
	Notice: class {},
	Modal: class {
		titleEl = { setText: (text: string) => void ((this as unknown as { titleText: string }).titleText = text) };
		modalEl = document.createElement("div");
		contentEl = Object.assign(document.createElement("div"), { win: { setTimeout: () => undefined }, empty() {} });
		closed = false;
		constructor(public app: unknown) {}
		open(): void {
			(this as unknown as { onOpen(): void }).onOpen();
			opened.push(this as never);
		}
		close(): void {
			this.closed = true;
		}
	},
}));
const opened: { contentEl: HTMLElement; titleText: string; close(): void }[] = [];

const { deleteItem } = await import("../src/ui/deleteFiles");

const index = new VaultIndex([
	makeItem("Ta Da/areas/Home.md", "type: area"),
	makeItem("Ta Da/areas/Solo.md", "type: area"),
	makeItem("Ta Da/projects/Reno.md", 'type: project\narea: "[[Home]]"'),
	makeItem("Ta Da/tasks/Paint.md", 'type: task\nproject: "[[Reno]]"'),
	makeItem("Ta Da/tasks/Mow.md", 'type: task\narea: "[[Home]]"'),
]);

function setup() {
	opened.length = 0;
	const files = new Map([...index.items.keys()].map((path) => [path, { path, basename: path }]));
	const trashed: string[] = [];
	const app = {
		vault: { getFileByPath: (path: string) => files.get(path) ?? null },
		fileManager: { trashFile: async (file: { path: string }) => void trashed.push(file.path) },
	};
	return { app, files, trashed };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const button = (label: string) => [...opened[0]!.contentEl.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLElement;

describe("deleteItem", () => {
	it("deletes a project without asking", async () => {
		const { app, files, trashed } = setup();
		deleteItem(app as never, index, files.get("Ta Da/projects/Reno.md") as never);
		await tick();
		expect(opened).toEqual([]);
		expect(trashed).toEqual(["Ta Da/projects/Reno.md", "Ta Da/tasks/Paint.md"]);
	});

	it("asks before deleting an area, and Cancel moves nothing", async () => {
		const { app, files, trashed } = setup();
		deleteItem(app as never, index, files.get("Ta Da/areas/Home.md") as never);
		await tick();
		expect(opened).toHaveLength(1);
		expect(opened[0]?.titleText).toBe("Delete “Home”?");
		expect(trashed).toEqual([]);
		button("Cancel").dispatchEvent(new window.Event("click"));
		await tick();
		expect(trashed).toEqual([]);
	});

	it("deletes the area file first when confirmed, the button counting the files", async () => {
		const { app, files, trashed } = setup();
		deleteItem(app as never, index, files.get("Ta Da/areas/Home.md") as never);
		button("Delete 4 files").dispatchEvent(new window.Event("click"));
		await tick();
		expect(trashed[0]).toBe("Ta Da/areas/Home.md");
		expect(trashed.slice(1).sort()).toEqual(["Ta Da/projects/Reno.md", "Ta Da/tasks/Mow.md", "Ta Da/tasks/Paint.md"]);
	});

	it("says Delete 1 file for an area with nothing in it", async () => {
		const { app, files, trashed } = setup();
		deleteItem(app as never, index, files.get("Ta Da/areas/Solo.md") as never);
		button("Delete 1 file").dispatchEvent(new window.Event("click"));
		await tick();
		expect(trashed).toEqual(["Ta Da/areas/Solo.md"]);
	});
});
