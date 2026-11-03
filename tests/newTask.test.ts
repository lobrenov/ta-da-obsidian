import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { RepeatRule } from "../src/core/model/repeatRule";
import { readTag } from "../src/core/model/tag";
import { emptyDraft } from "../src/core/writing/quickEntryDraft";
import { placeDraft } from "../src/ui/newTask/place";
import { type NewTaskContext, prefillDraft } from "../src/ui/newTask/prefill";
import { makeItem } from "./support";

// jsdom's window by hand: the jsdom environment can't resolve a mocked "obsidian".
const { dom, picks, created } = await vi.hoisted(async () => ({
	dom: new (await import("jsdom")).JSDOM(""),
	picks: [] as unknown[][],
	created: [] as { path: string; text: string }[],
}));
const { document, window } = dom.window;
vi.mock("obsidian", () => ({
	Notice: class {},
	Menu: class {},
	Platform: {},
	Modal: class {
		contentEl = Object.assign(document.createElement("div"), { win: window, empty() {} });
		modalEl = document.createElement("div");
		containerEl = document.createElement("div");
		titleEl = { setText: () => undefined };
		closed = false;
		constructor(public app: unknown) {}
		open(): void {
			(this as unknown as { onOpen(): void }).onOpen();
		}
		close(): void {
			this.closed = true;
		}
	},
}));
vi.mock("../src/ui/header/pickers", () => ({
	openDatePicker: (...args: unknown[]) => void picks.push(args),
	openStatusMenu: vi.fn(),
	openParentPicker: vi.fn(),
	openTagPicker: vi.fn(),
}));
vi.mock("../src/vaultFiles", () => ({
	createIn: async (_vault: unknown, _folder: string, path: string, text: string) => void created.push({ path, text }),
}));
const { NewTaskModal } = await import("../src/ui/newTask/NewTaskModal");

const day = LocalDate.parse("2026-10-14") as LocalDate;
const agenda: NewTaskContext = { domain: { kind: "agenda" }, selection: { kind: "day", date: day } };
const index = new VaultIndex([
	makeItem("Ta Da/projects/Kombi.md", "type: project\ntags: [Car/Kombi]"),
	makeItem("Ta Da/areas/Home.md", "type: area"),
]);

describe("prefillDraft", () => {
	it("is a loose task with no navigator or an unrelated list", () => {
		expect(prefillDraft(null, index)).toEqual(emptyDraft());
		expect(prefillDraft({ domain: { kind: "logbook" }, selection: agenda.selection }, index)).toEqual(emptyDraft());
		expect(prefillDraft({ domain: { kind: "loose" }, selection: agenda.selection }, index)).toEqual(emptyDraft());
	});

	it("files under the shown project or area", () => {
		const selection = agenda.selection;
		expect(prefillDraft({ domain: { kind: "project", path: "Ta Da/projects/Kombi.md" }, selection }, index).parent).toEqual({ kind: "project", title: "Kombi" });
		expect(prefillDraft({ domain: { kind: "area", path: "Ta Da/areas/Home.md" }, selection }, index).parent).toEqual({ kind: "area", title: "Home" });
		expect(prefillDraft({ domain: { kind: "project", path: "Ta Da/areas/Home.md" }, selection }, index).parent).toBeNull();
		expect(prefillDraft({ domain: { kind: "project", path: "gone.md" }, selection }, index).parent).toBeNull();
	});

	it("tags with the shown tag, in its spelling", () => {
		const draft = prefillDraft({ domain: { kind: "tag", path: "car/kombi" }, selection: agenda.selection }, index);
		expect(draft.tags).toEqual([readTag("Car/Kombi")]);
		expect(prefillDraft({ domain: { kind: "tag", path: null }, selection: agenda.selection }, index).tags).toEqual([]);
	});

	it("makes a task due on the Agenda's selected day, not a week", () => {
		expect(prefillDraft(agenda, index).dueDate?.toString()).toBe("2026-10-14");
		const week = { kind: "week" as const, week: day.isoWeek };
		expect(prefillDraft({ domain: { kind: "agenda" }, selection: week }, index).dueDate).toBeNull();
	});
});

