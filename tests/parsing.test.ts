import { describe, expect, it } from "vitest";
import { subtasks } from "../src/core/model/item";
import { linkTitle } from "../src/core/model/wikiLink";
import { scanBody } from "../src/core/parsing/bodyScanner";
import { splitFrontmatter } from "../src/core/parsing/frontmatterSplitter";
import { parseItem } from "../src/core/parsing/parseItem";
import { readNoteProperties, readProperties } from "../src/core/parsing/propertyReader";

const read = (yaml: string): NonNullable<ReturnType<typeof readProperties>> => {
	const result = readProperties(yaml);
	if (!result) throw new Error(`Not a Ta Da file: ${yaml}`);
	return result;
};

describe("frontmatter splitter", () => {
	it("separates frontmatter from body", () => {
		const split = splitFrontmatter("---\ntype: task\nstatus: Doing\n---\nBody line\n");
		expect(split.yaml).toBe("type: task\nstatus: Doing\n");
		expect(split.block).toBe("---\ntype: task\nstatus: Doing\n---\n");
		expect(split.body).toBe("Body line\n");
		expect(split.bodyFirstLineIndex).toBe(4);
	});

	it.each([
		"---\ntype: task\n---\nBody\n",
		"---\r\ntype: task\r\n---\r\n\r\nBody\r\n",
		"---  \ntype: task\n--- \t\nBody",
		"---\n---\n",
		"---\ntype: task\n---",
		"No frontmatter\n---\ntype: task\n---\n",
		"---\ntype: task\nnever closed\n",
		"",
		"--- \u{1F600}\n",
	])("keeps every byte of %j", (text) => {
		const split = splitFrontmatter(text);
		expect(split.block + split.body).toBe(text);
	});

	it("handles CRLF", () => {
		const split = splitFrontmatter("---\r\ntype: task\r\n---\r\nBody\r\n");
		expect(split.yaml).toBe("type: task\r\n");
		expect(split.body).toBe("Body\r\n");
		expect(split.bodyFirstLineIndex).toBe(3);
	});

	it("allows empty frontmatter and body", () => {
		const empty = splitFrontmatter("---\n---\n");
		expect([empty.yaml, empty.body, empty.bodyFirstLineIndex]).toEqual(["", "", 2]);
		const noNewline = splitFrontmatter("---\ntype: task\n---");
		expect([noNewline.yaml, noNewline.body]).toEqual(["type: task\n", ""]);
	});

	it("needs a fence on the first line and a closing fence", () => {
		for (const text of ["\n---\ntype: task\n---\n", "Title\n---\ntype: task\n---\n", "---\ntype: task\n", " ---\ntype: task\n---\n", "----\ntype: task\n----\n"]) {
			const split = splitFrontmatter(text);
			expect([split.yaml, split.body, split.bodyFirstLineIndex]).toEqual([null, text, 0]);
		}
	});

	it("stops at the first closing fence", () => {
		const split = splitFrontmatter("---\ntype: task\n---\nBody\n\n---\n\nMore\n");
		expect(split.yaml).toBe("type: task\n");
		expect(split.body).toBe("Body\n\n---\n\nMore\n");
	});
});

