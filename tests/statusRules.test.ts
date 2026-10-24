import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import {
	planAnswer,
	planStatus,
	planToggle,
	questionButton,
	questionMessage,
	questionTitle,
	type StatusPlan,
} from "../src/core/writing/statusRules";
import { makeItem } from "./support";

const project = (status: string) => makeItem("Ta Da/projects/Kombi.md", `type: project\nstatus: ${status}`);
const task = (name: string, status: string, parent = 'project: "[[Kombi]]"') =>
	makeItem(`Ta Da/tasks/${name}.md`, `type: task\nstatus: ${status}\n${parent}`);
const indexOf = (...items: ReturnType<typeof makeItem>[]) => new VaultIndex(items);

describe("planStatus", () => {
	it("sets one file when nothing else follows", () => {
		const a = task("A", "Doing");
		expect(planStatus(indexOf(project("Doing"), a), a, "Done")).toEqual({ changes: [{ path: a.path, status: "Done" }] });
	});

	it("asks before closing a project with open tasks", () => {
		const p = project("Doing");
		const open = task("A", "Doing");
		const plan = planStatus(indexOf(p, open, task("B", "Done")), p, "Done");
		expect(plan).toEqual({ ask: { project: p, status: "Done", tasks: [open] } });
		expect(planStatus(indexOf(p, open), p, "Cancelled")).toMatchObject({ ask: { status: "Cancelled" } });
	});

	it("closes a project without open tasks, or opens one, without asking", () => {
		const p = project("Doing");
		expect(planStatus(indexOf(p, task("B", "Done")), p, "Done")).toEqual({ changes: [{ path: p.path, status: "Done" }] });
		expect(planStatus(indexOf(p, task("A", "Doing")), p, "Blocked")).toEqual({ changes: [{ path: p.path, status: "Blocked" }] });
	});

	it("reopens a Done or Cancelled project with a reopened task", () => {
		for (const closed of ["Done", "Cancelled"]) {
			const t = task("A", "Done");
			expect(planStatus(indexOf(project(closed), t), t, "Not Started")).toEqual({
				changes: [
					{ path: t.path, status: "Not Started" },
					{ path: "Ta Da/projects/Kombi.md", status: "Doing" },
				],
			});
		}
	});

	it("leaves an open project, a loose task and a task that wasn't closed alone", () => {
		const closed = task("A", "Cancelled");
		expect(planStatus(indexOf(project("Blocked"), closed), closed, "Doing")).toEqual({ changes: [{ path: closed.path, status: "Doing" }] });
		const loose = task("L", "Done", "");
		expect(planStatus(indexOf(project("Done"), loose), loose, "Doing")).toEqual({ changes: [{ path: loose.path, status: "Doing" }] });
		const open = task("O", "Doing");
		expect(planStatus(indexOf(project("Done"), open), open, "Blocked")).toEqual({ changes: [{ path: open.path, status: "Blocked" }] });
		const stillClosed = task("C", "Done");
		expect(planStatus(indexOf(project("Done"), stillClosed), stillClosed, "Cancelled")).toEqual({ changes: [{ path: stillClosed.path, status: "Cancelled" }] });
	});

	it("changes nothing for an area or a note", () => {
		const area = makeItem("Ta Da/areas/Home.md", "type: area");
		expect(planStatus(indexOf(area), area, "Done")).toEqual({ changes: [] });
	});
});

