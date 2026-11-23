import { describe, expect, it, vi } from "vitest";
import { LocalDate } from "../src/core/model/localDate";
import { buildStrip, agendaOn } from "../src/ui/navigator/agenda";
import { ISOWeek } from "../src/core/model/localDate";
import type { SubtaskCardModel } from "../src/ui/navigator/rows";
import { markSubtask } from "../src/ui/navigator/subtaskActions";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { loadFixtureIndex } from "./fixtureVault";
import { makeItem } from "./support";
import { context, describeList, list } from "./navigatorSupport";

vi.mock("obsidian", () => ({}));

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const today = date("2026-10-02");
const index = loadFixtureIndex("Conformance/SubtaskVault");
const on = (extra = {}) => context(index, today, { notes: { names: { dailyFolder: "Periodic Notes/Daily Notes", weekFolder: "Periodic Notes/Weekly Notes" }, weekNotes: true, noteSubtasks: true }, ...extra });
const off = context(index, today);

const fromNotes = (model: ReturnType<typeof list>) => model.sections.find((section) => section.header?.style === "count" && section.header.title === "From notes");
const cards = (model: ReturnType<typeof list>): SubtaskCardModel[] => (fromNotes(model)?.rows ?? []) as SubtaskCardModel[];
const lineTitles = (card: SubtaskCardModel | undefined): string[] => card?.lines.map((line) => line.title) ?? [];

describe("From notes", () => {
	it("is absent while the setting is off, in every list", () => {
		for (const domain of [{ kind: "agenda" }, { kind: "loose" }, { kind: "project", path: "Ta Da/projects/Ta Da MVP.md" }, { kind: "area", path: "Ta Da/areas/Work.md" }] as const) {
			expect(fromNotes(list(domain, off))).toBeUndefined();
		}
		expect(fromNotes(list({ kind: "agenda" }, { ...off, agenda: { selection: { kind: "week", week: today.isoWeek }, monthOpen: false } }))).toBeUndefined();
	});

	it("lists a day's lines in a card per source file, after the page's tasks, overdue ones with a pill", () => {
		const model = list({ kind: "agenda" }, on());
		const section = fromNotes(model);
		expect(section?.header).toEqual({ style: "count", title: "From notes", count: 9, quiet: false });
		expect(model.sections[model.sections.length - 1]).toBe(section);
		expect(cards(model).map((card) => [card.title, card.folder])).toEqual([
			["2026-10-02", "Periodic Notes/Daily Notes"],
			["Standup", "Meetings"],
			["Syntax", "Notes"],
			["Windows", "Notes"],
		]);
		const standup = cards(model)[1];
		expect(lineTitles(standup)).toEqual(["Overdue", "Unresolved but dated", "Under a bullet"]);
		expect(standup?.lines[0]?.date).toMatchObject({ text: "30 Sep", overdue: true });
		expect(standup?.lines[1]?.date).toBeNull();
		expect(standup?.lines[1]?.parent).toBeNull();
	});

	it("leaves the pill off a line due on another day and puts the day's own lines on it", () => {
		const model = list({ kind: "agenda" }, on({ agenda: { selection: { kind: "day", date: date("2026-10-03") }, monthOpen: false } }));
		expect(cards(model).map((card) => [card.title, lineTitles(card)])).toEqual([
			["2026-10-02", ["Tomorrow"]],
			["Draft", ["Dated here"]],
			["Standup", ["Both"]],
		]);
		expect(cards(model)[0]?.lines[0]).toMatchObject({ date: null, parent: { title: "Ta Da MVP", kind: "project" } });
		expect(model.sections[0]?.message).toBeNull();
	});

	it("doesn't say nothing is scheduled when only notes have lines", () => {
		const model = list({ kind: "agenda" }, on({ agenda: { selection: { kind: "day", date: date("2026-10-04") }, monthOpen: false } }));
		expect(model.sections[0]?.message).toBeNull();
		expect(lineTitles(cards(model)[0])).toEqual(["Two dates >2026-10-02"]);
		const empty = list({ kind: "agenda" }, on({ agenda: { selection: { kind: "day", date: date("2026-10-01") }, monthOpen: false } }));
		expect(empty.sections[0]?.message).toBe("Nothing scheduled");
		expect(fromNotes(empty)).toBeUndefined();
	});

	it("lists a week's lines with their dates", () => {
		const model = list({ kind: "agenda" }, on({ agenda: { selection: { kind: "week", week: new ISOWeek(2026, 40) }, monthOpen: false } }));
		expect(model.sections[model.sections.length - 1]).toBe(fromNotes(model));
		const dated = (week: ISOWeek): string[] =>
			cards(list({ kind: "agenda" }, on({ agenda: { selection: { kind: "week", week }, monthOpen: false } }))).flatMap((card) => card.lines.map((line) => `${card.title}: ${line.title} ${line.date?.text}`));
		expect(dated(new ISOWeek(2026, 40))).toContain("Draft: Dated here Sat");
		expect(dated(new ISOWeek(2026, 40))).toContain("Syntax: at the start Today");
		expect(dated(new ISOWeek(2026, 41))).toEqual(["Standup: Doing 9 Oct", "Ta Da MVP: Own dated 9 Oct", "Ta Da MVP: Own to self and dated 9 Oct"]);
	});

	it("lists a project's lines, with the chip hidden on its own page and its own file's left out", () => {
		const model = list({ kind: "project", path: "Ta Da/projects/Ta Da MVP.md" }, on());
		expect(cards(model).map((card) => [card.title, lineTitles(card)])).toEqual([
			["2026-10-02", ["Tomorrow"]],
			["Standup", ["Both", "Parent with nest"]],
			["Syntax", ["Alias", "Folder", "Case"]],
		]);
		expect(cards(model).flatMap((card) => card.lines.map((line) => line.parent))).toEqual([null, null, null, null, null, null]);
		expect(model.empty).toBeNull();
	});

	it("lists an area's lines and shows a project's chip there", () => {
		const model = list({ kind: "area", path: "Ta Da/areas/Work.md" }, on());
		expect(cards(model).map((card) => card.title)).toEqual(["Draft", "Standup", "Syntax", "Windows"]);
		expect(cards(model)[0]?.lines[0]?.parent).toBeNull();
		expect(model.empty).toBeNull();
	});

	it("names a line's parent as a project or an area in the Agenda", () => {
		const small = new VaultIndex([
			makeItem("Ta Da/areas/Work.md", "type: area"),
			makeItem("Ta Da/projects/Plan.md", "type: project"),
			makeItem("Notes/Minutes.md", "tags: []", "- [ ] One >2026-10-02 @[[Work]]\n- [ ] Two >2026-10-02 @[[Plan]]\n"),
		]);
		const model = list({ kind: "agenda" }, { ...on(), index: small });
		expect(cards(model)[0]?.lines.map((line) => line.parent)).toEqual([
			{ title: "Work", kind: "area" },
			{ title: "Plan", kind: "project" },
		]);
	});

	it("lists a note's lines with neither a date nor a resolved parent under Loose", () => {
		const model = list({ kind: "loose" }, on());
		expect(cards(model).map((card) => [card.title, card.folder])).toEqual([
			["2026-10-02", "Periodic Notes/Daily Notes"],
			["Standup", "Meetings"],
			["Syntax", "Notes"],
			["Windows", "Notes"],
		]);
		expect(lineTitles(cards(model)[1])).toEqual(["Loose", "Unresolved"]);
		expect(model.empty).toBeNull();
		expect(describeList(model).some((line) => line.includes("# From notes"))).toBe(true);
	});

	it("is folded by the reader's fold of its header", () => {
		const model = list({ kind: "loose" }, on(), { folds: new Set(["loose|From notes"]) });
		expect(fromNotes(model)?.folded).toBe(true);
	});
});

