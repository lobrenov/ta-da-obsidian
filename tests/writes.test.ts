import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalDate } from "../src/core/model/localDate";
import { readTag, type Tag } from "../src/core/model/tag";
import { type Status } from "../src/core/model/status";
import { parseItem } from "../src/core/parsing/parseItem";
import * as checklist from "../src/core/writing/checklistEditor";
import * as completion from "../src/core/writing/completion";
import { type DayOrder, parseDatePhrase } from "../src/core/writing/datePhrase";
import * as fileNaming from "../src/core/writing/fileNaming";
import * as frontmatter from "../src/core/writing/frontmatterEditor";
import * as newFile from "../src/core/writing/newFile";
import { type Parent, setParent } from "../src/core/writing/parent";
import * as tagEditor from "../src/core/writing/tagEditor";
import { taDaRepo } from "./taDaRepo";

const writesPath = resolve(taDaRepo, "Packages/TaDaCore/Tests/TaDaCoreTests/Fixtures/Conformance/writes.json");

interface WriteCase {
	name: string;
	op: string;
	args: Record<string, unknown>;
	input: string | null;
	expected: string | null;
}

interface WritesExport {
	today: string;
	cases: WriteCase[];
}

interface JsonValue {
	kind: "text" | "date" | "link" | "list";
	value: string | string[];
}

function propertyValue({ kind, value }: JsonValue): frontmatter.PropertyValue {
	switch (kind) {
		case "text":
			return { kind, value: value as string };
		case "date":
			return { kind, value: LocalDate.parse(value as string) as LocalDate };
		case "link":
			return { kind, title: value as string };
		case "list":
			return { kind, items: value as string[] };
	}
}

const tagList = (names: unknown): Tag[] => (names as string[]).flatMap((name) => readTag(name) ?? []);
const nullable = (value: unknown): string | null => (value === null ? null : (value as string));

function run(testCase: WriteCase, today: LocalDate): string | null {
	const { op, args } = testCase;
	const input = testCase.input as string;
	switch (op) {
		case "Completion.setStatus":
			return completion.setStatus(args.status as Status, input, today);
		case "Completion.toggle":
			return completion.toggle(args.current as Status, input, today);
		case "ChecklistEditor.setMarker":
		case "ChecklistEditor.click": {
			const box = parseItem(input, "Inbox.md")?.checkboxes.find((entry) => entry.lineIndex === args.lineIndex);
			if (!box) return null;
			return op === "ChecklistEditor.click" ? checklist.click(box, input) : checklist.setMarker(args.marker as string, box, input);
		}
		case "TagEditor.addTag":
			return tagEditor.addTag(readTag(args.tag as string) as Tag, input);
		case "TagEditor.removeTag":
			return tagEditor.removeTag(readTag(args.tag as string) as Tag, input);
		case "Parent.set":
			return setParent(args.parent as Parent | null, input);
		case "FrontmatterEditor.set":
			return frontmatter.setProperty(args.key as string, propertyValue(args.value as JsonValue), input);
		case "FrontmatterEditor.clear":
			return frontmatter.clearProperty(args.key as string, input);
		case "FrontmatterEditor.insertAtTop": {
			const keys = (args.keys as { key: string; value: JsonValue }[]).map(({ key, value }) => ({ key, value: propertyValue(value) }));
			return frontmatter.insertAtTop(keys, input);
		}
		case "NewFile.task":
			return newFile.newTask({ project: nullable(args.project), area: nullable(args.area), tags: tagList(args.tags), today });
		case "NewFile.project":
			return newFile.newProject({ area: nullable(args.area), tags: tagList(args.tags), today });
		case "NewFile.area":
			return newFile.newArea({ tags: tagList(args.tags), today });
		case "NewFile.note":
			return newFile.newNote({ tags: tagList(args.tags), today });
		case "FileNaming.sanitise":
			return fileNaming.sanitise(args.title as string);
		case "FileNaming.filename":
			return fileNaming.filename(args.title as string, args.existing as string[]);
		case "DatePhrase.parse":
			return (
				parseDatePhrase(args.phrase as string, today, args.order as DayOrder, args.firstWeekday as number)?.toString() ?? null
			);
		default:
			throw new Error(`Unknown op ${op}`);
	}
}

function load(): WritesExport | null {
	try {
		return JSON.parse(readFileSync(writesPath, "utf8")) as WritesExport;
	} catch {
		return null;
	}
}

const exported = load();

describe("writes", () => {
	if (exported === null) {
		it("has writes.json", () => {
			throw new Error(`Missing ${writesPath}; run ConformanceExportTests in the Ta Da repo`);
		});
		return;
	}
	const today = LocalDate.parse(exported.today) as LocalDate;

	it("has unique case names", () => {
		const names = exported.cases.map((testCase) => testCase.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it.each(exported.cases.map((testCase) => [testCase.name, testCase] as const))("%s", (_name, testCase) => {
		expect(run(testCase, today)).toBe(testCase.expected);
	});
});