describe("placeDraft", () => {
	const draft = { ...emptyDraft(), title: "Call: Bea" };

	it("puts a task in its folder under its sanitised name", () => {
		expect(placeDraft(draft, [], [])).toEqual({ folder: "Ta Da/tasks", path: "Ta Da/tasks/Call - Bea.md", numbered: false });
	});

	it("numbers a taken name, ignoring case", () => {
		expect(placeDraft(draft, ["call - bea.md"], [])).toEqual({ folder: "Ta Da/tasks", path: "Ta Da/tasks/Call - Bea 2.md", numbered: true });
	});

	it("numbers a project against every project's name, and a task against its folder only", () => {
		expect(placeDraft({ ...draft, kind: "project" }, [], ["Call - Bea.md"]).path).toBe("Ta Da/projects/Call - Bea 2.md");
		expect(placeDraft(draft, [], ["Call - Bea.md"]).numbered).toBe(false);
	});

	it("puts a note at the top level", () => {
		expect(placeDraft({ ...draft, kind: "note" }, [], [])).toEqual({ folder: "", path: "Call - Bea.md", numbered: false });
	});
});

describe("the New task modal's repeat", () => {
	const today = LocalDate.parse("2026-10-14") as LocalDate; // a Wednesday
	const mondays = RepeatRule.parse("every mon") as RepeatRule;
	type Set = (rule: RepeatRule | null, closing: boolean) => void;

	beforeEach(() => {
		picks.length = 0;
		created.length = 0;
	});

	function opened() {
		const app = { vault: { getFolderByPath: () => null }, workspace: { getLeaf: () => ({ openFile: async () => undefined }) } };
		const modal = new NewTaskModal(app as never, { app, index: new VaultIndex([]), today: () => today } as never, emptyDraft());
		modal.open();
		const root = modal.contentEl;
		const click = (selector: string, text?: string) =>
			[...root.querySelectorAll<HTMLElement>(selector)].find((el) => text === undefined || el.textContent === text)?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
		const title = root.querySelector<HTMLInputElement>(".ta-da-new-title") as HTMLInputElement;
		title.value = "Water the plants";
		title.dispatchEvent(new window.Event("input"));
		return {
			modal: modal as unknown as { closed: boolean },
			click,
			/** The due date picker's call: the date it shows and what sets the repeat. */
			picker() {
				click(".ta-da-chip.is-dueDate");
				const [, key, current, , , repeat] = picks[picks.length - 1] as [unknown, string, LocalDate | null, unknown, unknown, { set: Set } | undefined];
				return { key, current: current?.toString() ?? null, set: repeat?.set };
			},
			async create() {
				click(".mod-cta");
				await new Promise((resolve) => setTimeout(resolve));
				return created[created.length - 1]?.text ?? "";
			},
		};
	}

	it("offers the repeat on the due chip of a task, not the deadline chip", () => {
		const modal = opened();
		expect(modal.picker().set).toBeTypeOf("function");
		modal.click(".ta-da-chip.is-deadline");
		expect((picks[picks.length - 1] as unknown[])[5]).toBeUndefined();
	});

	it("sets the due date to the rule's first date when the task has none", () => {
		const modal = opened();
		expect(modal.picker().current).toBeNull();
		(modal.picker().set as Set)(mondays, true);
		expect(modal.picker().current).toBe("2026-10-19");
	});

	it("keeps the picker open and the date where it is for When done", () => {
		const modal = opened();
		(modal.picker().set as Set)(mondays, true);
		(modal.picker().set as Set)(mondays.withWhenDone(true), false);
		expect(modal.picker().current).toBe("2026-10-19");
		expect(modal.modal.closed).toBe(false);
	});

	it("writes the repeat into the created file", async () => {
		const modal = opened();
		(modal.picker().set as Set)(mondays, true);
		const text = await modal.create();
		expect(text).toContain("dueDate: 2026-10-19\nrepeat: every week on Mon\n");
	});

	it("drops it when the draft becomes a project, and when the repeat stops", async () => {
		const project = opened();
		(project.picker().set as Set)(mondays, true);
		project.click(".ta-da-new-kind", "Project");
		expect(await project.create()).not.toContain("repeat");
		const stopped = opened();
		(stopped.picker().set as Set)(mondays, true);
		(stopped.picker().set as Set)(null, true);
		expect(await stopped.create()).not.toContain("repeat");
	});
});
