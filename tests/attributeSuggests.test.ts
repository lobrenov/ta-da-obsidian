import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { makeItem } from "./support";

// jsdom's window by hand: the jsdom environment can't resolve a mocked "obsidian".
const { dom } = await vi.hoisted(async () => ({ dom: new (await import("jsdom")).JSDOM("") }));
const notices: string[] = [];
const picker = vi.hoisted(() => ({ opened: [] as { heading: string; choose: (date: unknown) => void }[] }));
const made = vi.hoisted(() => ({ titles: [] as string[], fail: false }));

vi.mock("obsidian", () => ({
	EditorSuggest: class {
		context: unknown = null;
		instructions: unknown[] = [];
		constructor(public app: unknown) {}
		setInstructions(instructions: unknown[]): void {
			this.instructions = instructions;
		}
		close(): void {
			this.context = null;
		}
	},
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
	Modal: class {},
	SuggestModal: class {},
}));
vi.mock("../src/ui/header/modals", () => ({
	DateModal: class {
		constructor(_app: unknown, heading: string, _current: unknown, _today: unknown, _order: unknown, _first: unknown, choose: (date: unknown) => void) {
			picker.opened.push({ heading, choose });
		}
		open(): void {}
	},
}));
vi.mock("../src/ui/newProject", () => ({
	createProject: async (_host: unknown, title: string) => {
		if (made.fail) throw new Error("disk full");
		made.titles.push(title);
		return { basename: `${title} 2` };
	},
}));

const { DateSuggest, ParentSuggest, replaceToken } = await import("../src/ui/AttributeSuggests");

const today = LocalDate.parse("2026-10-02") as LocalDate;

/** An editor over one array of lines. */
function fakeEditor(lines: string[]) {
	const editor = {
		lines,
		cursor: null as { line: number; ch: number } | null,
		focused: false,
		getLine: (line: number) => lines[line] ?? "",
		replaceRange(text: string, from: { line: number; ch: number }, to: { line: number; ch: number }) {
			const line = lines[from.line] as string;
			lines[from.line] = line.slice(0, from.ch) + text + line.slice(to.ch);
		},
		setCursor(position: { line: number; ch: number }) {
			editor.cursor = position;
		},
		focus() {
			editor.focused = true;
		},
	};
	return editor;
}

const index = new VaultIndex([
	makeItem("Ta Da/areas/Work.md", "type: area"),
	makeItem("Ta Da/projects/Ta Da MVP.md", "type: project\nstatus: Doing\narea: \"[[Work]]\""),
]);
const host = { app: {}, index, today: () => today } as never;

/** The trigger with the caret at `ch`, as typed: the line is read from its start, a character at a time, as the editor asks. */
function open<T>(suggest: { onTrigger(cursor: { line: number; ch: number }, editor: never, file: null): { start: { line: number; ch: number }; end: { line: number; ch: number }; query: string } | null; context: unknown }, editor: ReturnType<typeof fakeEditor>, ch: number): ReturnType<typeof suggest.onTrigger> {
	let trigger: ReturnType<typeof suggest.onTrigger> = null;
	for (let c = 1; c <= ch; c++) trigger = suggest.onTrigger({ line: 0, ch: c }, editor as never, null);
	suggest.context = trigger && { ...trigger, editor, file: null };
	return trigger;
}

beforeEach(() => {
	notices.length = 0;
	picker.opened.length = 0;
	made.titles.length = 0;
	made.fail = false;
});

describe("replaceToken", () => {
	it("replaces the token and puts the caret after the text, while the line still reads the token", () => {
		const editor = fakeEditor(["- [ ] a >fri b"]);
		expect(replaceToken(editor as never, 0, 8, 12, ">fri", ">2026-10-02 ")).toBe(true);
		expect(editor.lines[0]).toBe("- [ ] a >2026-10-02  b");
		expect(editor.cursor).toEqual({ line: 0, ch: 20 });
	});

	it("leaves a line that changed", () => {
		const editor = fakeEditor(["- [ ] a >frx b"]);
		expect(replaceToken(editor as never, 0, 8, 12, ">fri", ">2026-10-02 ")).toBe(false);
		expect(editor.lines[0]).toBe("- [ ] a >frx b");
		expect(editor.cursor).toBeNull();
	});
});

