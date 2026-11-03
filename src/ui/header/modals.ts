import { type App, Modal, SuggestModal, ToggleComponent } from "obsidian";
import { occurrences } from "../../core/index/queries";
import type { VaultIndex } from "../../core/index/vaultIndex";
import type { Item } from "../../core/model/item";
import { LocalDate } from "../../core/model/localDate";
import { RepeatRule } from "../../core/model/repeatRule";
import { firstDate } from "../../core/model/repeatRuleNext";
import { parseDatePhrase, type DayOrder } from "../../core/writing/datePhrase";
import { type ParentChoice, type TagChoice } from "./choices";
import { element, icon } from "./dom";
import { dateLabel, weekdayDayMonth } from "./headerModel";
import { monthTitle } from "../dates";
import { monthGrid, weekdayLetter, weekdayOrder } from "./monthGrid";

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

/** What a task's due date picker adds: the task, for the dates its rule gives, and what writes the rule (null stops it); `closing` when the picker closes with it. */
export interface DateRepeat {
	item: Item;
	index: VaultIndex;
	set(rule: RepeatRule | null, closing: boolean): void;
}

/**
 * A date picker: a typed phrase, quick days and a month grid. Clear shows when a date is set. With `repeat`, a phrase
 * starting with `every` is a rule, the month shows its coming dates, and a Repeat section under it holds Stop, When done
 * and Ends, which swaps the picker to the date the repeat ends.
 */
export class DateModal extends Modal {
	private month: LocalDate;
	private typed: LocalDate | null = null;
	private typedRule: RepeatRule | null = null;
	private rule: RepeatRule | null;
	private ends = false;
	private fieldIcon!: HTMLElement;
	private input!: HTMLInputElement;
	private quick!: HTMLElement;
	private grid!: HTMLElement;
	private title!: HTMLElement;
	private note!: HTMLElement;
	private section!: HTMLElement;

	constructor(
		app: App,
		private readonly heading: string,
		private readonly current: LocalDate | null,
		private readonly today: LocalDate,
		private readonly dayOrder: DayOrder,
		private readonly firstWeekday: number,
		private readonly choose: (date: LocalDate | null) => void,
		private readonly repeat: DateRepeat | null = null,
	) {
		super(app);
		this.month = (current ?? today).startOfMonth;
		this.rule = repeat?.item.properties.repeatRule?.rule ?? null;
	}

