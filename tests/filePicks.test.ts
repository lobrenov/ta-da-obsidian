import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { agreedDate, fileSetKind } from "../src/ui/fileActions";
import { pickClick } from "../src/ui/navigator/selection";
import { makeItem } from "./support";

const paths = ["a", "b", "c", "d", "e"];
const none = { paths: [], anchor: null };

describe("pickClick", () => {
	it("adds a row and removes it again, in list order", () => {
		const one = pickClick(paths, none, "c", "toggle");
		expect(one).toEqual({ paths: ["c"], anchor: "c" });
		const two = pickClick(paths, one, "a", "toggle");
		expect(two).toEqual({ paths: ["a", "c"], anchor: "a" });
		expect(pickClick(paths, two, "c", "toggle")).toEqual({ paths: ["a"], anchor: "c" });
	});

	it("picks the range from the anchor to the row, either way, keeping the anchor", () => {
		const down = pickClick(paths, { paths: ["b"], anchor: "b" }, "d", "range");
		expect(down).toEqual({ paths: ["b", "c", "d"], anchor: "b" });
		expect(pickClick(paths, down, "a", "range")).toEqual({ paths: ["a", "b"], anchor: "b" });
	});

	it("picks just the row for a range with no anchor in the list", () => {
		expect(pickClick(paths, none, "d", "range")).toEqual({ paths: ["d"], anchor: "d" });
		expect(pickClick(paths, { paths: ["x"], anchor: "x" }, "d", "range")).toEqual({ paths: ["d"], anchor: "d" });
	});

	it("ignores a row that isn't in the list", () => {
		expect(pickClick(paths, none, "z", "toggle")).toBe(none);
	});
});

describe("fileSetKind", () => {
	const index = new VaultIndex([
		makeItem("Ta Da/tasks/A.md", "type: task\nstatus: Doing"),
		makeItem("Ta Da/tasks/B.md", "type: task\nstatus: Doing"),
		makeItem("Ta Da/projects/P.md", "type: project\nstatus: Ongoing"),
		makeItem("Ta Da/areas/Home.md", "type: area"),
		makeItem("Notes/Plain.md", ""),
	]);

	it("names tasks only, projects only and a mix", () => {
		expect(fileSetKind(index, ["Ta Da/tasks/A.md", "Ta Da/tasks/B.md"])).toBe("task");
		expect(fileSetKind(index, ["Ta Da/projects/P.md"])).toBe("project");
		expect(fileSetKind(index, ["Ta Da/tasks/A.md", "Ta Da/projects/P.md"])).toBe("mixed");
	});

	it("is null for an empty set or one with a file that isn't a task or project", () => {
		expect(fileSetKind(index, [])).toBeNull();
		expect(fileSetKind(index, ["Ta Da/tasks/A.md", "Notes/Plain.md"])).toBeNull();
		expect(fileSetKind(index, ["Ta Da/areas/Home.md"])).toBeNull();
		expect(fileSetKind(index, ["Missing.md"])).toBeNull();
	});
});

describe("agreedDate", () => {
	const item = (properties: string) => makeItem("Ta Da/tasks/T.md", `type: task\n${properties}`);

	it("is the date every item has", () => {
		const items = [item("dueDate: 2026-10-05"), item("dueDate: 2026-10-05")];
		expect(agreedDate(items, "dueDate")?.toString()).toBe("2026-10-05");
	});

	it("is null when they differ or one has none", () => {
		expect(agreedDate([item("dueDate: 2026-10-05"), item("dueDate: 2026-10-06")], "dueDate")).toBeNull();
		expect(agreedDate([item("dueDate: 2026-10-05"), item("status: Doing")], "dueDate")).toBeNull();
		expect(agreedDate([item("deadline: 2026-10-05"), item("deadline: 2026-10-05")], "dueDate")).toBeNull();
	});
});