describe("DateSuggest", () => {
	it("has Obsidian's link menu footer, and triggers only on a checkbox line's >", () => {
		const suggest = new DateSuggest(host);
		expect((suggest as unknown as { instructions: { command: string }[] }).instructions.map((entry) => entry.command)).toEqual(["↑↓", "↵", "esc"]);
		expect(open(suggest as never, fakeEditor(["- [ ] a >fri"]), 12)).toEqual({ start: { line: 0, ch: 8 }, end: { line: 0, ch: 12 }, query: "fri" });
		expect(open(suggest as never, fakeEditor(["Prose >fri"]), 10)).toBeNull();
	});

	it("lists the phrase's date first, with fri on a Friday as today", () => {
		const suggest = new DateSuggest(host);
		const rows = suggest.getSuggestions({ query: "fri" } as never);
		expect(rows.map((row) => `${row.kind}: ${row.label}`)).toEqual(["phrase: Today", "quick: Tomorrow", "quick: Next week", "pick: Pick a date…"]);
	});

	it("↵ writes >YYYY-MM-DD and a space over the typed token", () => {
		const suggest = new DateSuggest(host);
		const editor = fakeEditor(["- [ ] a >tom"]);
		open(suggest as never, editor, 12);
		suggest.selectSuggestion(suggest.getSuggestions({ query: "tom" } as never)[0] as never);
		expect(editor.lines[0]).toBe("- [ ] a >2026-10-03 ");
	});

	it("Pick a date… opens the picker, and writes its date over the token once picked", () => {
		const suggest = new DateSuggest(host);
		const editor = fakeEditor(["- [ ] a >fri"]);
		open(suggest as never, editor, 12);
		suggest.selectSuggestion({ kind: "pick", label: "Pick a date…", detail: null, date: null });
		expect(picker.opened).toHaveLength(1);
		expect(editor.lines[0]).toBe("- [ ] a >fri");
		picker.opened[0]?.choose(LocalDate.parse("2026-11-05"));
		expect(editor.lines[0]).toBe("- [ ] a >2026-11-05 ");
		expect(editor.focused).toBe(true);
	});

	it("writes nothing when the picker is dismissed or the line changed meanwhile", () => {
		const suggest = new DateSuggest(host);
		const editor = fakeEditor(["- [ ] a >fri"]);
		open(suggest as never, editor, 12);
		suggest.selectSuggestion({ kind: "pick", label: "", detail: null, date: null });
		picker.opened[0]?.choose(null);
		expect(editor.lines[0]).toBe("- [ ] a >fri");
		editor.lines[0] = "- [ ] a >fro";
		picker.opened[0]?.choose(LocalDate.parse("2026-11-05"));
		expect(editor.lines[0]).toBe("- [ ] a >fro");
	});
});

describe("an open menu", () => {
	it("stays open while typing on, and esc holds: typing on afterwards doesn't reopen it", () => {
		const suggest = new DateSuggest(host);
		const editor = fakeEditor(["- [ ] a >fri"]);
		expect(suggest.onTrigger({ line: 0, ch: 9 }, editor as never, null)).not.toBeNull();
		expect(suggest.onTrigger({ line: 0, ch: 10 }, editor as never, null)?.query).toBe("f");
		(suggest as unknown as { close(): void }).close();
		expect(suggest.onTrigger({ line: 0, ch: 11 }, editor as never, null)).toBeNull();
		expect(suggest.onTrigger({ line: 0, ch: 12 }, editor as never, null)).toBeNull();
	});

	it("doesn't open on text typed after an @ that was already there, or after a pick", () => {
		const suggest = new ParentSuggest(host);
		const editor = fakeEditor(["- [ ] call @bob about lunch"]);
		expect(suggest.onTrigger({ line: 0, ch: 15 }, editor as never, null)).toBeNull();
		expect(suggest.onTrigger({ line: 0, ch: 16 }, editor as never, null)).toBeNull();
		const typed = fakeEditor(["- [ ] a @ta"]);
		open(suggest as never, typed, 11);
		suggest.selectSuggestion({ kind: "project", title: "Ta Da MVP", detail: null });
		expect(suggest.onTrigger({ line: 0, ch: 24 }, typed as never, null)).toBeNull();
	});
});