describe("property reader", () => {
	it("reads every property", () => {
		const { properties: p, warnings } = read(
			'type: task\nstatus: Doing\nproject: "[[Ta Da MVP]]"\ncreatedDate: 2026-09-28\ncompletedDate: 2026-10-01\n' +
				'dueDate: 2026-10-02\ndeadline: "2026-10-06"\nrepeat: Weekly · Fri\ncustom: kept but not read\n',
		);
		expect(p.kind).toBe("task");
		expect(p.status).toBe("Doing");
		expect(p.project?.target).toBe("Ta Da MVP");
		expect(String(p.createdDate)).toBe("2026-09-28");
		expect(String(p.completedDate)).toBe("2026-10-01");
		expect(String(p.dueDate)).toBe("2026-10-02");
		expect(String(p.deadline)).toBe("2026-10-06");
		expect(p.repeatRule?.text).toBe("Weekly · Fri");
		expect(warnings).toEqual([{ case: "invalidRepeat", value: "Weekly · Fri" }]);
	});

	it("reads an area as a link or a title", () => {
		const link = read('type: project\nstatus: Doing\narea: "[[Personal]]"\n');
		expect(link.properties.area && linkTitle(link.properties.area)).toBe("Personal");
		expect(link.warnings).toEqual([]);
		const plain = read("type: task\nstatus: Doing\narea: Personal\n");
		expect(plain.properties.area && linkTitle(plain.properties.area)).toBe("Personal");
		expect(plain.warnings).toEqual([]);
	});

	it("ignores the area when a task has a project", () => {
		const both = read('type: task\nstatus: Doing\narea: Personal\nproject: "[[Ta Da MVP]]"\n');
		expect(both.properties.area).toBeNull();
		expect(both.properties.project && linkTitle(both.properties.project)).toBe("Ta Da MVP");
		expect(both.warnings).toEqual([{ case: "areaIgnored", value: "Personal" }]);
		const empty = read("type: task\nstatus: Doing\narea: Personal\nproject:\n");
		expect(empty.properties.area && linkTitle(empty.properties.area)).toBe("Personal");
		expect(empty.warnings).toEqual([]);
	});

	it("reads areas without status, area or project", () => {
		const { properties, warnings } = read('type: area\ncreatedDate: 2026-10-09\narea: "[[Other]]"\nproject: "[[P]]"\n');
		expect(properties.kind).toBe("area");
		expect(String(properties.createdDate)).toBe("2026-10-09");
		expect([properties.area, properties.project]).toEqual([null, null]);
		expect(warnings).toEqual([]);
	});

	it("ignores contexts", () => {
		expect(read('type: task\nstatus: Doing\ncontexts:\n  - "@ok"\n  - {nested: map}\n').warnings).toEqual([]);
	});

	it("treats empty and null as missing", () => {
		const { properties: p, warnings } = read('type: project\nstatus: Doing\narea:\ndueDate: ~\ndeadline: null\nrepeat: ""\ncompletedDate:\n');
		expect([p.area, p.dueDate, p.deadline, p.repeatRule, p.completedDate]).toEqual([null, null, null, null, null]);
		expect(warnings).toEqual([]);
	});

	it("keeps values as written", () => {
		const { properties } = read("type: task\nstatus: Doing\narea: yes\nrepeat: 2026\n");
		expect(properties.area && linkTitle(properties.area)).toBe("yes");
		expect(properties.repeatRule?.text).toBe("2026");
	});

	it("matches the type case-insensitively", () => {
		expect(readProperties("type: Project\nstatus: Doing\n")?.properties.kind).toBe("project");
		expect(readProperties("type: AREA\n")?.properties.kind).toBe("area");
	});

	it.each(["", "# only a comment\n", "status: Doing\n", "type: note\n", "type:\n", "- type: task\n", "just text\n", "type: [task]\n"])(
		"ignores non-Ta Da frontmatter %j",
		(yaml) => {
			expect(readProperties(yaml)).toBeNull();
		},
	);

	it("defaults and warns on a bad status", () => {
		const missing = read("type: task\n");
		expect([missing.properties.status, missing.warnings]).toEqual(["Not Started", [{ case: "missingStatus" }]]);
		const unknown = read("type: task\nstatus: Someday\n");
		expect([unknown.properties.status, unknown.warnings]).toEqual(["Not Started", [{ case: "unknownStatus", value: "Someday" }]]);
		const caseless = read("type: task\nstatus: not started\n");
		expect([caseless.properties.status, caseless.warnings]).toEqual(["Not Started", []]);
	});

	it("warns on invalid values", () => {
		const { properties: p, warnings } = read("type: task\nstatus: Doing\ndueDate: 2026-02-30\ndeadline: tomorrow\nproject: Ta Da MVP\narea: [a, b]\n");
		expect([p.dueDate, p.deadline, p.project, p.area]).toEqual([null, null, null, null]);
		expect(warnings).toHaveLength(4);
		expect(warnings).toEqual(
			expect.arrayContaining([
				{ case: "invalidProject", value: "Ta Da MVP" },
				{ case: "unexpectedValue", key: "area" },
				{ case: "invalidDate", key: "dueDate", value: "2026-02-30" },
				{ case: "invalidDate", key: "deadline", value: "tomorrow" },
			]),
		);
	});

	it("warns on an unquoted project link", () => {
		const result = read("type: task\nstatus: Doing\nproject: [[Ta Da MVP]]\n");
		expect(result.properties.project).toBeNull();
		expect(result.warnings).toEqual([{ case: "unexpectedValue", key: "project" }]);
	});

	it("ignores a project on projects", () => {
		const result = read('type: project\nstatus: Doing\nproject: "[[Other]]"\n');
		expect(result.properties.project).toBeNull();
		expect(result.warnings).toEqual([]);
	});

	it("falls back to the type line on invalid YAML", () => {
		// `@` can't start a plain YAML scalar, so an unquoted context breaks the whole block.
		const result = read("type: task\nstatus: Done\ncontexts:\n  - @computer\n");
		expect(result.properties.kind).toBe("task");
		expect(result.properties.status).toBe("Not Started");
		expect(result.warnings).toEqual([{ case: "invalidYAML", problem: "found character that cannot start any token", line: 5 }]);

		expect(readProperties('type: "project"\r\nstatus: [unclosed\r\n')?.properties.kind).toBe("project");
		expect(readProperties("title: x\nstatus: [unclosed\n")).toBeNull();
		expect(readProperties("  type: task\nstatus: [unclosed\n")).toBeNull();
	});

	it("warns on duplicate keys", () => {
		const result = read("type: task\nstatus: Doing\nstatus: Done\n");
		expect(result.warnings).toEqual([
			{
				case: "invalidYAML",
				problem:
					"Parser: expected all keys to be unique but found the following duplicated key(s): 'status'.\nContext:\ntype: task\nstatus: Doing\nstatus: Done\n in line 2, column 1\n",
				line: null,
			},
		]);
	});

	it("reports an unclosed flow list on the line libyaml marks", () => {
		expect(readNoteProperties("tags: [a\n").warnings).toEqual([{ case: "invalidYAML", problem: "did not find expected ',' or ']'", line: 3 }]);
	});

	it("handles CRLF and Unicode", () => {
		const area = read("type: project\r\nstatus: Doing\r\narea: Café ☕️\r\n");
		expect(area.properties.area && linkTitle(area.properties.area)).toBe("Café ☕️");
		expect(area.warnings).toEqual([]);
		const result = read('type: task\r\nstatus: Doing\r\nproject: "[[Dan’s site]]"\r\ndueDate: 2026-10-02\r\n');
		expect(result.properties.project && linkTitle(result.properties.project)).toBe("Dan’s site");
		expect(String(result.properties.dueDate)).toBe("2026-10-02");
		expect(result.warnings).toEqual([]);
	});

	it.each([
		["tags: [a, b c]", ["a", "b c"]],
		['tags:\n  - "#errands"', ["errands"]],
		['tags:\n  - errands\n  - Home/Garden/\n  - ""\n  - [nested]', ["errands", "Home/Garden"]],
		['tags: "errands, quick win, #home/garden"', ["errands", "quick win", "home/garden"]],
		["tags: errands, #comment", ["errands"]],
		["tags: errands", ["errands"]],
		['tags: [Errands, errands, "#errands"]', ["Errands"]],
		["tags:", []],
		["tags: []", []],
		["tags: ~", []],
		["tags: 2026", ["2026"]],
	] as const)("reads tags from %j", (yaml, tags) => {
		const result = read(`type: task\nstatus: Doing\n${yaml}\n`);
		expect(result.properties.tags.map((tag) => tag.name)).toEqual(tags);
		expect(result.warnings).toEqual([]);
	});

	it("warns on a tags mapping", () => {
		const result = read("type: area\ntags:\n  a: b\n");
		expect(result.properties.tags).toEqual([]);
		expect(result.warnings).toEqual([{ case: "unexpectedValue", key: "tags" }]);
	});

	it("reads createdDate and tags only from a note", () => {
		const result = readNoteProperties("createdDate: 2026-10-04\ntags: [a, b]\nstatus: Done\ncustom: kept\n");
		expect(result.properties.kind).toBe("note");
		expect(String(result.properties.createdDate)).toBe("2026-10-04");
		expect(result.properties.tags.map((tag) => tag.name)).toEqual(["a", "b"]);
		expect(result.properties.status).toBe("Not Started");
		expect(result.warnings).toEqual([]);
	});

	it("reads nothing from missing or non-mapping note YAML", () => {
		for (const yaml of [null, "", "- a\n- b\n", "just text\n"]) {
			const result = readNoteProperties(yaml);
			expect(result.properties.kind).toBe("note");
			expect(result.properties.createdDate).toBeNull();
			expect(result.properties.tags).toEqual([]);
			expect(result.warnings).toEqual([]);
		}
	});

	it("warns on invalid note YAML and bad dates", () => {
		expect(readNoteProperties("tags: [a\n").warnings).toHaveLength(1);
		expect(readNoteProperties("createdDate: soon\n").warnings).toEqual([{ case: "invalidDate", key: "createdDate", value: "soon" }]);
	});

	it("reads broken YAML with type note as a note only at note paths", () => {
		const text = "---\ntype: note\ntags: [a\n---\n";
		expect(parseItem(text, "x.md")?.properties.kind).toBe("note");
		expect(parseItem(text, "Ta Da/tasks/x.md")).toBeNull();
		expect(parseItem("---\ntags: [a\n---\n", "Ta Da/tasks/x.md")).toBeNull();
	});
});

