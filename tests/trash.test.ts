import { describe, expect, it } from "vitest";
import { contentsOf, tasksOf, trashedItems } from "../src/core/storage/trash";

const task = "---\ntype: task\nstatus: Not Started\n---\n";
const taskIn = (project: string): string => `---\ntype: task\nproject: "[[${project}]]"\n---\n`;
const filed = (kind: string, area: string): string => `---\ntype: ${kind}\nstatus: Doing\narea: "[[${area}]]"\n---\n`;
const project = "---\ntype: project\nstatus: Doing\n---\n";
const area = "---\ntype: area\n---\n";

describe("trash listing", () => {
	it("leaves out hidden files and files in hidden folders", () => {
		const trashed = trashedItems([
			{ path: ".trash/Task.md", text: task },
			{ path: ".trash/Note.md", text: "An Obsidian note\n" },
			{ path: ".trash/sub/Nested.md", text: task },
			{ path: ".trash/.hidden.md", text: task },
			{ path: ".trash/.git/Inside.md", text: task },
			{ path: ".trash/image.png", text: "" },
		]);
		expect(trashed.map(({ item }) => item.path).sort()).toEqual([".trash/Note.md", ".trash/Task.md", ".trash/sub/Nested.md"]);
		expect(trashed.find(({ item }) => item.path === ".trash/Note.md")?.item.properties.kind).toBe("note");
	});

	it("sorts by title", () => {
		const trashed = trashedItems([
			{ path: ".trash/b.md", text: task },
			{ path: ".trash/A 10.md", text: task },
			{ path: ".trash/A 2.md", text: task },
		]);
		expect(trashed.map(({ item }) => item.title)).toEqual(["A 2", "A 10", "b"]);
	});

	it("finds a trashed project's tasks by title, ignoring case", () => {
		const trashed = trashedItems([
			{ path: ".trash/P.md", text: project },
			{ path: ".trash/Two.md", text: taskIn("p") },
			{ path: ".trash/One.md", text: taskIn("P") },
			{ path: ".trash/Other.md", text: taskIn("Q") },
			{ path: ".trash/Loose.md", text: task },
		]);
		const p = trashed.find(({ item }) => item.path === ".trash/P.md");
		expect(tasksOf(p!.item, trashed).map(({ item }) => item.path)).toEqual([".trash/One.md", ".trash/Two.md"]);
	});

	it("finds a trashed area's projects and tasks, including its projects' tasks", () => {
		const trashed = trashedItems([
			{ path: ".trash/A.md", text: area },
			{ path: ".trash/Proj.md", text: filed("project", "A") },
			{ path: ".trash/Own task.md", text: filed("task", "a") },
			{ path: ".trash/Proj task.md", text: taskIn("Proj") },
			{ path: ".trash/Elsewhere.md", text: filed("task", "B") },
		]);
		const a = trashed.find(({ item }) => item.path === ".trash/A.md");
		const contents = contentsOf(a!.item, trashed);
		expect(contents.projects.map(({ item }) => item.path)).toEqual([".trash/Proj.md"]);
		expect(contents.tasks.map(({ item }) => item.path)).toEqual([".trash/Own task.md", ".trash/Proj task.md"]);
	});
});
