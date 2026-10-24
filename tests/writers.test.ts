import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkboxState } from "../src/core/model/checkbox";
import { LocalDate } from "../src/core/model/localDate";
import type { Item } from "../src/core/model/item";
import { parseItem } from "../src/core/parsing/parseItem";
import { box, markerEnd, markerStart } from "../src/core/writing/checkboxSyntax";
import { click, setMarker, toggledMarker } from "../src/core/writing/checklistEditor";
import { setStatus, startsTask, toggle } from "../src/core/writing/completion";
import { Lines } from "../src/core/writing/lines";
import { setParent } from "../src/core/writing/parent";
import { taskMarkers } from "../src/core/model/checkbox";
import { changedLines } from "./changedLines";

const today = LocalDate.parse("2026-10-02") as LocalDate;
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const designVault = resolve(repoRoot, "../Ta Da/Packages/TaDaCore/Tests/TaDaCoreTests/Fixtures/DesignVault");

describe("Lines", () => {
	it.each(["", "a", "a\n", "a\nb", "a\r\nb\r\n", "\n\n", "Ünï\r\ncödé 🙂\n"])("round-trips %j", (text) => {
		expect(new Lines(text).text).toBe(text);
	});

	it("detects the file's ending", () => {
		expect(new Lines("a\r\nb\n").ending).toBe("\r\n");
		expect(new Lines("a\nb\r\n").ending).toBe("\n");
		expect(new Lines("no newline").ending).toBe("\n");
		expect(Lines.content("abc\r\n")).toBe("abc");
		expect(Lines.content("abc\n")).toBe("abc");
		expect(Lines.content("abc")).toBe("abc");
	});
});

describe("CheckboxSyntax", () => {
	it("reads boxes at the same offsets as the scanner", () => {
		// The marker's UTF-8 offset in the line, which is also its UTF-16 one: only ASCII comes before it.
		const cases: [string, number][] = [["- [ ] é", 3], ["- [x] \r", 3], [">\t1) [?] 日本", 6], ["-    [ ] a", 6]];
		for (const [line, column] of cases) {
			const end = markerEnd(line, markerStart(line));
			expect(end, line).not.toBeNull();
			expect(box(line, end as number)?.offset, line).toBe(column);
			expect(parseItem(`---\ntype: task\n---\n${line}\n`, "t.md")?.checkboxes[0]?.column, line).toBe(column);
		}
		expect(box("- ", 9)).toBeNull();
	});

	it("finds list markers", () => {
		expect(markerEnd("1234567890. x", 0)).toBeNull();
		expect(markerEnd("123456789. x", 0)).toBe(10);
		expect(markerEnd("-x", 0)).toBeNull();
		expect(markerEnd("+ x", 0)).toBe(1);
		expect(markerStart("  > > - [ ] a")).toBe(6);
	});

	it("reads the reference set's states", () => {
		for (const marker of [" ", "/", ">", "<"]) expect(checkboxState(marker)).toBe("open");
		for (const marker of ["x", "X"]) expect(checkboxState(marker)).toBe("done");
		expect(checkboxState("-")).toBe("cancelled");
		for (const marker of "?!*\"lbiSIpcfkwud") expect(checkboxState(marker)).toBe("icon");
		for (const marker of ["y", "✓", "0"]) expect(checkboxState(marker)).toBeNull();
		for (const marker of taskMarkers) expect(checkboxState(marker)).not.toBeNull();
	});

	it("toggles open to x and done or cancelled to a space", () => {
		for (const marker of [" ", "/", ">", "<"]) expect(toggledMarker(marker)).toBe("x");
		for (const marker of ["x", "X", "-"]) expect(toggledMarker(marker)).toBe(" ");
		expect(toggledMarker("?")).toBeNull();
		expect(toggledMarker("y")).toBeNull();
	});
});

describe("ChecklistEditor", () => {
	const text = "---\ntype: task\n---\nÜber 🙂\n\n- [ ] Open\n  - [x] Done\n> - [-] Cancelled\n1. [?] Icon\n";
	const boxes = (input: string) => (parseItem(input, "t.md") as Item).checkboxes;

	it("click completes and reopens", () => {
		const b = boxes(text);
		const first = b[0]!;
		expect(changedLines(text, click(first, text) as string)).toEqual([["- [ ] Open"], ["- [x] Open"]]);
		expect(changedLines(text, click(b[1]!, text) as string)).toEqual([["  - [x] Done"], ["  - [ ] Done"]]);
		expect(changedLines(text, click(b[2]!, text) as string)).toEqual([["> - [-] Cancelled"], ["> - [ ] Cancelled"]]);
		expect(click(b[3]!, text)).toBeNull();
	});

	it("setMarker changes one byte", () => {
		const b = boxes(text);
		const after = setMarker("/", b[3]!, text) as string;
		expect(changedLines(text, after)).toEqual([["1. [?] Icon"], ["1. [/] Icon"]]);
		expect(new TextEncoder().encode(after).length).toBe(new TextEncoder().encode(text).length);
		expect(setMarker("y", b[0]!, text)).toBeNull();
		expect(setMarker("✓", b[0]!, text)).toBeNull();
	});

	it("refuses stale boxes", () => {
		const first = boxes(text)[0]!;
		expect(click(first, text.replace("- [ ] Open", "- [x] Open"))).toBeNull();
		expect(click(first, "---\ntype: task\n---\n")).toBeNull();
		expect(click({ marker: " ", lineIndex: 5, column: 0, state: "open" }, text)).toBeNull();
	});

	it("click keeps CRLF", () => {
		const crlf = "---\r\ntype: task\r\n---\r\n- [ ] A\r\n- [ ] B\r\n";
		expect(click(boxes(crlf)[1]!, crlf)).toBe("---\r\ntype: task\r\n---\r\n- [ ] A\r\n- [x] B\r\n");
	});
});

