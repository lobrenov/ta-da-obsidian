import { describe, expect, it } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { isValidTagName, readTag, type Tag } from "../src/core/model/tag";
import { deleteInlineTags, renameInlineTags } from "../src/core/syntax/tagEdit";
import { addTag, deleteTag, deleteTagInFile, removeTag, renameTag, renameTagInFile } from "../src/core/writing/tagEditor";
import { makeItem } from "./support";

const tag = (name: string): Tag => readTag(name) as Tag;
const front = (tags: string, body = "body\n"): string => `---\ntype: task\n${tags}\n---\n${body}`;

describe("isValidTagName", () => {
	it("takes names the parser reads whole as one tag", () => {
		for (const name of ["work", "home/garden", "a-b_c", "2026-goals", "café", "a1"]) expect(isValidTagName(name), name).toBe(true);
	});

	it("refuses empty, spaced, digit-only and punctuated names", () => {
		for (const name of ["", " ", "a b", "123", "1/2", "/", "a,b", "a#b", "a.b"]) expect(isValidTagName(name), name).toBe(false);
	});
});

describe("inline tag edits", () => {
	it("rename keeps the spelling of a child's rest and leaves text where no tag is read", () => {
		const text = "#Home/Beds `#home` [#home](x) [[#home]] \\#home https://x.test/#home\n";
		expect(renameInlineTags("home", "house", text)).toBe("#house/Beds `#home` [#home](x) [[#home]] \\#home https://x.test/#home\n");
	});

	it("rename in a table cell and after an emoji", () => {
		expect(renameInlineTags("a", "b", "| x | #a |\n|---|---|\n| 😀 #A | y |\n")).toBe("| x | #b |\n|---|---|\n| 😀 #b | y |\n");
	});

	it("rename and delete return the text as it was with nothing to change", () => {
		const text = "Plain #other\n";
		expect(renameInlineTags("home", "house", text)).toBe(text);
		expect(deleteInlineTags("home", text)).toBe(text);
		expect(renameInlineTags("", "x", text)).toBe(text);
	});

	it("delete takes the space before a tag, else the one after, and keeps a blank line", () => {
		expect(deleteInlineTags("a", "x #a y\n")).toBe("x y\n");
		expect(deleteInlineTags("a", "#a y\n")).toBe("y\n");
		expect(deleteInlineTags("a", "x #a\n#a\n")).toBe("x\n\n");
		expect(deleteInlineTags("a", "x #a/b #a\n")).toBe("x\n");
	});
});

describe("frontmatter rename and delete", () => {
	it("rename moves the tag and its children, keeping the list's style", () => {
		expect(renameTag(tag("home"), tag("house"), front("tags: [home, Home/Garden, homework]"))).toBe(front("tags: [house, house/Garden, homework]"));
		expect(renameTag(tag("a"), tag("x y"), front("tags:\n  - a\n  - b"))).toBe(front("tags:\n  - x y\n  - b"));
	});

	it("rename into an existing tag merges, and a case-only rename rewrites every spelling", () => {
		expect(renameTag(tag("a"), tag("b"), front("tags: [a, B, c]"))).toBe(front("tags: [B, c]"));
		expect(renameTag(tag("work"), tag("Work"), front("tags: [work, WORK/x]"))).toBe(front("tags: [Work, Work/x]"));
	});

	it("delete removes the tag and its children", () => {
		expect(deleteTag(tag("home"), front("tags: [home, Home/garden, homework]"))).toBe(front("tags: [homework]"));
		expect(deleteTag(tag("home"), front("tags:\n  - home\n  - b\n  - home/x"))).toBe(front("tags:\n  - b"));
		expect(deleteTag(tag("home"), front("tags: [home]"))).toBe(front("tags:"));
	});

	it("an unspliceable tags: that carries the tag is null; one that doesn't is unchanged", () => {
		const block = front("tags: |\n  a, b");
		expect(renameTag(tag("a"), tag("x"), block)).toBeNull();
		expect(deleteTag(tag("a"), block)).toBeNull();
		expect(deleteTag(tag("missing"), block)).toBe(block);
		expect(renameTag(tag("a"), tag("x"), "no frontmatter #a\n")).toBe("no frontmatter #a\n");
	});
});

describe("whole-file edits", () => {
	it("edit tags: and the body, never the frontmatter by the body edit", () => {
		const text = front("tags: [home]\ndescription: '#home'", "#home and #Home/x\n");
		expect(renameTagInFile(tag("home"), tag("house"), text)).toEqual({
			text: front("tags: [house]\ndescription: '#home'", "#house and #house/x\n"),
			unspliceable: false,
		});
		expect(deleteTagInFile(tag("home"), text).text).toBe(front("tags:\ndescription: '#home'", "and\n"));
	});

	it("an unspliceable tags: keeps its value while the body is still edited, and says so", () => {
		const text = front("tags: |\n  home, x", "#home\n");
		expect(renameTagInFile(tag("home"), tag("house"), text)).toEqual({ text: front("tags: |\n  home, x", "#house\n"), unspliceable: true });
	});
});

describe("VaultIndex.pathsCarryingOrUnder", () => {
	const index = new VaultIndex([
		makeItem("Ta Da/tasks/B.md", "type: task\ntags: [home]"),
		makeItem("Ta Da/tasks/A.md", "type: task\ntags: [Home/garden]"),
		makeItem("Ta Da/tasks/C.md", "type: task\ntags: [homework]"),
		makeItem("Ta Da/tasks/D.md", "type: task", "Body #home/x\n"),
		makeItem("Ta Da/logbook/2026/E.md", "type: task\nstatus: Done\ntags: [home]"),
	]);

	it("lists the tag's carriers and its children's, logged included, sorted, without siblings", () => {
		expect(index.pathsCarryingOrUnder(tag("Home"))).toEqual(["Ta Da/logbook/2026/E.md", "Ta Da/tasks/A.md", "Ta Da/tasks/B.md", "Ta Da/tasks/D.md"]);
		expect(index.pathsCarryingOrUnder(tag("home/garden"))).toEqual(["Ta Da/tasks/A.md"]);
		expect(index.pathsCarryingOrUnder(tag("none"))).toEqual([]);
	});
});

describe("tags: values at the edge", () => {
	it("a flow list closed on an unindented line is left alone", () => {
		const text = front("tags: [\n  home,\n  work\n]");
		expect(addTag(tag("x"), text)).toBe(text);
		expect(removeTag(tag("home"), text)).toBe(text);
		expect(renameTag(tag("home"), tag("house"), text)).toBeNull();
		expect(deleteTag(tag("home"), text)).toBeNull();
		expect(renameTag(tag("missing"), tag("x"), text)).toBe(text);
	});

	it("renaming a block item keeps the rest of its line", () => {
		expect(renameTag(tag("home"), tag("house"), front("tags:\n  - home # main\n  - work"))).toBe(front("tags:\n  - house # main\n  - work"));
		expect(renameTag(tag("home"), tag("house"), front("tags:\n  - home  \n  - work"))).toBe(front("tags:\n  - house  \n  - work"));
	});
});
