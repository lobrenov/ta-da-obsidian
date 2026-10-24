import { type App, Modal, SuggestModal } from "obsidian";
import type { LocalDate } from "../../core/model/localDate";
import { parseDatePhrase, type DayOrder } from "../../core/writing/datePhrase";
import { type ParentChoice, type TagChoice } from "./choices";
import { element, icon } from "./dom";
import { dateLabel } from "./headerModel";
import { monthGrid, monthTitle, weekdayLetter, weekdayOrder } from "./monthGrid";

/** The project or area menu: a filtered list with None first and the current choice ticked. */
export class ParentModal extends SuggestModal<ParentChoice> {
	constructor(
		app: App,
		placeholder: string,
		private readonly choices: ParentChoice[],
		private readonly choose: (choice: ParentChoice) => void,
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	getSuggestions(query: string): ParentChoice[] {
		const needle = query.trim().toLowerCase();
		return this.choices.filter((choice) => choice.label.toLowerCase().includes(needle));
	}

	renderSuggestion(choice: ParentChoice, el: HTMLElement): void {
		const doc = el.ownerDocument;
		el.classList.add("ta-da-choice");
		if (choice.parent?.kind === "project") el.classList.add("is-indented");
		if (choice.parent?.kind === "area") el.classList.add("is-area");
		if (choice.parent) el.appendChild(icon(doc, choice.parent.kind === "project" ? "ring" : "cube", 14));
		el.appendChild(element(doc, "span", "ta-da-choice-label", choice.label));
		if (choice.detail) el.appendChild(element(doc, "span", "ta-da-choice-detail", choice.detail));
		if (choice.current) el.appendChild(icon(doc, "check", 13, 2.4));
	}

	onChooseSuggestion(choice: ParentChoice): void {
		this.choose(choice);
	}
}

/** The tag menu: the vault's tags, or the typed one as new. A tag on the file is ticked, and picking it removes it. */
export class TagModal extends SuggestModal<TagChoice> {
	constructor(
		app: App,
		private readonly suggest: (query: string) => TagChoice[],
		private readonly choose: (choice: TagChoice) => void,
	) {
		super(app);
		this.setPlaceholder("Add or remove a tag");
		this.emptyStateText = "No tags. Type a name to add one.";
	}

	getSuggestions(query: string): TagChoice[] {
		return this.suggest(query);
	}

	renderSuggestion(choice: TagChoice, el: HTMLElement): void {
		const doc = el.ownerDocument;
		el.classList.add("ta-da-choice");
		el.appendChild(icon(doc, "tag", 13));
		el.appendChild(element(doc, "span", "ta-da-choice-label", choice.isNew ? `Add #${choice.name}` : `#${choice.name}`));
		if (choice.current) el.appendChild(icon(doc, "check", 13, 2.4));
	}

	onChooseSuggestion(choice: TagChoice): void {
		this.choose(choice);
	}
}

/** A date picker: a typed phrase, quick days and a month grid. Clear shows when a date is set. */
export class DateModal extends Modal {
	private month: LocalDate;
	private typed: LocalDate | null = null;
	private grid!: HTMLElement;
	private title!: HTMLElement;
	private note!: HTMLElement;

	constructor(
		app: App,
		private readonly heading: string,
		private readonly current: LocalDate | null,
		private readonly today: LocalDate,
		private readonly dayOrder: DayOrder,
		private readonly firstWeekday: number,
		private readonly choose: (date: LocalDate | null) => void,
	) {
		super(app);
		this.month = (current ?? today).startOfMonth;
	}

	override onOpen(): void {
		const doc = this.contentEl.ownerDocument;
		this.modalEl.classList.add("ta-da-date-modal");
		this.titleEl.setText(this.heading);
		const root = this.contentEl;

		const field = element(doc, "div", "ta-da-date-field");
		field.appendChild(icon(doc, "calendar", 14));
		const input = element(doc, "input", "ta-da-date-input", undefined, { type: "text", placeholder: "Type a date: fri, 3d, 25/12", "aria-label": this.heading });
		field.appendChild(input);
		this.note = element(doc, "span", "ta-da-date-note");
		field.appendChild(this.note);
		root.appendChild(field);
		input.addEventListener("input", () => {
			this.typed = parseDatePhrase(input.value, this.today, this.dayOrder, this.firstWeekday);
			if (input.value.trim() === "") this.note.textContent = "";
			else this.note.textContent = this.typed ? dateLabel(this.typed, this.today) : "No match";
			if (this.typed) this.month = this.typed.startOfMonth;
			this.drawGrid();
		});
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && this.typed) {
				event.preventDefault();
				this.pick(this.typed);
			}
		});

		const quick = element(doc, "div", "ta-da-date-quick");
		for (const [label, date] of [
			["Today", this.today],
			["Tomorrow", this.today.addingDays(1)],
			["Next week", this.today.nextWeek(this.firstWeekday)],
		] as const) {
			const button = element(doc, "button", "ta-da-date-quick-button", label, { type: "button", title: dateLabel(date, this.today) });
			button.addEventListener("click", () => this.pick(date));
			quick.appendChild(button);
		}
		if (this.current) {
			const clear = element(doc, "button", "ta-da-date-clear", "Clear", { type: "button" });
			clear.addEventListener("click", () => this.pick(null));
			quick.appendChild(clear);
		}
		root.appendChild(quick);

		const nav = element(doc, "div", "ta-da-date-nav");
		this.title = element(doc, "span", "ta-da-date-month");
		nav.appendChild(this.title);
		for (const [label, name, step] of [
			["Previous month", "chevronLeft", -1],
			["Next month", "chevronRight", 1],
		] as const) {
			const button = element(doc, "button", "ta-da-date-step", undefined, { type: "button", "aria-label": label });
			button.appendChild(icon(doc, name, 12, 2.2));
			button.addEventListener("click", () => {
				this.month = this.month.addingMonths(step);
				this.drawGrid();
			});
			nav.appendChild(button);
		}
		root.appendChild(nav);

		const letters = element(doc, "div", "ta-da-date-weekdays", undefined, { "aria-hidden": "true" });
		for (const weekday of weekdayOrder(this.firstWeekday)) letters.appendChild(element(doc, "span", "", weekdayLetter(weekday)));
		root.appendChild(letters);
		this.grid = element(doc, "div", "ta-da-date-grid", undefined, { role: "grid" });
		root.appendChild(this.grid);
		this.drawGrid();
		input.focus();
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private drawGrid(): void {
		const doc = this.contentEl.ownerDocument;
		this.title.textContent = monthTitle(this.month);
		this.grid.setAttribute("aria-label", monthTitle(this.month));
		this.grid.replaceChildren();
		for (const week of monthGrid(this.month, this.firstWeekday)) {
			for (const day of week) {
				const classes = ["ta-da-date-day"];
				if (day.month !== this.month.month) classes.push("is-outside");
				if (day.equals(this.today)) classes.push("is-today");
				if (this.current?.equals(day)) classes.push("is-current");
				if (this.typed?.equals(day)) classes.push("is-typed");
				const cell = element(doc, "button", classes.join(" "), String(day.day), { type: "button", "aria-label": dateLabel(day, this.today) });
				cell.addEventListener("click", () => this.pick(day));
				this.grid.appendChild(cell);
			}
		}
	}

	private pick(date: LocalDate | null): void {
		this.choose(date);
		this.close();
	}
}