	override onOpen(): void {
		const doc = this.contentEl.ownerDocument;
		this.modalEl.classList.add("ta-da-date-modal");
		this.containerEl.classList.add("ta-da-top-modal");
		const root = this.contentEl;
		this.scope.register([], "Escape", () => {
			if (this.input.value !== "") {
				this.input.value = "";
				this.type("");
			} else if (this.ends) {
				this.switchView(false);
			} else {
				this.close();
			}
			return false;
		});

		const field = element(doc, "div", "ta-da-date-field");
		this.fieldIcon = field.appendChild(element(doc, "span", "ta-da-date-field-icon"));
		this.input = element(doc, "input", "ta-da-date-input", undefined, { type: "text" });
		field.appendChild(this.input);
		this.note = element(doc, "span", "ta-da-date-note");
		field.appendChild(this.note);
		root.appendChild(field);
		this.input.addEventListener("input", () => this.type(this.input.value));
		this.input.addEventListener("keydown", (event) => {
			if (event.key !== "Enter") return;
			if (this.ends && this.typed) this.setEnd(this.typed);
			else if (this.typedRule) this.setRule(this.typedRule);
			else if (this.typed && !this.ends) this.pick(this.typed);
			else return;
			event.preventDefault();
		});

		this.quick = element(doc, "div", "ta-da-date-quick");
		root.appendChild(this.quick);

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
		this.section = element(doc, "div", "ta-da-repeat");
		root.appendChild(this.section);
		this.draw();
		this.input.focus();
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	/** The date the month fills as set: the repeat's end in the Ends view, else the date. */
	private get shownDate(): LocalDate | null {
		return this.ends ? (this.rule?.until ?? null) : this.current;
	}

	/** The rule the Repeat section spells out: the one typed, else the one set. */
	private get displayedRule(): RepeatRule | null {
		return this.typedRule ?? this.rule;
	}

	/** The rule the month previews: the displayed one, with the end being typed in the Ends view. */
	private get previewRule(): RepeatRule | null {
		return this.ends && this.rule && this.typed ? this.rule.ending(this.typed) : this.displayedRule;
	}

	/** Where a rule starts, ignoring its end: the due date, else the deadline, else its first date. */
	private startDate(rule: RepeatRule): LocalDate | null {
		return this.current ?? this.repeat?.item.properties.deadline ?? firstDate(rule.ending(null), this.today);
	}

	/** Where a rule starts; null when its end is before that. */
	private start(rule: RepeatRule): LocalDate | null {
		const date = this.startDate(rule);
		return date && (rule.until === null || date.compare(rule.until) <= 0) ? date : null;
	}

	/** Whether a day can be picked: any day, except in the Ends view a day before the repeat starts. */
	private canPick(day: LocalDate | null): boolean {
		if (!this.ends || !day) return true;
		const start = this.rule ? this.startDate(this.rule) : null;
		return start !== null && day.compare(start) >= 0;
	}

	private type(phrase: string): void {
		this.typed = null;
		this.typedRule = null;
		if (phrase.trim() === "") {
			this.note.textContent = "";
		} else if (this.repeat && !this.ends && /^\s*every/i.test(phrase)) {
			const rule = RepeatRule.parse(phrase);
			const start = rule && this.start(rule);
			this.typedRule = start ? rule : null;
			this.note.textContent = start ? `From ${weekdayDayMonth(start)}` : "No match";
			this.month = (this.shownDate ?? this.today).startOfMonth;
		} else {
			this.typed = parseDatePhrase(phrase, this.today, this.dayOrder, this.firstWeekday);
			this.note.textContent = this.typed ? dateLabel(this.typed, this.today) : "No match";
			if (this.typed) this.month = this.typed.startOfMonth;
		}
		this.drawGrid();
		this.drawSection();
	}

	private draw(): void {
		const doc = this.contentEl.ownerDocument;
		const label = this.ends ? "Repeat ends" : this.heading;
		if (this.ends) {
			const back = element(doc, "button", "ta-da-date-back", undefined, { type: "button", "aria-label": label });
			back.appendChild(icon(doc, "chevronLeft", 12, 2.4));
			back.appendChild(element(doc, "span", "", label));
			back.addEventListener("click", () => this.switchView(false));
			this.titleEl.replaceChildren(back);
		} else {
			this.titleEl.setText(this.heading);
		}
		this.fieldIcon.replaceChildren(icon(doc, this.ends ? "repeat" : "calendar", 14));
		this.input.placeholder = this.ends ? "Type an end date: 20 dec, 8w" : this.repeat ? "Type a date or rule: fri, every mon" : "Type a date: fri, 3d, 25/12";
		this.input.setAttribute("aria-label", label);
		this.drawQuick();
		this.drawGrid();
		this.drawSection();
	}

	/** Swaps between the date and the date the repeat ends, with the field emptied. */
	private switchView(ends: boolean): void {
		this.ends = ends;
		this.typed = null;
		this.typedRule = null;
		this.input.value = "";
		this.note.textContent = "";
		this.month = (this.shownDate ?? this.today).startOfMonth;
		this.draw();
		this.input.focus();
	}

	private drawQuick(): void {
		const doc = this.contentEl.ownerDocument;
		this.quick.replaceChildren();
		const days: readonly (readonly [string, LocalDate | null])[] = this.ends
			? [
					["Never", null],
					["In 4 weeks", this.today.addingDays(28)],
					["End of year", LocalDate.of(this.today.year, 12, 31)],
				]
			: [
					["Today", this.today],
					["Tomorrow", this.today.addingDays(1)],
					["Next week", this.today.nextWeek(this.firstWeekday)],
				];
		for (const [label, date] of days) {
			const button = element(doc, "button", "ta-da-date-quick-button", label, { type: "button", title: date ? (this.ends ? weekdayDayMonth(date) : dateLabel(date, this.today)) : "No end date" });
			button.disabled = !this.canPick(date);
			button.addEventListener("click", () => this.pick(date));
			this.quick.appendChild(button);
		}
		if (this.shownDate) {
			const clear = element(doc, "button", "ta-da-date-clear", "Clear", { type: "button" });
			clear.addEventListener("click", () => this.pick(null));
			this.quick.appendChild(clear);
		}
	}

	private drawGrid(): void {
		const doc = this.contentEl.ownerDocument;
		this.title.textContent = monthTitle(this.month);
		this.grid.setAttribute("aria-label", monthTitle(this.month));
		this.grid.classList.toggle("is-ends", this.ends);
		this.grid.replaceChildren();
		const coming = this.occurrenceDays();
		for (const week of monthGrid(this.month, this.firstWeekday)) {
			for (const day of week) {
				const classes = ["ta-da-date-day"];
				const repeats = day.month === this.month.month && coming.has(day.toString());
				if (day.month !== this.month.month) classes.push("is-outside");
				if (day.equals(this.today)) classes.push("is-today");
				if (this.shownDate?.equals(day)) classes.push("is-current");
				if (this.typed?.equals(day)) classes.push("is-typed");
				if (repeats) classes.push("is-occurrence");
				const cell = element(doc, "button", classes.join(" "), String(day.day), {
					type: "button",
					"aria-label": repeats ? `${dateLabel(day, this.today)}, repeats` : dateLabel(day, this.today),
				});
				cell.disabled = !this.canPick(day);
				cell.addEventListener("click", () => this.pick(day));
				this.grid.appendChild(cell);
			}
		}
	}

	/** The days of the month a coming occurrence of the previewed rule falls on, as ↵ would set it. */
	private occurrenceDays(): Set<string> {
		const days = new Set<string>();
		const rule = this.previewRule;
		if (!this.repeat || !rule) return days;
		const { item, index } = this.repeat;
		const p = item.properties;
		const first = this.month.startOfMonth;
		const last = first.addingMonths(1).addingDays(-1);
		let dueDate = p.dueDate;
		let anchor = p.dueDate ?? p.deadline;
		if (!anchor && !p.repeatRule?.rule) {
			const date = firstDate(rule, this.today);
			if (date) {
				dueDate = anchor = date;
				if (date.compare(first) >= 0 && date.compare(last) <= 0) days.add(date.toString());
			}
		}
		const written = rule.anchored(anchor ?? this.today);
		const task: Item = { ...item, properties: { ...p, dueDate, repeatRule: { text: written.phrase, rule: written } } };
		for (const entry of occurrences(index, task, first, last, this.today)) {
			if (!dueDate || entry.kind === "due") days.add(entry.date.toString());
		}
		return days;
	}

	/** Under the month: the Repeat section, or in the Ends view the rule with the end being picked. */
	private drawSection(): void {
		const doc = this.contentEl.ownerDocument;
		this.section.replaceChildren();
		this.section.hidden = !this.repeat;
		this.section.classList.toggle("is-summary", this.ends);
		if (!this.repeat) return;
		const shown = this.previewRule;
		if (this.ends) {
			const line = this.section.appendChild(element(doc, "div", "ta-da-repeat-summary"));
			line.appendChild(icon(doc, "repeat", 12, 2.2));
			line.appendChild(element(doc, "span", "", shown ? this.spelled(shown) : ""));
			return;
		}
		const head = this.section.appendChild(element(doc, "div", "ta-da-repeat-head"));
		head.appendChild(icon(doc, "repeat", 12, 2.2));
		head.appendChild(element(doc, "span", "ta-da-repeat-title", "Repeat"));
		if (this.rule) {
			const stop = head.appendChild(element(doc, "button", "ta-da-date-clear", "Stop", { type: "button" }));
			stop.addEventListener("click", () => this.setRule(null));
		}
		const rule = this.displayedRule;
		if (rule) {
			const text = this.spelled(rule);
			this.section.appendChild(element(doc, "div", `ta-da-repeat-rule${this.typedRule ? " is-preview" : ""}`, text, { title: text }));
		}
		this.section.appendChild(element(doc, "div", "ta-da-repeat-help", "Type repetition rules naturally. They're recognised as you type."));
		if (!this.rule) return;
		const whenDone = this.section.appendChild(element(doc, "div", "ta-da-repeat-row"));
		whenDone.appendChild(element(doc, "span", "", "When done"));
		const toggle = new ToggleComponent(whenDone).setValue(this.rule.whenDone).onChange((on) => this.setWhenDone(on));
		toggle.toggleEl.setAttribute("aria-label", "When done");
		const until = this.rule.until;
		const row = this.section.appendChild(element(doc, "button", "ta-da-repeat-row ta-da-repeat-ends", undefined, { type: "button", "aria-label": "Ends" }));
		row.appendChild(element(doc, "span", "", "Ends"));
		row.appendChild(element(doc, "span", `ta-da-repeat-value${until ? "" : " is-never"}`, until ? weekdayDayMonth(until) : "Never"));
		row.appendChild(icon(doc, "chevronRight", 12, 2.2));
		row.addEventListener("click", () => this.switchView(true));
	}

	/** The rule spelled out, with its end as a date. */
	private spelled(rule: RepeatRule): string {
		return rule.description(weekdayDayMonth);
	}

	/** Switches the rule to count from completion, or back to its schedule. The picker stays open. */
	private setWhenDone(whenDone: boolean): void {
		if (!this.rule || !this.repeat) return;
		this.rule = this.rule.withWhenDone(whenDone);
		this.repeat.set(this.rule, false);
		this.drawGrid();
		this.drawSection();
	}

	/** Sets the rule, or stops the repeat for null. */
	private setRule(rule: RepeatRule | null): void {
		this.repeat?.set(rule, true);
		this.close();
	}

	/** Ends the repeat on `day`, or never for null. A day before the repeat starts is ignored. */
	private setEnd(day: LocalDate | null): void {
		if (this.rule && this.canPick(day)) this.setRule(this.rule.ending(day));
	}

	private pick(date: LocalDate | null): void {
		if (this.ends) {
			this.setEnd(date);
			return;
		}
		this.choose(date);
		this.close();
	}
}