describe("ParentSuggest", () => {
	it("triggers on a checkbox line's @, and lists projects and areas fuzzily", () => {
		const suggest = new ParentSuggest(host);
		expect(open(suggest as never, fakeEditor(["- [ ] a @tm"]), 11)).toEqual({ start: { line: 0, ch: 8 }, end: { line: 0, ch: 11 }, query: "tm" });
		expect(open(suggest as never, fakeEditor(["mail@tm"]), 7)).toBeNull();
		expect(suggest.getSuggestions({ query: "tm" } as never).map((row) => row.kind)).toEqual(["project", "new"]);
	});

	it("↵ writes @[[Title]] and a space over the token, a typed [[ and its ]] included", () => {
		const suggest = new ParentSuggest(host);
		const editor = fakeEditor(["- [ ] a @[[ta]] b"]);
		open(suggest as never, editor, 13);
		suggest.selectSuggestion({ kind: "project", title: "Ta Da MVP", detail: "Work" });
		expect(editor.lines[0]).toBe("- [ ] a @[[Ta Da MVP]]  b");
	});

	it("New project makes the project, then writes its title as made", async () => {
		const suggest = new ParentSuggest(host);
		const editor = fakeEditor(["- [ ] a @Trip"]);
		open(suggest as never, editor, 13);
		suggest.selectSuggestion({ kind: "new", title: "Trip" });
		await Promise.resolve();
		await Promise.resolve();
		expect(made.titles).toEqual(["Trip"]);
		expect(editor.lines[0]).toBe("- [ ] a @[[Trip 2]] ");
	});

	it("says so and leaves the text when the project can't be made", async () => {
		made.fail = true;
		const suggest = new ParentSuggest(host);
		const editor = fakeEditor(["- [ ] a @Trip"]);
		open(suggest as never, editor, 13);
		suggest.selectSuggestion({ kind: "new", title: "Trip" });
		await Promise.resolve();
		await Promise.resolve();
		expect(notices).toEqual(["Couldn't make the project: disk full"]);
		expect(editor.lines[0]).toBe("- [ ] a @Trip");
	});

	it("draws the ring, the cube and New project rows", () => {
		const suggest = new ParentSuggest(host);
		const document = dom.window.document;
		const draw = (row: Parameters<typeof suggest.renderSuggestion>[0]): HTMLElement => {
			const el = document.createElement("div");
			suggest.renderSuggestion(row, el as never);
			return el as never;
		};
		const project = draw({ kind: "project", title: "Ta Da MVP", detail: "Work" });
		expect(project.querySelector("svg path")?.getAttribute("d")).toContain("a9 9 0 1 0 18 0");
		expect(project.textContent).toBe("Ta Da MVPWork");
		expect(draw({ kind: "area", title: "Work", detail: null }).querySelector("svg path")?.getAttribute("d")).toContain("l7 4");
		expect(draw({ kind: "new", title: "Trip" }).textContent).toBe("New project “Trip”…");
	});
});

describe("the code guard", () => {
	/** An editor whose `cm` holds the whole text parsed as Markdown. */
	function withTree(text: string) {
		const editor = fakeEditor(text.split("\n"));
		return Object.assign(editor, { cm: { state: EditorState.create({ doc: text, extensions: [markdown()] }) } });
	}
	const triggerAt = (text: string, line: number, trigger: string) => {
		const editor = withTree(text);
		const ch = (text.split("\n")[line] as string).length;
		const typed = (suggest: { onTrigger(cursor: { line: number; ch: number }, editor: never, file: null): unknown }) => {
			let found: unknown = null;
			for (let c = 1; c <= ch; c++) found = suggest.onTrigger({ line, ch: c }, editor as never, null);
			return found;
		};
		return { date: typed(new DateSuggest(host)), parent: typed(new ParentSuggest(host)), trigger };
	};

	it("triggers on a checkbox line outside code", () => {
		expect(triggerAt("- [ ] a >fri", 0, ">").date).not.toBeNull();
		expect(triggerAt("- [ ] a @ta", 0, "@").parent).not.toBeNull();
	});

	it("doesn't trigger in a fenced block, or an indented block", () => {
		expect(triggerAt("```\n- [ ] a >fri\n```", 1, ">").date).toBeNull();
		expect(triggerAt("```\n- [ ] a @ta\n```", 1, "@").parent).toBeNull();
		expect(triggerAt("para\n\n    - [ ] a >fri", 2, ">").date).toBeNull();
		expect(triggerAt("para\n\n    - [ ] a @ta", 2, "@").parent).toBeNull();
		expect(triggerAt("- [ ] a `b >fri", 0, ">").date).not.toBeNull();
	});
});
