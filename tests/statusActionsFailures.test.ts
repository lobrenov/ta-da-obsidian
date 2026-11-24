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
	Modal: class {},
}));

const { StatusActions } = await import("../src/ui/statusActions");

const paths = ["Ta Da/tasks/A.md", "Ta Da/tasks/B.md", "Ta Da/tasks/C.md"];

function setup(failing: string[]) {
	const index = new VaultIndex([makeItem("Ta Da/projects/P.md", "type: project\nstatus: Doing"), ...paths.map((path) => makeItem(path, 'type: task\nstatus: Doing\nproject: "[[P]]"'))]);
	const files = [...paths, "Ta Da/projects/P.md"].map((path) => ({ path }));
	const written: string[] = [];
	const writer = {
		apply: async (file: { path: string }) => {
			if (failing.includes(file.path)) throw new Error("locked");
			written.push(file.path);
		},
	};
	const app = { vault: { getFileByPath: (path: string) => files.find((file) => file.path === path) ?? null } };
	const actions = new StatusActions(app as never, index, writer as never, () => LocalDate.parse("2026-10-05") as LocalDate);
	return { actions, files, written };
}

beforeEach(() => void (notices.length = 0));

describe("StatusActions failures", () => {
	it("applies the other changes when one write fails, and reports 1", async () => {
		const { actions, files, written } = setup([paths[1] as string]);
		await actions.setAll(files.slice(0, 3) as never, "Done");
		expect(written).toEqual([paths[0], paths[2]]);
		expect(notices).toEqual(["Couldn't set the status of 1 file: locked"]);
	});

	it("reports the count, never a name, when several fail", async () => {
		const { actions, files } = setup([paths[0] as string, paths[2] as string]);
		const question = { project: { path: "Ta Da/projects/P.md" }, status: "Done", tasks: [] } as never;
		await actions.answer(question, "Done");
		expect(notices).toEqual(["Couldn't set the status of 2 files: locked"]);
	});

	it("adds up failures across a selection into one notice, with the first reason", async () => {
		const { actions, files, written } = setup([paths[0] as string, paths[2] as string]);
		await actions.setAll(files.slice(0, 3) as never, "Done");
		expect(written).toEqual([paths[1]]);
		expect(notices).toEqual(["Couldn't set the status of 2 files: locked"]);
	});

	it("counts a file missing from the vault in the same total, without its path", async () => {
		const { actions, files } = setup([paths[0] as string]);
		await actions.setAll([...files.slice(0, 2), { path: "Ta Da/tasks/Gone.md" }] as never, "Done");
		expect(notices).toEqual(["Couldn't set the status of 2 files: locked"]);
	});
});