describe("item", () => {
	it("parses a whole file", () => {
		const text = [
			"---", "type: task", "status: Doing", 'contexts: ["@computer"]', 'project: "[[Ta Da MVP]]"', "dueDate: 2026-10-02", "---", "",
			"Bring the files in line.", "", "- [x] One", "- [ ] Two", "  - [-] Cancelled", "  - [/] Started", "- [!] Icon only", "",
			"Related: [[Ta Da MVP]]",
		].join("\n");
		const item = parseItem(text, "Update files.md");
		expect(item?.title).toBe("Update files");
		expect([item?.properties.kind, item?.properties.status]).toEqual(["task", "Doing"]);
		expect(item?.summary).toBe("Bring the files in line.");
		expect(item?.checkboxes.map((box) => box.lineIndex)).toEqual([10, 11, 12, 13, 14]);
		expect(item && subtasks(item)).toEqual({ done: 1, total: 3 });
		expect(item?.links.map(linkTitle)).toEqual(["Ta Da MVP"]);
		expect(item?.warnings).toEqual([]);
	});

	it.each([
		["Some text.\n", true],
		["- One\n- Two\n", true],
		["## Heading\n", true],
		["- [ ] A\n- [x] B\n", false],
		["\n\n", false],
		["", false],
	] as const)("has a note when the body %j has more than checkboxes: %s", (body, hasNote) => {
		expect(parseItem(`---\r\ntype: task\r\n---\r\n${body}`, "T.md")?.hasNote).toBe(hasNote);
	});

	it("counts checkbox lines as file lines with CRLF", () => {
		const text = "---\r\ntype: task\r\nstatus: Done\r\n---\r\n- [x] A\r\n- [ ] B\r\n";
		const item = parseItem(text, "T.md");
		const lines = text.split("\r\n");
		for (const box of item?.checkboxes ?? []) {
			expect(new TextEncoder().encode(lines[box.lineIndex] ?? "")[box.column]).toBe(box.marker.charCodeAt(0));
		}
		expect(item && subtasks(item)).toEqual({ done: 1, total: 2 });
	});

	it("reads createdDate and tags only from a note", () => {
		const text = "---\ncreatedDate: 2026-10-04\ntags: [work, ark]\nstatus: Done\ndueDate: 2026-10-05\narea: \"[[Work]]\"\n---\n- [x] A\n- [ ] B\n- [-] C\n#plan\n";
		const item = parseItem(text, "Meetings/Ark.md");
		expect(item?.properties.kind).toBe("note");
		expect(String(item?.properties.createdDate)).toBe("2026-10-04");
		expect(item?.tags.map((use) => use.tag.path)).toEqual(["work", "ark", "plan"]);
		expect([item?.properties.status, item?.properties.dueDate, item?.properties.area]).toEqual(["Not Started", null, null]);
		expect(item && subtasks(item)).toEqual({ done: 1, total: 2 });
		expect(item?.warnings).toEqual([]);
	});

	it("loads a note with broken YAML with a warning", () => {
		const item = parseItem("---\ntags: [a\n---\nBody\n", "Broken.md");
		expect(item?.properties.kind).toBe("note");
		expect(item?.warnings).toHaveLength(1);
	});

	it("loads an item with broken YAML", () => {
		const item = parseItem("---\ntype: task\ncontexts:\n  - @computer\n---\n- [ ] Still counted\n", "Broken.md");
		expect(item && subtasks(item)).toEqual({ done: 0, total: 1 });
		expect(item?.warnings).toHaveLength(1);
	});

	it("merges frontmatter and body tags", () => {
		const text = [
			"---", "type: task", "status: Not Started", 'area: "[[Personal]]"', "tags: [errands, quick win]", "createdDate: 2026-10-01", "---",
			"# Message Max about a coat and a jacket", "", "Ask #people/max about a coat and a jacket",
			"in the same fabric as my pants. #Errands, #fabric", "", "- [ ] Find the receipt `#not-a-tag`",
		].join("\n");
		const item = parseItem(text, "tasks/Message Max.md");
		expect(item?.properties.tags.map((tag) => tag.name)).toEqual(["errands", "quick win"]);
		expect(item?.tags.map((use) => `${use.tag.name} ${use.inFrontmatter} ${use.inBody}`)).toEqual([
			"errands true true", "quick win true false", "people/max false true", "fabric false true",
		]);
	});
});

