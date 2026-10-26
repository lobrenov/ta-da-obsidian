import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../../src/core/index/vaultIndex";
import { LocalDate } from "../../src/core/model/localDate";
import type { RepeatRule } from "../../src/core/model/repeatRule";
import { makeItem } from "../support";

// jsdom's window by hand: the jsdom environment can't resolve a mocked "obsidian".
const { dom } = await vi.hoisted(async () => ({ dom: new (await import("jsdom")).JSDOM("") }));
const { document, window } = dom.window;
vi.mock("obsidian", () => ({
	SuggestModal: class {},
	ToggleComponent: class {
		toggleEl = document.createElement("input");
		constructor(parent: HTMLElement) {
			this.toggleEl.type = "checkbox";
			parent.appendChild(this.toggleEl);
		}
		setValue(on: boolean): this {
			this.toggleEl.checked = on;
			return this;
		}
		onChange(change: (on: boolean) => void): this {
			this.toggleEl.addEventListener("change", () => change(this.toggleEl.checked));
			return this;
		}
	},
	Modal: class {
		contentEl = Object.assign(document.createElement("div"), { win: window, empty() {} });
		modalEl = document.createElement("div");
		titleEl = Object.assign(document.createElement("div"), {
			setText(this: HTMLElement, text: string) {
				this.textContent = text;
			},
		});
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

const { DateModal } = await import("../../src/ui/header/modals");

const today = LocalDate.parse("2026-10-02") as LocalDate; // a Friday
const day = (text: string): LocalDate => LocalDate.parse(text) as LocalDate;

const sets: { rule: string | null; closing: boolean; until?: string }[] = [];
const chosen: (string | null)[] = [];

/** Opens the due date picker on a task with `frontmatter`; `due` is the date it shows as set. */
function opened(frontmatter: string, due: string | null = null, repeating = true) {
	const item = makeItem("Ta Da/tasks/X.md", `type: task\n${frontmatter}`);
	const index = new VaultIndex([item]);
	const repeat = repeating
		? {
				item,
				index,
				set: (rule: RepeatRule | null, closing: boolean) => void sets.push({ rule: rule?.phrase ?? null, closing, until: rule?.until?.toString() }),
			}
		: null;
	const modal = new DateModal({} as never, "Due date", due ? day(due) : null, today, "dayMonth", 2, (date) => void chosen.push(date?.toString() ?? null), repeat);
	modal.open();
	const root = modal.contentEl;
	const input = root.querySelector<HTMLInputElement>(".ta-da-date-input") as HTMLInputElement;
	return {
		modal: modal as unknown as { closed: boolean; titleEl: HTMLElement },
		root,
		input,
		type(text: string) {
			input.value = text;
			input.dispatchEvent(new window.Event("input"));
		},
		enter() {
			input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
		},
		click(selector: string, text?: string) {
			const found = [...root.querySelectorAll<HTMLElement>(selector)].find((el) => text === undefined || el.textContent === text);
			if (!found) throw new Error(`No ${selector} ${text ?? ""}`);
			found.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
		},
		text: (selector: string) => root.querySelector(selector)?.textContent ?? null,
		days: (selector: string) => [...root.querySelectorAll(`.ta-da-date-day${selector}`)].map((el) => el.textContent),
	};
}

beforeEach(() => {
	sets.length = 0;
	chosen.length = 0;
});

describe("the date picker with a Repeat section", () => {
	it("prompts for a date or a rule, and without a repeat for a date alone", () => {
		expect(opened("").input.placeholder).toBe("Type a date or rule: fri, every mon");
		expect(opened("", null, false).input.placeholder).toBe("Type a date: fri, 3d, 25/12");
	});

	it("reads a date phrase as a date and sets it with ↵", () => {
		const picker = opened("");
		picker.type("fri");
		expect(picker.text(".ta-da-date-note")).toBe("Today");
		expect(picker.root.querySelector(".ta-da-repeat-rule")).toBeNull();
		picker.enter();
		expect(chosen).toEqual(["2026-10-02"]);
		expect(sets).toEqual([]);
	});

	it("reads a phrase starting with every as a rule as it's typed, spelled out and muted", () => {
		const picker = opened("");
		picker.type("every mon");
		expect(picker.text(".ta-da-date-note")).toBe("From Mon 5 Oct");
		expect(picker.text(".ta-da-repeat-rule")).toBe("Every week on Monday");
		expect(picker.root.querySelector(".ta-da-repeat-rule")?.classList.contains("is-preview")).toBe(true);
		expect(picker.days(".is-occurrence")).toEqual(["5", "12", "19", "26"]);
		expect(picker.root.querySelector(".ta-da-repeat-row")).toBeNull();
	});

	it("says no match for a phrase that isn't a rule", () => {
		const picker = opened("");
		picker.type("every nonsense");
		expect(picker.text(".ta-da-date-note")).toBe("No match");
		picker.enter();
		expect(sets).toEqual([]);
		expect(picker.modal.closed).toBe(false);
	});

	it("sets the rule with ↵ and closes", () => {
		const picker = opened("");
		picker.type("every mon");
		picker.enter();
		expect(sets).toEqual([{ rule: "every week on Mon", closing: true, until: undefined }]);
		expect(chosen).toEqual([]);
		expect(picker.modal.closed).toBe(true);
	});

	it("starts a rule from the task's due date, not today", () => {
		const picker = opened("dueDate: 2026-10-20", "2026-10-20");
		picker.type("every 3 days");
		expect(picker.text(".ta-da-date-note")).toBe("From Tue 20 Oct");
		expect(picker.days(".is-occurrence")).toEqual(["23", "26", "29"]);
	});

	it("shows a set rule's coming dates, stopping at until", () => {
		const picker = opened("dueDate: 2026-10-05\nrepeat: every week on Mon until 2026-10-19", "2026-10-05");
		expect(picker.text(".ta-da-repeat-rule")).toBe("Every week on Monday until Mon 19 Oct");
		expect(picker.root.querySelector(".ta-da-repeat-rule")?.classList.contains("is-preview")).toBe(false);
		expect(picker.days(".is-occurrence")).toEqual(["12", "19"]);
	});

	it("shows Stop, When done and Ends only once a rule is set, with the helper text always", () => {
		const none = opened("");
		expect(none.text(".ta-da-repeat-help")).toBe("Type repetition rules naturally. They're recognised as you type.");
		expect(none.root.querySelector(".ta-da-date-clear")).toBeNull();
		expect(none.root.querySelector(".ta-da-repeat-ends")).toBeNull();
		const set = opened("dueDate: 2026-10-05\nrepeat: every week", "2026-10-05");
		expect(set.text(".ta-da-repeat-head .ta-da-date-clear")).toBe("Stop");
		expect(set.text(".ta-da-repeat-ends")).toBe("EndsNever");
	});

	it("has no section without a repeat", () => {
		const picker = opened("", null, false);
		expect((picker.root.querySelector(".ta-da-repeat") as HTMLElement).hidden).toBe(true);
		picker.type("every mon");
		expect(picker.text(".ta-da-date-note")).toBe("No match");
	});

	it("stops the repeat and closes", () => {
		const picker = opened("dueDate: 2026-10-05\nrepeat: every week", "2026-10-05");
		picker.click(".ta-da-repeat-head .ta-da-date-clear");
		expect(sets).toEqual([{ rule: null, closing: true, until: undefined }]);
		expect(picker.modal.closed).toBe(true);
	});

	it("switches When done and stays open", () => {
		const picker = opened("dueDate: 2026-10-05\nrepeat: every week", "2026-10-05");
		const toggle = picker.root.querySelector<HTMLInputElement>('.ta-da-repeat-row input[type="checkbox"]') as HTMLInputElement;
		expect(toggle.checked).toBe(false);
		toggle.checked = true;
		toggle.dispatchEvent(new window.Event("change"));
		expect(sets).toEqual([{ rule: "every week when done", closing: false, until: undefined }]);
		expect(picker.modal.closed).toBe(false);
		expect(picker.text(".ta-da-repeat-rule")).toBe("Every week when done");
	});
});

describe("the Ends view", () => {
	const ends = () => {
		const picker = opened("dueDate: 2026-10-05\nrepeat: every week on Mon", "2026-10-05");
		picker.click(".ta-da-repeat-ends");
		return picker;
	};

	it("swaps to the end date with a back control, its own prompt and the end choices", () => {
		const picker = ends();
		expect(picker.modal.titleEl.textContent).toBe("Repeat ends");
		expect(picker.input.placeholder).toBe("Type an end date: 20 dec, 8w");
		expect([...picker.root.querySelectorAll(".ta-da-date-quick-button")].map((el) => el.textContent)).toEqual(["Never", "In 4 weeks", "End of year"]);
		expect(picker.text(".ta-da-repeat-summary")).toBe("Every week on Monday");
		expect(picker.root.querySelector(".ta-da-repeat-head")).toBeNull();
	});

	it("goes back to the due date", () => {
		const picker = ends();
		picker.modal.titleEl.querySelector<HTMLElement>(".ta-da-date-back")?.dispatchEvent(new window.MouseEvent("click"));
		expect(picker.modal.titleEl.textContent).toBe("Due date");
		expect(picker.input.placeholder).toBe("Type a date or rule: fri, every mon");
		expect(picker.root.querySelector(".ta-da-repeat-head")).not.toBeNull();
	});

	it("writes the end from a quick choice, closing", () => {
		const picker = ends();
		picker.click(".ta-da-date-quick-button", "In 4 weeks");
		expect(sets).toEqual([{ rule: "every week on Mon until 2026-10-30", closing: true, until: "2026-10-30" }]);
		expect(picker.modal.closed).toBe(true);
	});

	it("writes End of year, and Never for a rule that has an end", () => {
		ends().click(".ta-da-date-quick-button", "End of year");
		expect(sets.at(-1)?.until).toBe("2026-12-31");
		const picker = opened("dueDate: 2026-10-05\nrepeat: every week on Mon until 2026-12-01", "2026-10-05");
		picker.click(".ta-da-repeat-ends");
		picker.click(".ta-da-date-quick-button", "Never");
		expect(sets.at(-1)).toEqual({ rule: "every week on Mon", closing: true, until: undefined });
	});

	it("reads a typed end date, previews it, and sets it with ↵", () => {
		const picker = ends();
		picker.type("20 dec");
		expect(picker.text(".ta-da-date-note")).toBe("Sun 20 Dec");
		expect(picker.text(".ta-da-repeat-summary")).toBe("Every week on Monday until Sun 20 Dec");
		picker.enter();
		expect(sets).toEqual([{ rule: "every week on Mon until 2026-12-20", closing: true, until: "2026-12-20" }]);
	});

	it("reads weeks as a typed end", () => {
		const picker = ends();
		picker.type("8w");
		picker.enter();
		expect(sets[0]?.until).toBe("2026-11-27");
	});

	it("doesn't read every as a rule", () => {
		const picker = ends();
		picker.type("every mon");
		expect(picker.text(".ta-da-date-note")).toBe("No match");
		picker.enter();
		expect(sets).toEqual([]);
	});

	it("picks a day on the month, and can't end before the repeat starts", () => {
		const picker = ends();
		const before = [...picker.root.querySelectorAll<HTMLButtonElement>(".ta-da-date-day")].find((el) => el.textContent === "2" && !el.classList.contains("is-outside"));
		expect(before?.disabled).toBe(true);
		picker.click(".ta-da-date-day:not(.is-outside)", "28");
		expect(sets[0]?.until).toBe("2026-10-28");
	});

	it("shows the end as the set day, and Clear when there is one", () => {
		const picker = opened("dueDate: 2026-10-05\nrepeat: every week on Mon until 2026-10-19", "2026-10-05");
		picker.click(".ta-da-repeat-ends");
		expect(picker.days(".is-current")).toEqual(["19"]);
		picker.click(".ta-da-date-clear");
		expect(sets).toEqual([{ rule: "every week on Mon", closing: true, until: undefined }]);
	});
});
