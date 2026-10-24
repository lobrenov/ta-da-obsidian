import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { readTag } from "../src/core/model/tag";
import { emptyDraft } from "../src/core/writing/quickEntryDraft";
import { placeDraft } from "../src/ui/newTask/place";
import { type NewTaskContext, prefillDraft } from "../src/ui/newTask/prefill";
import { makeItem } from "./support";

const day = LocalDate.parse("2026-10-14") as LocalDate;
const agenda: NewTaskContext = { domain: { kind: "agenda" }, selection: { kind: "day", date: day } };
const index = new VaultIndex([
	makeItem("Ta Da/projects/Kombi.md", "type: project\ntags: [Car/Kombi]"),
	makeItem("Ta Da/areas/Home.md", "type: area"),
]);

describe("prefillDraft", () => {
	it("is a loose task with no navigator or an unrelated list", () => {
		expect(prefillDraft(null, index)).toEqual(emptyDraft());
		expect(prefillDraft({ domain: { kind: "logbook" }, selection: agenda.selection }, index)).toEqual(emptyDraft());
		expect(prefillDraft({ domain: { kind: "loose" }, selection: agenda.selection }, index)).toEqual(emptyDraft());
	});

	it("files under the shown project or area", () => {
		const selection = agenda.selection;
		expect(prefillDraft({ domain: { kind: "project", path: "Ta Da/projects/Kombi.md" }, selection }, index).parent).toEqual({ kind: "project", title: "Kombi" });
		expect(prefillDraft({ domain: { kind: "area", path: "Ta Da/areas/Home.md" }, selection }, index).parent).toEqual({ kind: "area", title: "Home" });
		expect(prefillDraft({ domain: { kind: "project", path: "Ta Da/areas/Home.md" }, selection }, index).parent).toBeNull();
		expect(prefillDraft({ domain: { kind: "project", path: "gone.md" }, selection }, index).parent).toBeNull();
	});

	it("tags with the shown tag, in its spelling", () => {
		const draft = prefillDraft({ domain: { kind: "tag", path: "car/kombi" }, selection: agenda.selection }, index);
		expect(draft.tags).toEqual([readTag("Car/Kombi")]);
		expect(prefillDraft({ domain: { kind: "tag", path: null }, selection: agenda.selection }, index).tags).toEqual([]);
	});

	it("makes a task due on the Agenda's selected day, not a week", () => {
		expect(prefillDraft(agenda, index).dueDate?.toString()).toBe("2026-10-14");
		const week = { kind: "week" as const, week: day.isoWeek };
		expect(prefillDraft({ domain: { kind: "agenda" }, selection: week }, index).dueDate).toBeNull();
	});
});

describe("placeDraft", () => {
	const draft = { ...emptyDraft(), title: "Call: Bea" };

	it("puts a task in its folder under its sanitised name", () => {
		expect(placeDraft(draft, [], [])).toEqual({ folder: "Ta Da/tasks", path: "Ta Da/tasks/Call - Bea.md", numbered: false });
	});

	it("numbers a taken name, ignoring case", () => {
		expect(placeDraft(draft, ["call - bea.md"], [])).toEqual({ folder: "Ta Da/tasks", path: "Ta Da/tasks/Call - Bea 2.md", numbered: true });
	});

	it("numbers a project against every project's name, and a task against its folder only", () => {
		expect(placeDraft({ ...draft, kind: "project" }, [], ["Call - Bea.md"]).path).toBe("Ta Da/projects/Call - Bea 2.md");
		expect(placeDraft(draft, [], ["Call - Bea.md"]).numbered).toBe(false);
	});

	it("puts a note at the top level", () => {
		expect(placeDraft({ ...draft, kind: "note" }, [], [])).toEqual({ folder: "", path: "Call - Bea.md", numbered: false });
	});
});