describe("Completion", () => {
	const make = (status: string, boxes: string, type = "task"): Item =>
		parseItem(`---\ntype: ${type}\nstatus: ${status}\n---\n${boxes}`, "tasks/T.md") as Item;

	it("ticking a subtask starts a Not Started task", () => {
		const before = make("Not Started", "- [x] One\n- [ ] Two\n");
		expect(startsTask(make("Not Started", "- [x] One\n- [x] Two\n"), before)).toBe(true);
		expect(startsTask(make("Not Started", "- [x] One\n- [/] Two\n"), before)).toBe(false);
		expect(startsTask(make("Not Started", "- [ ] One\n- [ ] Two\n"), before)).toBe(false);
		expect(startsTask(make("Blocked", "- [x] One\n- [x] Two\n"), before)).toBe(false);
		expect(startsTask(make("Not Started", "- [x] One\n- [x] Two\n", "project"), before)).toBe(false);
	});

	it("completing fills an empty completedDate", () => {
		const text = "---\ntype: task\nstatus: Doing\ncompletedDate:\ndueDate: 2026-10-02\n---\nBody\n";
		expect(changedLines(text, setStatus("Done", text, today))).toEqual([
			["status: Doing", "completedDate:"],
			["status: Done", "completedDate: 2026-10-02"],
		]);
	});

	it("completing appends a missing completedDate", () => {
		const text = "---\ntype: task\nstatus: Not Started\n---\n";
		expect(toggle("Not Started", text, today)).toBe("---\ntype: task\nstatus: Done\ncompletedDate: 2026-10-02\n---\n");
	});

	it("reopening clears completedDate", () => {
		const text = "---\ntype: task\nstatus: Done\ncompletedDate: 2026-09-27\n---\n";
		expect(toggle("Done", text, today)).toBe("---\ntype: task\nstatus: Not Started\ncompletedDate:\n---\n");
		expect(setStatus("Blocked", text, today)).toBe("---\ntype: task\nstatus: Blocked\ncompletedDate:\n---\n");
	});

	it("cancelling sets completedDate", () => {
		expect(setStatus("Cancelled", "---\ntype: task\nstatus: Doing\n---\n", today)).toBe(
			"---\ntype: task\nstatus: Cancelled\ncompletedDate: 2026-10-02\n---\n",
		);
	});

	it("toggling a cancelled file reopens it", () => {
		const text = "---\ntype: task\nstatus: Cancelled\ncompletedDate: 2026-09-27\n---\n";
		expect(toggle("Cancelled", text, today)).toBe("---\ntype: task\nstatus: Not Started\ncompletedDate:\n---\n");
	});

	it("a non-done status without completedDate touches only status", () => {
		expect(setStatus("Blocked", "---\ntype: task\nstatus: Doing\n---\n", today)).toBe("---\ntype: task\nstatus: Blocked\n---\n");
	});

	it("keeps CRLF", () => {
		expect(setStatus("Done", "---\r\ntype: task\r\nstatus: Doing\r\n---\r\n", today)).toBe(
			"---\r\ntype: task\r\nstatus: Done\r\ncompletedDate: 2026-10-02\r\n---\r\n",
		);
	});

	it("toggling any DesignVault file changes only its status and completedDate lines", () => {
		let checked = 0;
		for (const name of readdirSync(designVault, { recursive: true, encoding: "utf8" })) {
			if (!name.endsWith(".md")) continue;
			const input = readFileSync(join(designVault, name), "utf8");
			const item = parseItem(input, name.split("/").pop() as string);
			if (!item || item.properties.kind === "note") continue;
			const after = toggle(item.properties.status, input, today);
			const [removed, added] = changedLines(input, after);
			for (const line of [...removed, ...added]) expect(line.startsWith("status:") || line.startsWith("completedDate:"), `${name}: ${line}`).toBe(true);
			const reread = parseItem(after, "x.md") as Item;
			const done = item.properties.status === "Done";
			expect(reread.properties.status).toBe(done ? "Not Started" : "Done");
			expect(reread.properties.completedDate?.toString() ?? null).toBe(done ? null : today.toString());
			expect(reread.warnings).toEqual(item.warnings);
			checked++;
		}
		expect(checked).toBeGreaterThan(10);
	});
});

describe("Parent", () => {
	it("writes one key and empties the other", () => {
		const both = '---\ntype: task\nstatus: Doing\narea: Personal\nproject: "[[Old]]"\n---\n';
		expect(setParent({ kind: "area", title: "Work" }, both)).toBe('---\ntype: task\nstatus: Doing\narea: "[[Work]]"\nproject:\n---\n');
		expect(setParent({ kind: "project", title: "New" }, both)).toBe('---\ntype: task\nstatus: Doing\narea:\nproject: "[[New]]"\n---\n');
		expect(setParent(null, both)).toBe("---\ntype: task\nstatus: Doing\narea:\nproject:\n---\n");
		const project = "---\ntype: project\nstatus: Doing\n---\n";
		expect(setParent({ kind: "area", title: "Work" }, project)).toBe('---\ntype: project\nstatus: Doing\narea: "[[Work]]"\n---\n');
	});
});

describe("ChecklistEditor and a byte order mark", () => {
	it("keeps the BOM", () => {
		const text = "﻿- [ ] a\n";
		// The BOM is three UTF-8 bytes, so the marker is at column 6 of the first line.
		expect(click({ marker: " ", lineIndex: 0, column: 6, state: "open" }, text)).toBe("﻿- [x] a\n");
	});
});