describe("body scanner", () => {
	const markers = (body: string, firstLine = 0): string => scanBody(body, firstLine).checkboxes.map((box) => box.marker).join("");

	it("finds checkboxes with lines and columns", () => {
		const body = "Intro.\n\n- [x] Done\n- [ ] Open\n* [/] Star bullet\n+ [-] Plus bullet\n1. [>] Ordered\n2) [<] Paren\n";
		const scan = scanBody(body, 10);
		expect(scan.checkboxes.map((box) => box.marker).join("")).toBe("x /-><");
		expect(scan.checkboxes.map((box) => box.lineIndex)).toEqual([12, 13, 14, 15, 16, 17]);
		expect(scan.checkboxes.map((box) => box.column)).toEqual([3, 3, 3, 3, 4, 4]);
	});

	it("finds nested and quoted checkboxes", () => {
		const body =
			"- [ ] Parent\n  - [x] Child\n    - [/] Grandchild\n\t- [-] Tab-indented\n- Plain parent\n  1. [ ] Ordered child\n> - [x] Quoted\n> > - [ ] Double quoted\n";
		const scan = scanBody(body);
		expect(scan.checkboxes.map((box) => box.marker).join("")).toBe(" x/- x ");
		const lines = body.split("\n");
		for (const box of scan.checkboxes) {
			const line = new TextEncoder().encode(lines[box.lineIndex] ?? "");
			expect(line[box.column]).toBe(box.marker.charCodeAt(0));
			expect([line[box.column - 1], line[box.column + 1]]).toEqual(["[".charCodeAt(0), "]".charCodeAt(0)]);
		}
	});

	it("ignores checklists in code", () => {
		const body = [
			"```", "- [ ] fenced", "```", "", "~~~markdown", "- [x] tilde fenced", "~~~", "", "    - [ ] indented code", "", "- [ ] Real",
			"  ```", "  - [ ] fenced inside an item", "  ```", "-     [ ] item starting with indented code", "- `[ ]` inline code", "",
			"<div>", "- [ ] html block", "</div>", "",
		].join("\n");
		expect(markers(body)).toBe(" ");
	});

	it("needs a known marker and a space", () => {
		const body =
			"- [y] Unknown marker\n- [x]NoSpace\n- [ ]\n- [xx] Two\n- [✓] Unicode\n- [x]\tTab after\n- text [ ] later\n-[ ] No space after bullet\n[ ] Not a list\n- [?] Icon\n";
		const scan = scanBody(body);
		expect(scan.checkboxes.map((box) => box.marker).join("")).toBe("x?");
		expect(scan.checkboxes.map((box) => box.lineIndex)).toEqual([5, 9]);
	});

	it("handles CRLF", () => {
		const scan = scanBody("Summary line\r\n\r\n- [x] One\r\n  - [ ] Two\r\n\r\nSee [[Link]]\r\n", 3);
		expect(scan.summary).toBe("Summary line");
		expect(scan.checkboxes.map((box) => box.marker).join("")).toBe("x ");
		expect(scan.checkboxes.map((box) => box.lineIndex)).toEqual([5, 6]);
		expect(scan.checkboxes.map((box) => box.column)).toEqual([3, 5]);
		expect(scan.links.map((link) => link.target)).toEqual(["Link"]);
	});

	it("counts columns as UTF-8 offsets", () => {
		const scan = scanBody("Ünïcödé 🙂 intro\n\n> - [x] Café ☕️ [[Dan’s site|Dan]]\n");
		expect(scan.checkboxes.map((box) => box.column)).toEqual([5]);
		expect(scan.summary).toBe("Ünïcödé 🙂 intro");
		expect(scan.links.map((link) => link.target)).toEqual(["Dan’s site"]);
	});

	it("finds links outside code", () => {
		const body = [
			"# Heading [[In Heading]]", "", "Text [[A]], [[B|alias]], [[C#Section]], *[[Emphasised]]* and **bold [[Strong]]**.",
			"Inline `[[Not Code]]` and <span>[[In Span]]</span>?", "", "- [ ] Item [[In List]]", "", "| Col |", "| --- |", "| [[In Table]] |", "",
			"```", "[[Not Fenced]]", "```", "", "<div>", "[[Not HTML]]", "</div>", "",
		].join("\n");
		const scan = scanBody(body);
		expect(scan.links.map((link) => link.target)).toEqual(["In Heading", "A", "B", "C", "Emphasised", "Strong", "In Span", "In List", "In Table"]);
		expect([scan.links[1]?.alias, scan.links[2]?.alias, scan.links[3]?.heading]).toEqual([null, "alias", "Section"]);
	});

	it("finds embeds apart from links", () => {
		const scan = scanBody("Before ![[front.jpg]] and [[Kombi]].\n\n- [ ] Photo ![[odometer.png]]\n\n`![[Not Code.png]]`\n");
		expect(scan.links.map((link) => link.target)).toEqual(["Kombi"]);
		expect(scan.embeds.map((link) => link.target)).toEqual(["front.jpg", "odometer.png"]);
	});

	it("takes the first top-level paragraph as the summary", () => {
		expect(scanBody('# Title\n\n- list first\n\nFirst "quoted" para\nwraps here.\n\nSecond.\n').summary).toBe('First "quoted" para wraps here.');
		expect(scanBody("- [ ] Only a list\n").summary).toBeNull();
		expect(scanBody("").summary).toBeNull();
	});

	it("finds inline tags", () => {
		const body = [
			"# Heading #in-heading", "", "Ask #people/max about a coat.", "#errands, #fabric and #2026plan; mid#word or a#b and #a#b.",
			"*#emphasised* **bold #strong** _x_#after-emphasis `code`#after-code", "#Errands again, and #ünïcödé_tag-1", "",
			"- [ ] Find the receipt `#not-a-tag` #in-list", "> #quoted", "", "| #in-table |", "| --- |", "",
		].join("\n");
		expect(scanBody(body).tags.map((tag) => tag.name)).toEqual([
			"in-heading", "people/max", "errands", "fabric", "2026plan", "a", "emphasised", "strong", "ünïcödé_tag-1", "in-list", "quoted", "in-table",
		]);
	});

	it("skips tags in code, HTML, links and URLs", () => {
		const body = [
			"```", "#fenced", "```", "", "    #indented", "", "<div>", "#html", "</div>", "",
			"<span>#span</span> [see #linked](https://example.com) ![#alt](a.png) <https://example.com/#auto>",
			"https://example.com/#top [[Kombi #Plan]] [[Kombi|the #alias]] ![[a.png#x]] [[Kombi]]#after-link \\", "#after-break", "",
		].join("\n");
		expect(scanBody(body).tags.map((tag) => tag.name)).toEqual(["after-break"]);
	});

	it("reads tags at line starts across soft breaks", () => {
		expect(scanBody("One\n#two\r\n#three").tags.map((tag) => tag.name)).toEqual(["two", "three"]);
	});

	it("skips escaped hashes", () => {
		const body = "\\#escaped and &#35;entity and &num;named but #real\n\n- [ ] item \\#no #yes\n\nx\\\n#after-break \\#not";
		expect(scanBody(body).tags.map((tag) => tag.name)).toEqual(["real", "yes", "after-break"]);
	});

	it("counts checkbox lines by newlines only", () => {
		const scan = scanBody("intro\u2028more\u0085x\u2029y\n- [ ] one\n- [ ] two\n", 4);
		expect(scan.checkboxes.map((box) => box.lineIndex)).toEqual([5, 6]);
		expect(scan.checkboxes.map((box) => box.column)).toEqual([3, 3]);
	});

	it("reads an aliased link in a table cell", () => {
		const scan = scanBody("| Who |\n| --- |\n| [[Old\\|them]] ![[a.png\\|300]] |\n");
		expect(scan.links).toEqual([{ target: "Old", heading: null, alias: "them" }]);
		expect(scan.embeds).toEqual([{ target: "a.png", heading: null, alias: "300" }]);
	});
});

describe("explicit YAML tags and identity", () => {
	it("keeps explicitly tagged values as strings", () => {
		const { properties } = read("type: task\nstatus: Doing\ndueDate: !!timestamp 2026-10-02\nrepeat: !!binary aGk=\n");
		expect(String(properties.dueDate)).toBe("2026-10-02");
		expect(properties.repeatRule?.text).toBe("aGk=");
	});

	it("gives canonically equivalent tags one path", () => {
		const result = read("type: task\nstatus: Doing\ntags: [\"Café\", \"Café\"]\n");
		expect(result.properties.tags).toHaveLength(1);
		expect(result.properties.tags[0]?.name).toBe("Café");
	});
});