describe("planStatus on logged files", () => {
	const logged = (name: string, status: string) =>
		makeItem(`Ta Da/Logbook/2026-09/${name}.md`, `type: task\nstatus: ${status}\nproject: "[[Kombi]]"`);
	const loggedProject = makeItem("Ta Da/Logbook/2026-09/Kombi.md", "type: project\nstatus: Done");

	it("puts a reopened logged task back, with its logged project as Doing", () => {
		const t = logged("A", "Done");
		expect(planStatus(indexOf(loggedProject, t), t, "Not Started")).toEqual({
			changes: [{ path: t.path, status: "Not Started" }],
			unlog: { paths: [t.path], doing: [loggedProject.path] },
		});
	});

	it("puts back a logged project for an open task that's live", () => {
		const t = task("A", "Doing");
		expect(planStatus(indexOf(loggedProject, t), t, "Blocked")).toEqual({
			changes: [{ path: t.path, status: "Blocked" }],
			unlog: { paths: [loggedProject.path], doing: [loggedProject.path] },
		});
	});

	it("puts back a logged task under a live Done project and reopens the project", () => {
		const t = logged("A", "Cancelled");
		expect(planStatus(indexOf(project("Done"), t), t, "Doing")).toEqual({
			changes: [
				{ path: t.path, status: "Doing" },
				{ path: "Ta Da/projects/Kombi.md", status: "Doing" },
			],
			unlog: { paths: [t.path], doing: [] },
		});
	});

	it("puts back a logged project alone, and nothing for a file closed again", () => {
		expect(planStatus(indexOf(loggedProject), loggedProject, "Doing")).toEqual({
			changes: [{ path: loggedProject.path, status: "Doing" }],
			unlog: { paths: [loggedProject.path], doing: [] },
		});
		const t = logged("A", "Done");
		expect(planStatus(indexOf(loggedProject, t), t, "Cancelled")).toEqual({ changes: [{ path: t.path, status: "Cancelled" }] });
	});
});

describe("planToggle", () => {
	it("completes an open task and reopens a closed one with its project", () => {
		const open = task("A", "Blocked");
		expect(planToggle(indexOf(open), open)).toEqual({ changes: [{ path: open.path, status: "Done" }] });
		const done = task("B", "Done");
		expect(planToggle(indexOf(project("Done"), done), done)).toEqual({
			changes: [
				{ path: done.path, status: "Not Started" },
				{ path: "Ta Da/projects/Kombi.md", status: "Doing" },
			],
		});
	});

	it("asks for a project with open tasks, and reopens one to Not Started", () => {
		const p = project("Doing");
		expect(planToggle(indexOf(p, task("A", "Doing")), p)).toHaveProperty("ask");
		const done = project("Done");
		expect(planToggle(indexOf(done), done)).toEqual({ changes: [{ path: done.path, status: "Not Started" }] });
	});
});

describe("planAnswer", () => {
	it("sets the project, then the tasks it has open now", () => {
		const p = project("Doing");
		const first = task("A", "Doing");
		const plan = planStatus(indexOf(p, first), p, "Done") as Extract<StatusPlan, { ask: unknown }>;
		const later = indexOf(p, first, task("B", "Blocked"), task("C", "Done"));
		expect(planAnswer(later, plan.ask, "Cancelled")).toEqual([
			{ path: p.path, status: "Done" },
			{ path: "Ta Da/tasks/A.md", status: "Cancelled" },
			{ path: "Ta Da/tasks/B.md", status: "Cancelled" },
		]);
	});

	it("doesn't set a project that's already at the asked status, or one that's gone", () => {
		const p = project("Doing");
		const question = { project: p, status: "Done" as const, tasks: [task("A", "Doing")] };
		expect(planAnswer(indexOf(project("Done"), task("A", "Doing")), question, "Done")).toEqual([{ path: "Ta Da/tasks/A.md", status: "Done" }]);
		expect(planAnswer(indexOf(), question, "Done")).toEqual([]);
	});
});

describe("question words", () => {
	const make = (count: number, status: "Done" | "Cancelled") => ({
		project: project("Doing"),
		status,
		tasks: Array.from({ length: count }, (_, number) => task(`T${number}`, "Doing")),
	});

	it("says what the Mac says, without the Logbook", () => {
		expect(questionTitle(make(1, "Done"))).toBe("Complete “Kombi”?");
		expect(questionTitle(make(1, "Cancelled"))).toBe("Cancel “Kombi”?");
		expect(questionMessage(make(1, "Done"))).toBe("1 of its tasks is still open. Close it with the project.");
		expect(questionMessage(make(3, "Done"))).toBe("3 of its tasks are still open. Close them with the project.");
		expect(questionButton(make(1, "Done"), "Done")).toBe("Complete 1 task");
		expect(questionButton(make(3, "Done"), "Cancelled")).toBe("Cancel 3 tasks");
	});
});
