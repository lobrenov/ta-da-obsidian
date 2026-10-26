import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dayMarks, occurrences } from "../src/core/index/queries";
import { LocalDate } from "../src/core/model/localDate";
import { RepeatRule } from "../src/core/model/repeatRule";
import { nextDates } from "../src/core/model/repeatRuleNext";
import { loadFixtureIndex } from "./fixtureVault";
import { taDaRepo } from "./taDaRepo";

interface RecurrenceExport {
	today: string;
	rules: { input: string; rule: unknown; phrase: string | null }[];
	next: { phrase: string; dueDate: string | null; deadline: string | null; completedDate: string | null; rolloverDay: string; expected: unknown }[];
	vault: string;
	occurrences: { path: string; from: string; through: string; occurrences: unknown[] }[];
	dayMarks: { from: string; through: string; marks: unknown[] };
}

const file = resolve(taDaRepo, "Packages/TaDaCore/Tests/TaDaCoreTests/Fixtures/Conformance/recurrence.json");
const fixture = JSON.parse(readFileSync(file, "utf8")) as RecurrenceExport;
const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const optional = (text: string | null): LocalDate | null => (text === null ? null : date(text));
const text = (value: LocalDate | null): string | null => (value === null ? null : value.toString());
const today = date(fixture.today);
const index = loadFixtureIndex(`Conformance/${fixture.vault}`);

const ruleJson = (rule: RepeatRule | null): unknown =>
	rule && {
		frequency: rule.frequency,
		interval: rule.interval,
		weekdays: rule.weekdays,
		monthDay: rule.monthDay,
		yearDate: rule.yearDate,
		until: text(rule.until),
		whenDone: rule.whenDone,
	};

describe("recurrence: rules", () => {
	it.each(fixture.rules.map((entry) => [entry.input, entry] as const))("%j", (_, { input, rule, phrase }) => {
		const parsed = RepeatRule.parse(input);
		expect(ruleJson(parsed)).toEqual(rule);
		expect(parsed?.phrase ?? null).toEqual(phrase);
	});
});

describe("recurrence: next", () => {
	it.each(fixture.next.map((entry, at) => [`${at}: ${entry.phrase}`, entry] as const))("%s", (_, c) => {
		const next = nextDates(RepeatRule.parse(c.phrase) as RepeatRule, optional(c.dueDate), optional(c.deadline), optional(c.completedDate), date(c.rolloverDay));
		expect(next && { dueDate: text(next.dueDate), deadline: text(next.deadline) }).toEqual(c.expected);
	});
});

describe("recurrence: occurrences", () => {
	it.each(fixture.occurrences.map((entry) => [`${entry.path} ${entry.from}…${entry.through}`, entry] as const))("%s", (_, c) => {
		const item = index.get(c.path);
		expect(item, c.path).toBeDefined();
		const found = occurrences(index, item!, date(c.from), date(c.through), today);
		expect(found.map((entry) => ({ date: entry.date.toString(), kind: entry.kind, estimated: entry.estimated }))).toEqual(c.occurrences);
	});
});

describe("recurrence: dayMarks", () => {
	it("marks occurrences", () => {
		const marks = dayMarks(index, date(fixture.dayMarks.from), date(fixture.dayMarks.through), today);
		const actual = [...marks.keys()].sort().map((key) => ({ date: key, ...marks.get(key) }));
		expect(actual).toEqual(fixture.dayMarks.marks);
	});
});
