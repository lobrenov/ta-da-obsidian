import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { planUnlog, relinkEdit } from "../src/core/writing/unlog";
import { makeItem } from "./support";

const project = (path: string, status = "Done") =>
	makeItem(path, `type: project\nstatus: ${status}${status === "Done" ? "\ncompletedDate: 2026-09-30" : ""}`);
const task = (path: string, status: string, parent = "Kombi") =>
	makeItem(path, `type: task\nstatus: ${status}${status === "Done" ? "\ncompletedDate: 2026-09-30" : ""}\nproject: "[[${parent}]]"`);
const none = () => [];

describe("planUnlog", () => {
	it("brings back a task's logged project, and the task under a name its folder has taken", () => {
		const index = new VaultIndex([
			project("Ta Da/logbook/2026-09/Kombi.md"),
			task("Ta Da/logbook/2026-09/Photos.md", "Not Started"),
			task("Ta Da/logbook/2026-09/Listing.md", "Done"),
			task("Ta Da/tasks/Photos.md", "Doing"),
		]);
		const plan = planUnlog(index, ["Ta Da/logbook/2026-09/Photos.md"], (folder) => index.liveItems.filter((i) => i.path.startsWith(`${folder}/`)).map((i) => i.title + ".md"));
		expect(plan).toEqual({
			moves: [
				{ from: "Ta Da/logbook/2026-09/Kombi.md", to: "Ta Da/projects/Kombi.md" },
				{ from: "Ta Da/logbook/2026-09/Photos.md", to: "Ta Da/tasks/Photos 2.md" },
			],
			doing: ["Ta Da/projects/Kombi.md"],
			relinks: [],
		});
	});

	it("leaves a reopened project's tasks logged and its own status to the caller", () => {
		const index = new VaultIndex([project("Ta Da/logbook/2026-09/Kombi.md", "Doing"), task("Ta Da/logbook/2026-09/Listing.md", "Done")]);
		expect(planUnlog(index, ["Ta Da/logbook/2026-09/Kombi.md"], none)).toEqual({
			moves: [{ from: "Ta Da/logbook/2026-09/Kombi.md", to: "Ta Da/projects/Kombi.md" }],
			doing: [],
			relinks: [],
		});
	});

	it("takes a project title no other project has, and its tasks' links follow", () => {
		const index = new VaultIndex([
			project("Ta Da/logbook/2026-08/Accounts.md"),
			project("Ta Da/logbook/2026-09/Accounts.md"),
			project("work/Accounts 2.md", "Doing"),
			task("Ta Da/logbook/2026-08/File them.md", "Done", "Accounts"),
		]);
		const plan = planUnlog(index, ["Ta Da/logbook/2026-08/Accounts.md"], none);
		expect(plan.moves).toEqual([{ from: "Ta Da/logbook/2026-08/Accounts.md", to: "Ta Da/projects/Accounts 3.md" }]);
		expect(plan.relinks).toEqual([{ path: "Ta Da/logbook/2026-08/File them.md", from: "Accounts", to: "Accounts 3" }]);
	});

	it("relinks no task for a logged project that a live project of its title shadows", () => {
		const index = new VaultIndex([
			project("Ta Da/logbook/2026-08/Accounts.md"),
			project("work/Accounts.md", "Doing"),
			task("Ta Da/logbook/2026-08/Open.md", "Doing", "Accounts"),
		]);
		const plan = planUnlog(index, ["Ta Da/logbook/2026-08/Accounts.md", "Ta Da/logbook/2026-08/Open.md"], none);
		expect(plan.relinks).toEqual([]);
	});

	it("numbers two projects of one title moved together and skips files that aren't logged or aren't there", () => {
		const index = new VaultIndex([
			project("Ta Da/logbook/2026-08/Kombi.md"),
			project("Ta Da/logbook/2026-09/Kombi.md"),
			project("Ta Da/projects/Live.md", "Doing"),
		]);
		const plan = planUnlog(index, ["Ta Da/logbook/2026-08/Kombi.md", "Ta Da/logbook/2026-09/Kombi.md", "Ta Da/projects/Live.md", "Gone.md"], none);
		expect(plan.moves.map((move) => move.to)).toEqual(["Ta Da/projects/Kombi 2.md", "Ta Da/projects/Kombi 3.md"]);
	});
});

describe("relinkEdit", () => {
	const text = '---\ntype: task\nstatus: Done\nproject: "[[Accounts]]"\n---\nBody\n';
	it("points a link that names the old title, ignoring case, at the new one", () => {
		expect(relinkEdit("Ta Da/tasks/A.md", "accounts", "Accounts 3")(text)).toBe(text.replace("[[Accounts]]", "[[Accounts 3]]"));
	});
	it("leaves another link alone", () => {
		expect(relinkEdit("Ta Da/tasks/A.md", "Books", "Books 2")(text)).toBeNull();
	});
});
