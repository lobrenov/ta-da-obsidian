import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { LocalDate } from "../src/core/model/localDate";
import { parseItem } from "../src/core/parsing/parseItem";
import { splitFrontmatter } from "../src/core/parsing/frontmatterSplitter";
import { readProperties } from "../src/core/parsing/propertyReader";
import { readTag, type Tag } from "../src/core/model/tag";
import { linkTitle } from "../src/core/model/wikiLink";
import { clearProperty, insertAtTop, setProperty } from "../src/core/writing/frontmatterEditor";
import { addTag, removeTag } from "../src/core/writing/tagEditor";
import { changedLines } from "./changedLines";

const date = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;
const text = (value: string) => ({ kind: "text", value }) as const;

const file = `---
type: task
# a comment
status: Not Started
statusNote: keep me
contexts:
  - "@computer"
  - "@home"
dueDate:   2026-10-02   
nested:
  status: untouched
custom: [1, 2]
---
Body with status: Done`;

describe("FrontmatterEditor", () => {
	it("set replaces only the key's line", () => {
		expect(changedLines(file, setProperty("status", text("Done"), file))).toEqual([["status: Not Started"], ["status: Done"]]);
	});

	it("set replaces a multi-line value", () => {
		const after = setProperty("contexts", { kind: "list", items: ["@phone"] }, file);
		expect(changedLines(file, after)).toEqual([['  - "@computer"', '  - "@home"'], ['  - "@phone"']]);
		const empty = setProperty("contexts", { kind: "list", items: [] }, file);
		expect(changedLines(file, empty)).toEqual([["contexts:", '  - "@computer"', '  - "@home"'], ["contexts: []"]]);
	});

	it("set replaces flow and unindented lists", () => {
		const flow = '---\ncontexts: ["@a"]\ntype: task\n---\n';
		expect(setProperty("contexts", { kind: "list", items: ["@b", "@c"] }, flow)).toBe(
			'---\ncontexts:\n  - "@b"\n  - "@c"\ntype: task\n---\n',
		);
		const unindented = '---\ncontexts:\n- "@a"\n-\ntype: task\n---\n';
		expect(setProperty("contexts", { kind: "list", items: ["@b"] }, unindented)).toBe('---\ncontexts:\n  - "@b"\ntype: task\n---\n');
	});

	it("set matches whole unindented keys only", () => {
		const after = setProperty("due", { kind: "date", value: date("2026-11-01") }, file);
		expect(changedLines(file, after)).toEqual([[], ["due: 2026-11-01"]]);
		expect(after).toContain("dueDate:   2026-10-02   \n");
		expect(after).toContain("  status: untouched\n");
		expect(after).toContain("Body with status: Done");
	});

	it("set appends a missing key before the closing fence", () => {
		const after = setProperty("deadline", { kind: "date", value: date("2026-10-06") }, file);
		expect(changedLines(file, after)).toEqual([[], ["deadline: 2026-10-06"]]);
		expect(after).toContain("custom: [1, 2]\ndeadline: 2026-10-06\n---\n");
	});

	it("set handles empty frontmatter and a fence at the end of the file", () => {
		expect(setProperty("type", text("task"), "---\n---\nBody")).toBe("---\ntype: task\n---\nBody");
		expect(setProperty("status", text("Done"), "---\ntype: task\n---")).toBe("---\ntype: task\nstatus: Done\n---");
	});

	it("set creates frontmatter when there is none", () => {
		expect(setProperty("type", text("task"), "Just a body\n")).toBe("---\ntype: task\n---\nJust a body\n");
		expect(setProperty("type", text("task"), "")).toBe("---\ntype: task\n---\n");
		expect(setProperty("type", text("task"), "Body\r\nMore\r\n")).toBe("---\r\ntype: task\r\n---\r\nBody\r\nMore\r\n");
		// An unclosed fence isn't frontmatter, so a new block goes above it.
		expect(setProperty("type", text("task"), "---\nnot closed\n")).toBe("---\ntype: task\n---\n---\nnot closed\n");
	});

	it("set keeps CRLF", () => {
		const crlf = '---\r\ntype: task\r\nstatus: Doing\r\ncontexts:\r\n  - "@a"\r\n---\r\nBody\r\n';
		expect(setProperty("status", text("Done"), crlf)).toBe('---\r\ntype: task\r\nstatus: Done\r\ncontexts:\r\n  - "@a"\r\n---\r\nBody\r\n');
		expect(setProperty("contexts", { kind: "list", items: ["@b", "@c"] }, crlf)).toBe(
			'---\r\ntype: task\r\nstatus: Doing\r\ncontexts:\r\n  - "@b"\r\n  - "@c"\r\n---\r\nBody\r\n',
		);
		expect(setProperty("area", text("Work"), crlf)).toBe(
			'---\r\ntype: task\r\nstatus: Doing\r\ncontexts:\r\n  - "@a"\r\narea: Work\r\n---\r\nBody\r\n',
		);
	});

	it("insertAtTop puts keys after the opening fence, or creates the block", () => {
		const keys = [
			{ key: "type", value: text("task") },
			{ key: "status", value: text("Not Started") },
		];
		expect(insertAtTop(keys, "---\r\nfoo: bar\r\n---\r\n")).toBe("---\r\ntype: task\r\nstatus: Not Started\r\nfoo: bar\r\n---\r\n");
		expect(insertAtTop(keys, "Body\n")).toBe("---\ntype: task\nstatus: Not Started\n---\nBody\n");
	});

	it("clear empties an existing key only", () => {
		const after = clearProperty("contexts", file);
		expect(changedLines(file, after)).toEqual([['  - "@computer"', '  - "@home"'], []]);
		expect(clearProperty("deadline", file)).toBe(file);
		expect(clearProperty("type", "No frontmatter")).toBe("No frontmatter");
		expect(clearProperty("dueDate", "---\r\ndueDate: 2026-10-02\r\n---\r\n")).toBe("---\r\ndueDate:\r\n---\r\n");
	});

	it("writes values by the writing rules", () => {
		const base = "---\ntype: task\n---\n";
		expect(setProperty("project", { kind: "link", title: "Ta Da MVP" }, base)).toContain('project: "[[Ta Da MVP]]"\n');
		expect(setProperty("dueDate", { kind: "date", value: date("2026-01-05") }, base)).toContain("dueDate: 2026-01-05\n");
		expect(setProperty("status", text("Not Started"), base)).toContain("status: Not Started\n");
		expect(setProperty("area", text("yes"), base)).toContain('area: "yes"\n');
	});

	it.each([
		"Personal", "Weekly · Fri", "Dan’s", "yes", "No", "null", "~", "2026", "2026-10-02", "@home", "#tag", "-dash",
		"a: b", "a #b", "ends:", " padded ", 'quote"d', "it's", "back\\slash", "tab\there", "line\nbreak", "[x]", "{y}", "*star", "!bang", "Café ☕️",
	])("reads text value %j back unchanged", (value) => {
		const written = setProperty("repeat", text(value), "---\ntype: task\nstatus: Doing\n---\n");
		const read = readProperties(splitFrontmatter(written).yaml as string);
		expect(read?.properties.repeatRule).toBe(value);
		expect(read?.warnings).toEqual([]);
	});

	it("reads list and link values back unchanged", () => {
		let written = "---\ntype: task\nstatus: Doing\n---\n";
		written = setProperty("contexts", { kind: "list", items: ["@computer", 'a "q"', "Café"] }, written);
		written = setProperty("project", { kind: "link", title: "Game Jam - Starfall" }, written);
		const yaml = splitFrontmatter(written).yaml as string;
		expect((parse(yaml) as { contexts: string[] }).contexts).toEqual(["@computer", 'a "q"', "Café"]);
		const project = readProperties(yaml)?.properties.project;
		expect(project && linkTitle(project)).toBe("Game Jam - Starfall");
	});
});

