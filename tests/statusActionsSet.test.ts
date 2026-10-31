import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { makeItem } from "./support";

const asked: { project: string; tasks: string[]; answer: (as: "Done" | "Cancelled") => void; close: () => void }[] = [];
vi.mock("obsidian", () => ({ Notice: class {}, Modal: class {} }));
vi.mock("../src/ui/CompletionModal", () => ({
	CompletionModal: class {
		onClose = () => undefined;
		constructor(_app: unknown, question: { project: { title: string }; tasks: { title: string }[] }, answer: (as: "Done" | "Cancelled") => void) {
			asked.push({ close: () => this.onClose(), project: question.project.title, tasks: question.tasks.map((task) => task.title), answer });
		}
		open(): void {}
	},
}));

const { StatusActions } = await import("../src/ui/statusActions");

function setup(updatesIndex = true) {
	asked.length = 0;
	const index = new VaultIndex([
		makeItem("Ta Da/projects/P1.md", "type: project\nstatus: Doing"),
		makeItem("Ta Da/projects/P2.md", "type: project\nstatus: Doing"),
		makeItem("Ta Da/tasks/A.md", 'type: task\nstatus: Doing\nproject: "[[P1]]"'),
		makeItem("Ta Da/tasks/B.md", 'type: task\nstatus: Doing\nproject: "[[P1]]"'),
		makeItem("Ta Da/tasks/C.md", 'type: task\nstatus: Doing\nproject: "[[P2]]"'),
	]);
	const files = new Map<string, { path: string }>();
	for (const path of index.items.keys()) files.set(path, { path });
	const set: string[] = [];
	const writer = {
		apply: async (file: { path: string }, edit: (text: string) => unknown) => {
			const item = index.get(file.path);
			const text = `---\ntype: ${item?.properties.kind}\nstatus: Doing${item?.properties.kind === "task" ? `\nproject: "[[${index.projectOf(item)?.title}]]"` : ""}\n---\n`;
			const changed = edit(text);
			if (changed !== null) set.push(file.path);
			if (item && updatesIndex) index.update(makeItem(file.path, `type: ${item.properties.kind}\nstatus: Done${item.properties.kind === "task" ? `\nproject: "[[${index.projectOf(item)?.title}]]"` : ""}`));
		},
	};
	const app = { vault: { getFileByPath: (path: string) => files.get(path) ?? null } };
	const actions = new StatusActions(app as never, index, writer as never, () => LocalDate.parse("2026-10-05") as LocalDate);
	return { actions, files, set };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("StatusActions.setAll", () => {
	it("asks about one project at a time, after the previous answer", async () => {
		const { actions, files, set } = setup();
		const done = actions.setAll([files.get("Ta Da/projects/P1.md"), files.get("Ta Da/projects/P2.md")] as never, "Done");
		await tick();
		expect(asked.map((question) => question.project)).toEqual(["P1"]);
		asked[0]?.answer("Done");
		await tick();
		expect(asked.map((question) => question.project)).toEqual(["P1", "P2"]);
		asked[1]?.answer("Done");
		await done;
		expect(set).toContain("Ta Da/projects/P2.md");
	});

	it("applies tasks first so a project asks only about open tasks outside the set", async () => {
		const { actions, files } = setup();
		const done = actions.setAll(["Ta Da/projects/P1.md", "Ta Da/tasks/A.md"].map((path) => files.get(path)) as never, "Done");
		await tick();
		expect(asked).toHaveLength(1);
		expect(asked[0]?.tasks).toEqual(["B"]);
		asked[0]?.answer("Done");
		await done;
	});

	it("moves on to the next project when a question is cancelled", async () => {
		const { actions, files } = setup();
		const done = actions.setAll([files.get("Ta Da/projects/P1.md"), files.get("Ta Da/projects/P2.md")] as never, "Done");
		await tick();
		asked[0]?.close();
		await tick();
		expect(asked.map((question) => question.project)).toEqual(["P1", "P2"]);
		asked[1]?.answer("Done");
		await done;
	});

	it("leaves the tasks set with a project out of its question, without waiting on the index", async () => {
		const { actions, files, set } = setup(false);
		const done = actions.setAll(["Ta Da/projects/P1.md", "Ta Da/tasks/A.md"].map((path) => files.get(path)) as never, "Done");
		await tick();
		expect(asked[0]?.tasks).toEqual(["B"]);
		asked[0]?.answer("Cancelled");
		await done;
		expect(set).toEqual(["Ta Da/tasks/A.md", "Ta Da/projects/P1.md", "Ta Da/tasks/B.md"]);
	});

	it("doesn't ask when every open task is in the set", async () => {
		const { actions, files, set } = setup(false);
		await actions.setAll(["Ta Da/projects/P1.md", "Ta Da/tasks/A.md", "Ta Da/tasks/B.md"].map((path) => files.get(path)) as never, "Done");
		expect(asked).toEqual([]);
		expect(set).toEqual(["Ta Da/tasks/A.md", "Ta Da/tasks/B.md", "Ta Da/projects/P1.md"]);
	});
});
