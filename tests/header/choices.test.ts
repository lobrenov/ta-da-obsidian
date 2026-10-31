import { describe, expect, it } from "vitest";
import { VaultIndex } from "../../src/core/index/vaultIndex";
import { parentChoices, pickerTags, tagChoices } from "../../src/ui/header/choices";
import { readTag } from "../../src/core/model/tag";
import { makeItem } from "../support";

const items = [
	makeItem("Ta Da/areas/Personal.md", "type: area"),
	makeItem("Ta Da/areas/Work.md", "type: area"),
	makeItem("Ta Da/projects/Sell the Kombi.md", 'type: project\nstatus: Doing\narea: "[[Personal]]"'),
	makeItem("Ta Da/projects/Taxes.md", 'type: project\nstatus: Doing\narea: "[[Work]]"'),
	makeItem("Ta Da/projects/Loose project.md", "type: project\nstatus: Doing"),
	makeItem("Ta Da/projects/Finished.md", 'type: project\nstatus: Done\narea: "[[Work]]"'),
];
const index = new VaultIndex(items);
const labels = (choices: ReturnType<typeof parentChoices>): string[] => choices.map((choice) => choice.label);

describe("parentChoices", () => {
	it("lists None, the loose projects, then each area with its active projects", () => {
		const choices = parentChoices("task", index, null);
		expect(labels(choices)).toEqual(["None", "Loose project", "Personal", "Sell the Kombi", "Work", "Taxes"]);
		expect(choices[0]).toMatchObject({ current: true });
		expect(choices[3]).toMatchObject({ detail: "Personal", parent: { kind: "project", title: "Sell the Kombi" } });
	});

	it("marks the current parent instead of hiding it, even a finished project", () => {
		const choices = parentChoices("task", index, { kind: "project", title: "finished" });
		expect(labels(choices)).toContain("Finished");
		expect(choices.filter((choice) => choice.current).map((choice) => choice.label)).toEqual(["Finished"]);
		const area = parentChoices("task", index, { kind: "area", title: "Work" });
		expect(area.filter((choice) => choice.current).map((choice) => choice.label)).toEqual(["Work"]);
	});

	it("offers a project only areas", () => {
		expect(labels(parentChoices("project", index, { kind: "area", title: "Work" }))).toEqual(["None", "Personal", "Work"]);
	});
});

describe("tagChoices", () => {
	const vault = [
		{ name: "dev", path: "dev" },
		{ name: "Home/Garden", path: "home/garden" },
		{ name: "home", path: "home" },
	];

	it("lists the vault's tags and marks the ones on the file", () => {
		expect(tagChoices(vault, ["Dev"], "")).toEqual([
			{ name: "dev", current: true, isNew: false },
			{ name: "home", current: false, isNew: false },
			{ name: "Home/Garden", current: false, isNew: false },
		]);
	});

	it("filters by the typed text and offers a new tag when none matches exactly", () => {
		expect(tagChoices(vault, [], "#gar")).toEqual([
			{ name: "gar", current: false, isNew: true },
			{ name: "Home/Garden", current: false, isNew: false },
		]);
		expect(tagChoices(vault, [], "DEV")).toEqual([{ name: "dev", current: false, isNew: false }]);
	});
});

describe("pickerTags", () => {
	it("keeps the index's spellings, then adds Obsidian's tags for paths the index lacks", () => {
		const carried = [readTag("Home"), readTag("quick win")].flatMap((tag) => tag ?? []);
		const tags = pickerTags(carried, { "#Home": 1, "#home": 2, "#quick": 1, "#home/": 1, "#2026/10": 1 });
		expect(tags.map((tag) => tag.name)).toEqual(["Home", "quick win", "quick", "2026/10"]);
		expect(tagChoices(tags, [], "home").map((choice) => choice.name)).toEqual(["Home"]);
	});
});

describe("parentChoices with no one current parent", () => {
	it("leaves None unmarked", () => {
		expect(parentChoices("task", index, null, false)[0]).toMatchObject({ label: "None", current: false });
	});
});