describe("the Agenda's dots", () => {
	it("mark a dated line's day while the setting is on", () => {
		const state = agendaOn(today);
		const dots = (notes: { noteSubtasks?: boolean }): string[] =>
			buildStrip(index, state, today, { names: { dailyFolder: "Periodic Notes/Daily Notes", weekFolder: "Periodic Notes/Weekly Notes" }, weekNotes: true, ...notes }).rows[0]!.days.filter((day) => day.hasOpenTasks).map((day) => day.date.toString());
		expect(dots({ noteSubtasks: true })).toEqual(["2026-09-30", "2026-10-02", "2026-10-03", "2026-10-04"]);
		expect(dots({ noteSubtasks: false })).toEqual([]);
	});
});

describe("marking a card's line", () => {
	const text = "---\ncreatedDate: 2026-09-20\n---\n- [ ] Loose\n- [/] Doing >2026-10-09\n  - [ ] Child\n";
	const file = { path: "Meetings/Standup.md" } as never;
	const target = { lineIndex: 4, marker: "/", text: "Doing >2026-10-09" };
	const writer = (current: string) => {
		let result: string | null = null;
		return { apply: vi.fn(async (_file: unknown, edit: (text: string) => string | null) => ((result = edit(current)), result !== null)), result: () => result };
	};

	it("completes the line's box, as a click does, leaving the rest", async () => {
		const w = writer(text);
		expect(await markSubtask(w as never, file, target, "done")).toBe(true);
		expect(w.result()).toBe(text.replace("- [/] Doing", "- [x] Doing"));
	});

	it("cancels it with a dash", async () => {
		const w = writer(text);
		expect(await markSubtask(w as never, file, target, "cancelled")).toBe(true);
		expect(w.result()).toBe(text.replace("- [/] Doing", "- [-] Doing"));
	});

	it("leaves a line that moved or changed alone, its text included", async () => {
		const w = writer(text);
		expect(await markSubtask(w as never, file, { ...target, lineIndex: 3 }, "done")).toBe(false);
		expect(await markSubtask(w as never, file, { ...target, marker: " " }, "done")).toBe(false);
		expect(await markSubtask(w as never, file, { ...target, text: "Something else" }, "done")).toBe(false);
		expect(w.result()).toBeNull();
		const swapped = writer("---\n---\n- [ ] A\n- [ ] B\n");
		expect(await markSubtask(swapped as never, file, { lineIndex: 2, marker: " ", text: "B" }, "done")).toBe(false);
	});
});

describe("card details", () => {
	it("carry each line's text and whether a box is nested under it", () => {
		const model = list({ kind: "agenda" }, on());
		const syntax = cards(model).find((card) => card.title === "Windows");
		expect(syntax?.lines.map((line) => [line.text, line.hasChildren])).toEqual([["Windows >2026-10-02", true]]);
		const standup = cards(model).find((card) => card.title === "Standup");
		expect(standup?.lines.map((line) => line.hasChildren)).toEqual([false, false, false]);
	});

	it("leave out the cards of a project, an area and Loose while a tag filter is active, saying no matches", () => {
		const picked = new Set(["nothing"]);
		for (const domain of [{ kind: "project", path: "Ta Da/projects/Ta Da MVP.md" }, { kind: "area", path: "Ta Da/areas/Work.md" }, { kind: "loose" }] as const) {
			const model = list(domain, on(), { picked });
			expect(fromNotes(model), domain.kind).toBeUndefined();
			expect(model.empty, domain.kind).not.toBeNull();
		}
	});
});
