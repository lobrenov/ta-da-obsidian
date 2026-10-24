import { describe, expect, it } from "vitest";
import { LocalDate } from "../src/core/model/localDate";
import { readTag, type Tag } from "../src/core/model/tag";
import { parseItem } from "../src/core/parsing/parseItem";
import { filename, folderName, sanitise, splitFilename } from "../src/core/writing/fileNaming";
import { newArea, newDailyNote, newNote, newProject, newTask } from "../src/core/writing/newFile";

const today = LocalDate.parse("2026-10-02") as LocalDate;
const tag = (name: string): Tag => readTag(name) as Tag;

describe("FileNaming", () => {
	it.each([
		["Game Jam: Starfall", "Game Jam - Starfall"],
		["Ta Da MVP", "Ta Da MVP"],
		["a/b\\c|d", "a-b-c-d"],
		['What? *Now* "quoted" <tag>', "What Now quoted tag"],
		["[[Link]] #tag ^block", "Link tag block"],
		["Dan’s café ☕️", "Dan’s café ☕️"],
		["  spaced   out  ", "spaced out"],
		["..hidden", "hidden"],
		["line\nbreak", "line break"],
		["line\r\nbreak", "line break"],
		["", "Untitled"],
		["???", "Untitled"],
	])("sanitises %j", (title, expected) => {
		expect(sanitise(title)).toBe(expected);
	});

	it("limits the length to 200 UTF-8 bytes without splitting a character", () => {
		const name = sanitise("☕️".repeat(100));
		expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(200);
		expect(name.length).toBeGreaterThan(0);
		expect(name.endsWith("☕️")).toBe(true);
	});

	it("adds a number when the name is taken", () => {
		expect(filename("Task", [])).toBe("Task.md");
		expect(filename("Task", ["Task.md"])).toBe("Task 2.md");
		expect(filename("Task", ["task.md", "Task 2.md"])).toBe("Task 3.md");
		expect(filename("A: B", ["A - B.md"])).toBe("A - B 2.md");
		expect(filename("front", ["Front.JPG", "front.md"], "jpg")).toBe("front 2.jpg");
		expect(filename("Café", ["Café.md"])).toBe("Café 2.md");
	});

	it("numbers a folder name", () => {
		expect(folderName("Notes", ["notes"])).toBe("Notes 2");
		expect(folderName("Notes", ["notes", "Notes 2"])).toBe("Notes 3");
	});

	it("splits the extension", () => {
		expect(splitFilename("Pasted image 1.png")).toEqual({ base: "Pasted image 1", ext: "png" });
		expect(splitFilename("archive.tar.gz")).toEqual({ base: "archive.tar", ext: "gz" });
		expect(splitFilename("README")).toEqual({ base: "README", ext: "" });
		expect(splitFilename(".hidden")).toEqual({ base: ".hidden", ext: "" });
	});
});

describe("NewFile", () => {
	const parsed = (text: string, path = "t.md") => parseItem(text, path)!;

	it("a new task parses back", () => {
		const text = newTask({ project: "Ta Da MVP", today });
		expect(text).toBe('---\ntype: task\nstatus: Not Started\nproject: "[[Ta Da MVP]]"\ncreatedDate: 2026-10-02\n---\n');
		const item = parsed(text, "New task.md");
		expect([item.properties.kind, item.properties.status]).toEqual(["task", "Not Started"]);
		expect(item.properties.createdDate?.toString()).toBe("2026-10-02");
		expect(item.warnings).toEqual([]);
	});

	it("a new loose task and project parse back", () => {
		const loose = parsed(newTask({ today }));
		expect(loose.properties.project).toBeNull();
		expect(loose.warnings).toEqual([]);
		const project = parsed(newProject({ today }), "p.md");
		expect(project.properties.kind).toBe("project");
		expect(project.warnings).toEqual([]);
	});

	it("names one parent", () => {
		expect(newTask({ area: "Personal", today })).toBe('---\ntype: task\nstatus: Not Started\narea: "[[Personal]]"\ncreatedDate: 2026-10-02\n---\n');
		const both = parsed(newTask({ project: "Ta Da MVP", area: "Personal", today }));
		expect(both.properties.area).toBeNull();
		expect(both.warnings).toEqual([]);
		expect(parsed(newProject({ area: "Work", today }), "p.md").warnings).toEqual([]);
	});

	it("a new area parses back", () => {
		const text = newArea({ today });
		expect(text).toBe("---\ntype: area\ncreatedDate: 2026-10-02\n---\n");
		const area = parsed(text, "areas/Personal.md");
		expect(area.properties.kind).toBe("area");
		expect(area.warnings).toEqual([]);
	});

	it("a new task with tags parses back", () => {
		const tags = [tag("errands"), tag("Quick Win"), tag("quick win"), tag("a, b")];
		const text = newTask({ area: "Personal", tags, today });
		expect(text).toBe('---\ntype: task\nstatus: Not Started\narea: "[[Personal]]"\ncreatedDate: 2026-10-02\ntags: [errands, Quick Win, "a, b"]\n---\n');
		const item = parsed(text);
		expect(item.properties.tags.map((entry) => entry.name)).toEqual(["errands", "Quick Win", "a, b"]);
		expect(item.warnings).toEqual([]);
		expect(newTask({ tags: [], today })).toBe(newTask({ today }));
	});

	it("a new project and area with tags parse back", () => {
		const tags = [tag("home/garden"), tag("Home/Garden"), tag("work")];
		const project = newProject({ area: "Personal", tags, today });
		expect(project).toBe('---\ntype: project\nstatus: Not Started\narea: "[[Personal]]"\ncreatedDate: 2026-10-02\ntags: [home/garden, work]\n---\n');
		const area = newArea({ tags, today });
		expect(area).toBe("---\ntype: area\ncreatedDate: 2026-10-02\ntags: [home/garden, work]\n---\n");
		for (const text of [project, area]) {
			const item = parsed(text);
			expect(item.properties.tags.map((entry) => entry.name)).toEqual(["home/garden", "work"]);
			expect(item.warnings).toEqual([]);
		}
		expect(newProject({ tags: [], today })).toBe(newProject({ today }));
		expect(newArea({ tags: [], today })).toBe(newArea({ today }));
	});

	it("a new note parses back", () => {
		expect(newNote({ today })).toBe("---\ncreatedDate: 2026-10-02\ntags: []\n---\n");
		const text = newNote({ tags: [tag("work/ark")], today });
		expect(text).toBe("---\ncreatedDate: 2026-10-02\ntags: [work/ark]\n---\n");
		const note = parsed(text, "Meetings/Untitled.md");
		expect(note.properties.kind).toBe("note");
		expect(note.warnings).toEqual([]);
	});

	it("a daily note takes the template's body, not its frontmatter", () => {
		expect(newDailyNote("---\nfoo: bar\n---\n## Plan\n", today)).toBe("---\ncreatedDate: 2026-10-02\ntags: []\n---\n## Plan\n");
		expect(newDailyNote(null, today)).toBe(newNote({ today }));
	});
});
