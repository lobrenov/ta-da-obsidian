import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { ISOWeek, LocalDate } from "../src/core/model/localDate";
import { type AgendaState } from "../src/ui/navigator/agenda";
import type { ListRow } from "../src/ui/navigator/rows";
import { context, describeList, list } from "./navigatorSupport";
import { makeItem } from "./support";

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const today = date("2026-10-02"); // a Friday

const index = new VaultIndex([
	makeItem("Ta Da/tasks/Daily.md", 'type: task\nstatus: Doing\ndueDate: 2026-10-02\nrepeat: every day\ntags: [home]\narea: "[[Home]]"'),
	makeItem("Ta Da/tasks/Weekly.md", "type: task\ndueDate: 2026-10-02\nrepeat: every week on Fri"),
	makeItem("Ta Da/tasks/Estimate.md", "type: task\ndueDate: 2026-10-02\nrepeat: every 3 days when done"),
	makeItem("Ta Da/tasks/Cutoff.md", "type: task\ndeadline: 2026-10-02\nrepeat: every week"),
	makeItem("Ta Da/tasks/Plain.md", "type: task\ndueDate: 2026-10-09"),
	makeItem("Ta Da/areas/Home.md", "type: area"),
]);

const agenda = (selection: AgendaState["selection"]) => context(index, today, { agenda: { selection, monthOpen: false } });
const day = (text: string) => describeList(list({ kind: "agenda" }, agenda({ kind: "day", date: date(text) })));
const week = (): ListRow[] => list({ kind: "agenda" }, agenda({ kind: "week", week: new ISOWeek(2026, 41) })).sections.flatMap((section) => section.rows);

describe("the Agenda day's Repeats group", () => {
	it("lists a daily rule's coming days under the day's tasks", () => {
		expect(day("2026-10-06")).toEqual([expect.stringMatching(/^# day /), expect.stringMatching(/^ {4}periodNote/), "# Repeats", "    occurrence | Daily | Home"]);
	});

	it("marks a when done rule's date as an estimate, and lists it with the others", () => {
		const lines = day("2026-10-05");
		expect(lines.slice(3)).toEqual(["    occurrence | Daily | Home", "    occurrence | Estimate | ≈"]);
	});

	it("lists a weekly rule only on its days, with the day's own tasks above", () => {
		const lines = day("2026-10-09");
		expect(lines).toContain("# Repeats");
		expect(lines.filter((line) => line.startsWith("    occurrence")).map((line) => line.split(" | ")[1])).toEqual(["Daily", "Weekly", "Cutoff"]);
		expect(lines.findIndex((line) => line.includes("Plain"))).toBeLessThan(lines.indexOf("# Repeats"));
	});

	it("gives a deadline occurrence a Deadline pill, after the due ones", () => {
		expect(day("2026-10-09")).toContain("    occurrence | Cutoff | Deadline");
	});

	it("is absent on the task's own day and for a day with none, which says Nothing scheduled", () => {
		expect(day("2026-10-02")).not.toContain("# Repeats");
		const quiet = new VaultIndex([makeItem("Ta Da/tasks/Once.md", "type: task\ndueDate: 2026-10-20")]);
		expect(describeList(list({ kind: "agenda" }, context(quiet, today, { agenda: { selection: { kind: "day", date: date("2026-10-06") }, monthOpen: false } })))[0]).toContain("Nothing scheduled");
	});

	it("doesn't say Nothing scheduled for a day with only repeats", () => {
		expect(day("2026-10-06")[0]).not.toContain("Nothing scheduled");
	});

	it("follows the tag filter", () => {
		const model = list({ kind: "agenda" }, agenda({ kind: "day", date: date("2026-10-06") }), { picked: new Set(["home"]) });
		expect(describeList(model).filter((line) => line.startsWith("    occurrence"))).toEqual(["    occurrence | Daily | Home"]);
		const other = list({ kind: "agenda" }, agenda({ kind: "day", date: date("2026-10-06") }), { picked: new Set(["work"]) });
		expect(describeList(other)).not.toContain("# Repeats");
	});

	it("opens the task from a row that stays out of the list's keys", () => {
		const model = list({ kind: "agenda" }, agenda({ kind: "day", date: date("2026-10-09") }));
		const rows = model.sections.find((section) => section.header?.style === "repeats")?.rows ?? [];
		expect(rows[0]).toMatchObject({ path: null, open: "Ta Da/tasks/Daily.md" });
	});

	it("words the tooltip and the spoken label", () => {
		const rows = list({ kind: "agenda" }, agenda({ kind: "day", date: date("2026-10-09") })).sections.find((section) => section.header?.style === "repeats")?.rows ?? [];
		const [daily, , cutoff] = rows;
		expect(daily).toMatchObject({ tooltip: "Repeats every day", label: "Daily, repeat, Repeats every day, Home" });
		expect(cutoff).toMatchObject({ tooltip: "Deadline · Repeats every week", label: "Cutoff, repeat, Deadline · Repeats every week" });
		const estimate = list({ kind: "agenda" }, agenda({ kind: "day", date: date("2026-10-05") })).sections.flatMap((section) => section.rows).find((row) => row.type === "occurrence" && row.title === "Estimate");
		expect(estimate).toMatchObject({ tooltip: "Estimated, if done on its due date · Repeats every 3 days when done" });
	});
});

describe("the Agenda week's day rows", () => {
	const days = () => week().filter((row) => row.type === "day");

	it("count the repeating tasks beside what's due, once each", () => {
		const summaries = days().map((row) => row.type === "day" && row.summary);
		expect(summaries).toEqual(["2 repeats", "1 repeat", "1 repeat", "2 repeats", "1 due · 3 repeats", "1 repeat", "2 repeats"]);
	});

	it("name the first repeat when nothing is due and the note has no summary", () => {
		const rows = days();
		expect(rows[0]).toMatchObject({ firstRepeat: "Daily" });
		expect(rows[4]).toMatchObject({ firstRepeat: null });
	});

	it("leave the day alone when there are no repeats", () => {
		const bare = new VaultIndex([makeItem("Ta Da/tasks/Once.md", "type: task\ndueDate: 2026-10-06")]);
		const model = list({ kind: "agenda" }, context(bare, today, { agenda: { selection: { kind: "week", week: new ISOWeek(2026, 41) }, monthOpen: false } }));
		expect(model.sections.flatMap((section) => section.rows).filter((row) => row.type === "day").map((row) => row.type === "day" && row.summary)).toEqual(["", "1 due", "", "", "", "", ""]);
	});
});
