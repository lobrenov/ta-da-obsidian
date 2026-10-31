import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { areaTrashMessage, areaTrashTitle, filesToTrash } from "../src/core/storage/trashPlan";
import { makeItem } from "./support";

const notices: string[] = [];
vi.mock("obsidian", () => ({
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
	Modal: class {},
}));
const { trashPaths } = await import("../src/ui/deleteFiles");

const index = new VaultIndex([
	makeItem("Ta Da/areas/Home.md", "type: area"),
	makeItem("Ta Da/areas/Empty.md", "type: area"),
	makeItem("Ta Da/areas/Solo.md", "type: area"),
	makeItem("Ta Da/projects/Reno.md", 'type: project\narea: "[[Home]]"'),
	makeItem("Ta Da/projects/Garden.md", 'type: project\narea: "[[Home]]"'),
	makeItem("Ta Da/projects/Gone.md", 'type: project\nstatus: Done\narea: "[[Home]]"'),
	makeItem("Ta Da/tasks/Paint.md", 'type: task\nproject: "[[Reno]]"'),
	makeItem("Ta Da/tasks/Plant.md", 'type: task\nproject: "[[Garden]]"'),
	makeItem("Ta Da/tasks/Mow.md", 'type: task\narea: "[[Home]]"'),
	makeItem("Ta Da/tasks/Sweep.md", 'type: task\narea: "[[Solo]]"'),
	makeItem("Ta Da/logbook/2026-10/Old.md", 'type: task\nstatus: Done\nproject: "[[Reno]]"'),
	makeItem("Ta Da/tasks/Loose.md", "type: task"),
]);
const area = (title: string) => index.get(`Ta Da/areas/${title}.md`)!;

describe("filesToTrash", () => {
	it("is a project with its live tasks, logged ones staying", () => {
		expect(filesToTrash(index, "Ta Da/projects/Reno.md")).toEqual(["Ta Da/projects/Reno.md", "Ta Da/tasks/Paint.md"]);
	});

	it("is an area with its projects, their tasks and its own tasks, the file first", () => {
		const paths = filesToTrash(index, "Ta Da/areas/Home.md");
		expect(paths[0]).toBe("Ta Da/areas/Home.md");
		expect(paths.slice(1).sort()).toEqual(
			["Ta Da/projects/Reno.md", "Ta Da/projects/Garden.md", "Ta Da/projects/Gone.md", "Ta Da/tasks/Mow.md", "Ta Da/tasks/Paint.md", "Ta Da/tasks/Plant.md"].sort(),
		);
	});

	it("lists a task once when it links both a project and that project's area", () => {
		const both = new VaultIndex([
			...index.items.values(),
			makeItem("Ta Da/tasks/Both.md", 'type: task\nproject: "[[Reno]]"\narea: "[[Home]]"'),
		]);
		const paths = filesToTrash(both, "Ta Da/areas/Home.md");
		expect(paths.filter((path) => path === "Ta Da/tasks/Both.md")).toHaveLength(1);
		expect(new Set(paths).size).toBe(paths.length);
	});

	it("is just the file for a task", () => {
		expect(filesToTrash(index, "Ta Da/tasks/Loose.md")).toEqual(["Ta Da/tasks/Loose.md"]);
	});
});

describe("the area's delete confirmation", () => {
	it("is titled for the area", () => {
		expect(areaTrashTitle(area("Home"))).toBe("Delete “Home”?");
	});

	it("lists projects, their tasks and its own tasks", () => {
		expect(areaTrashMessage(index, area("Home"))).toBe(
			"Home, its 3 projects and their 2 tasks, and its 1 own task move to the Trash.\n\nRestoring Home brings back the area alone. Restoring a project or task brings Home back with it.",
		);
	});

	it("says only what the area has", () => {
		expect(areaTrashMessage(index, area("Empty"))).toMatch(/^Empty moves to the Trash\./);
		expect(areaTrashMessage(index, area("Solo"))).toMatch(/^Solo and its 1 own task move to the Trash\./);
	});
});

describe("trashPaths", () => {
	function setup(failing: string[] = []) {
		const trashed: string[] = [];
		const notices: string[] = [];
		const files = new Map(["a", "b", "c", "d"].map((path) => [path, { path, basename: path }]));
		const app = {
			vault: {
				getFileByPath: (path: string) => files.get(path) ?? null,
				trash: async (file: { path: string }, system: boolean) => {
					if (failing.includes(file.path)) throw new Error("locked");
					expect(system).toBe(false);
					trashed.push(file.path);
				},
			},
		};
		return { app, trashed, notices };
	}

	it("moves each file in order, skipping one that is gone", async () => {
		const { app, trashed } = setup();
		await trashPaths(app as never, ["a", "missing", "b", "c"]);
		expect(trashed).toEqual(["a", "b", "c"]);
	});

	it("stops at the first failure and says which file and how many didn't move", async () => {
		notices.length = 0;
		const { app, trashed } = setup(["b"]);
		await trashPaths(app as never, ["a", "b", "missing", "c", "d"]);
		expect(trashed).toEqual(["a"]);
		expect(notices).toEqual(["Couldn't delete “b”: locked. 4 files didn't move."]);
	});

	it("moves nothing from an area whose own file can't move", async () => {
		notices.length = 0;
		const { app, trashed } = setup(["a"]);
		await trashPaths(app as never, ["a", "b", "c"]);
		expect(trashed).toEqual([]);
		expect(notices).toEqual(["Couldn't delete “a”: locked. 3 files didn't move."]);
	});
});