describe("TagEditor", () => {
	const tag = (name: string): Tag => readTag(name) as Tag;
	const tagNames = (written: string): string[] => (parseItem(written, "t.md")?.properties.tags ?? []).map((entry) => entry.name);

	it("addTag inserts a missing key after createdDate", () => {
		const input = "---\ntype: task\nstatus: Doing\ncreatedDate: 2026-10-01\ndueDate: 2026-10-02\n---\nBody #inline\n";
		expect(addTag(tag("errands"), input)).toBe(
			"---\ntype: task\nstatus: Doing\ncreatedDate: 2026-10-01\ntags: [errands]\ndueDate: 2026-10-02\n---\nBody #inline\n",
		);
		expect(addTag(tag("quick win"), "---\r\ntype: area\r\n---\r\n")).toBe("---\r\ntype: area\r\ntags: [quick win]\r\n---\r\n");
		expect(addTag(tag("a"), "No frontmatter #a\n")).toBe("No frontmatter #a\n");
	});

	it("addTag keeps a flow list", () => {
		const input = '---\ntype: task\nstatus: Doing\ntags: [Errands, "#home/garden"] # keep\n---\n';
		const after = addTag(tag("people/Max"), input);
		expect(changedLines(input, after)).toEqual([
			['tags: [Errands, "#home/garden"] # keep'],
			['tags: [Errands, "#home/garden", people/Max] # keep'],
		]);
		expect(addTag(tag("errands"), input)).toBe(input);
		expect(addTag(tag("HOME/GARDEN"), input)).toBe(input);
		const multiLine = "---\ntype: task\ntags: [a,\n  b]\n---\n";
		expect(addTag(tag("c"), multiLine)).toBe("---\ntype: task\ntags: [a, b, c]\n---\n");
		expect(tagNames(addTag(tag("x, y"), input))).toEqual(["Errands", "home/garden", "x, y"]);
	});

	it("addTag keeps a block list", () => {
		const input = '---\ntype: task\ntags:\n  - errands\n  # a comment\n  - "quick win"\nstatus: Doing\n---\n';
		expect(addTag(tag("home/garden"), input)).toBe(
			'---\ntype: task\ntags:\n  - errands\n  # a comment\n  - "quick win"\n  - home/garden\nstatus: Doing\n---\n',
		);
		const unindented = "---\r\ntype: task\r\ntags:\r\n- errands\r\n---\r\n";
		expect(addTag(tag("2026"), unindented)).toBe('---\r\ntype: task\r\ntags:\r\n- errands\r\n- "2026"\r\n---\r\n');
		expect(addTag(tag("Quick Win"), input)).toBe(input);
	});

	it("addTag turns an empty key or a string into a flow list", () => {
		expect(addTag(tag("a"), "---\ntype: task\ntags: # none yet\n---\n")).toBe("---\ntype: task\ntags: [a] # none yet\n---\n");
		expect(addTag(tag("c"), "---\ntype: task\ntags: a, b # old\n---\n")).toBe("---\ntype: task\ntags: [a, b, c] # old\n---\n");
		for (const empty of ["tags:", "tags: []", "tags: ~"]) {
			expect(addTag(tag("a"), `---\ntype: task\n${empty}\n---\n`)).toBe("---\ntype: task\ntags: [a]\n---\n");
		}
		expect(addTag(tag("c"), "---\ntype: task\ntags: a, b\n---\n")).toBe("---\ntype: task\ntags: [a, b, c]\n---\n");
		expect(addTag(tag("c"), '---\ntype: task\ntags: "a, #b"\n---\n')).toBe('---\ntype: task\ntags: [a, "#b", c]\n---\n');
		expect(addTag(tag("B"), '---\ntype: task\ntags: "a, #b"\n---\n')).toBe('---\ntype: task\ntags: "a, #b"\n---\n');
	});

	it("removeTag keeps the list's style", () => {
		const flow = "---\ntype: task\ntags: [Errands, \"#home/garden\", 'quick win']\n---\nBody #errands\n";
		expect(removeTag(tag("home/garden"), flow)).toBe("---\ntype: task\ntags: [Errands, 'quick win']\n---\nBody #errands\n");
		const block = '---\ntype: task\ntags:\n  - errands\n  - "#Home/Garden"\n  - quick win\nstatus: Doing\n---\n';
		expect(removeTag(tag("home/garden"), block)).toBe("---\ntype: task\ntags:\n  - errands\n  - quick win\nstatus: Doing\n---\n");
		expect(removeTag(tag("b"), "---\ntype: task\ntags: a, b\n---\n")).toBe("---\ntype: task\ntags: [a]\n---\n");
	});

	it("removing the last tag leaves an empty key", () => {
		expect(removeTag(tag("a"), "---\ntype: task\ntags: [a]\n---\n")).toBe("---\ntype: task\ntags:\n---\n");
		expect(removeTag(tag("a"), "---\r\ntype: task\r\ntags:\r\n  - A\r\nstatus: Doing\r\n---\r\n")).toBe(
			"---\r\ntype: task\r\ntags:\r\nstatus: Doing\r\n---\r\n",
		);
		expect(removeTag(tag("a"), "---\ntype: task\ntags: a\n---\n")).toBe("---\ntype: task\ntags:\n---\n");
		expect(tagNames("---\ntype: task\nstatus: Doing\ntags:\n---\n")).toEqual([]);
	});

	it("removeTag leaves other text alone", () => {
		const input = "---\ntype: task\ntags: [a]\n---\n#b in the body\n";
		expect(removeTag(tag("b"), input)).toBe(input);
		expect(removeTag(tag("a"), "---\ntype: task\n---\n")).toBe("---\ntype: task\n---\n");
		expect(removeTag(tag("a"), "#a only")).toBe("#a only");
	});

	it.each(["errands", "quick win", "home/garden", "2026", "-dash", "yes", "a: b", "x, y", "[x]", "Café ☕️", "#hash"])(
		"reads added and removed tag %j back",
		(name) => {
			const added = tag(name);
			for (const list of ["tags: [first]", "tags:\n  - first", "tags: first", ""]) {
				const input = `---\ntype: task\nstatus: Doing\ncreatedDate: 2026-10-01\n${list}\n---\n`;
				const after = addTag(added, input);
				const expected = list === "" ? [added.name] : ["first", added.name];
				expect(tagNames(after), list).toEqual(expected);
				expect(tagNames(removeTag(added, after)), list).toEqual(expected.slice(0, -1));
			}
		},
	);

	it("leaves values it can't splice alone", () => {
		for (const value of ["tags: [a, # first\n  b]", "tags: [a,\n  # note\n  b]", "tags: a,\n  b", "tags: >-\n  a, b", "tags: |\n  a"]) {
			const input = `---\ntype: task\nstatus: Doing\n${value}\n---\n`;
			expect(addTag(tag("c"), input), value).toBe(input);
			expect(removeTag(tag("a"), input), value).toBe(input);
		}
	});

	it("reaches block items past blank lines", () => {
		const input = "---\ntype: task\ntags: # mine\n  - a\n\n  - b\n\nstatus: Doing\n---\n";
		expect(tagNames(input)).toEqual(["a", "b"]);
		const removed = removeTag(tag("b"), input);
		expect(removed).toBe("---\ntype: task\ntags: # mine\n  - a\n\n\nstatus: Doing\n---\n");
		expect(removeTag(tag("a"), removed)).toBe("---\ntype: task\ntags: # mine\n\n\nstatus: Doing\n---\n");
		expect(addTag(tag("b"), input)).toBe(input);
		expect(addTag(tag("c"), input)).toBe("---\ntype: task\ntags: # mine\n  - a\n\n  - b\n  - c\n\nstatus: Doing\n---\n");
	});
});
