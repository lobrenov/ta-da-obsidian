import { debounce, ItemView, Keymap, Menu, Platform, setIcon, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type { Grouping } from "../../core/index/grouping";
import type { LocalDate } from "../../core/model/localDate";
import type { TrashedItem } from "../../core/storage/trash";
import type { TaDaIndex } from "../../TaDaIndex";
import { readTrash } from "../../TaDaTrash";
import type { Writer } from "../../Writer";
import { agendaOn, type AgendaState, type StripModel, readAgenda, rolledOver, stepSelection, writeAgenda } from "./agenda";
import type { StatusActions } from "../statusActions";
import { localToday } from "../dates";
import { drawCheckbox, drawIcon, metaIcon } from "./dom";
import {
	type Domain,
	domainKey,
	groupChoices,
	type GroupedList,
	groupedListOf,
	type Groupings,
	readDomain,
	readGroupings,
	sameDomain,
} from "./domain";
import { buildList, type ListContext, type ListModel, type SectionHeader, type SectionModel, visiblePaths } from "./listModel";
import { ancestorsOf, buildNav, type NavItem } from "./navModel";
import type { AgendaDayRowModel, ArchiveRowModel, ListRow, NoteRowModel, OccurrenceRowModel, ParentRowModel, PeriodNoteRowModel, TaskRowModel } from "./rows";
import { createPeriodNote } from "./periodNotes";
import { moveSelection } from "./selection";
import type { NewTaskContext } from "../newTask/prefill";
import type { NavigatorSettings } from "./navigatorSettings";
import { defaultDomain, offersDomain, type ViewKind, viewSpecs } from "./views";

/** The width below which one pane shows at a time; the same as the container query in `styles.css`. */
const narrowBelow = 520;

export interface NavigatorDeps {
	taDaIndex: TaDaIndex;
	writer: Writer;
	status: StatusActions;
	settings: NavigatorSettings;
	/** Opens the New task window, filled from what the view shows; each view's header button. */
	newTask: (context: NewTaskContext) => void;
}

const noPicked: ReadonlySet<string> = new Set();

/**
 * One of the Ta Da views in a sidebar leaf. Agenda is a list pane; Tasks and Tags are a navigation pane (search and
 * the view's rows) beside a list pane. The models in `listModel.ts` and `navModel.ts` decide what's shown; this class
 * draws them.
 */
export class NavigatorView extends ItemView {
	private domain: Domain;
	private agenda: AgendaState = agendaOn(localToday());
	private groupings: Groupings = {};
	/** The tags picked in each list's filter, for the session. */
	private readonly picked = new Map<string, Set<string>>();
	private readonly folds = new Set<string>();
	private readonly expanded = new Set<string>();
	private query = "";
	private selected: string | null = null;
	private trash: TrashedItem[] = [];
	private today: LocalDate = localToday();
	private paths: string[] = [];
	private lastKey = "";
	private opened = false;
	private closed = false;
	/** `.trash/` changed since it was last read. */
	private trashStale = true;
	private readonly scheduleTrash = debounce(() => void this.refreshTrash(), 1000, true);
	/** In the narrow layout, whether the list pane (not the navigation pane) is showing. */
	private showingList: boolean;
	private readonly rowEls = new Map<string, HTMLElement[]>();

	/** Null in the Agenda, which has no navigation pane. */
	private searchEl: HTMLInputElement | null = null;
	private navBodyEl: HTMLElement | null = null;
	private listPaneEl!: HTMLElement;
	private listHeadEl!: HTMLElement;
	private listBodyEl!: HTMLElement;
	private collapseEl: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly deps: NavigatorDeps,
		readonly kind: ViewKind,
	) {
		super(leaf);
		this.navigation = false;
		this.domain = defaultDomain(kind);
		this.showingList = kind === "agenda";
	}

	override getViewType(): string {
		return viewSpecs[this.kind].type;
	}

	override getDisplayText(): string {
		return viewSpecs[this.kind].title;
	}

	override getIcon(): string {
		return viewSpecs[this.kind].icon;
	}

	/**
	 * The view class for `kind`. Obsidian's `View` constructor asks for the type before `kind` is set, so each kind's
	 * class answers from its own closure.
	 */
	static of(kind: ViewKind): new (leaf: WorkspaceLeaf, deps: NavigatorDeps) => NavigatorView {
		const spec = viewSpecs[kind];
		return class extends NavigatorView {
			constructor(leaf: WorkspaceLeaf, deps: NavigatorDeps) {
				super(leaf, deps, kind);
			}

			override getViewType(): string {
				return spec.type;
			}

			override getDisplayText(): string {
				return spec.title;
			}

			override getIcon(): string {
				return spec.icon;
			}
		};
	}

	override getState(): Record<string, unknown> {
		return { domain: this.domain, groupings: this.groupings, agenda: writeAgenda(this.agenda) };
	}

	override async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const saved = (typeof state === "object" && state !== null ? state : {}) as { domain?: unknown; groupings?: unknown; agenda?: unknown };
		const domain = readDomain(saved.domain);
		if (domain && offersDomain(this.kind, domain)) this.domain = domain;
		this.groupings = readGroupings(saved.groupings);
		this.agenda = readAgenda(saved.agenda, localToday());
		await super.setState(state, result);
		if (this.opened) this.refresh();
	}

	override async onOpen(): Promise<void> {
		// Every listener is added before the first await, so closing the view during one removes them all.
		this.build();
		this.applyCollapse();
		this.register(
			this.deps.settings.onChange(() => {
				this.applyCollapse();
				this.refresh();
			}),
		);
		this.register(this.deps.taDaIndex.onChange(() => this.refresh()));
		this.registerEvent(this.app.workspace.on("file-open", (file) => this.select(file?.path ?? null, true)));
		this.registerEvent(
			this.app.vault.on("delete", () => {
				this.trashStale = true;
				this.maybeRefreshTrash();
			}),
		);
		this.register(() => this.scheduleTrash.cancel());
		this.registerInterval(window.setInterval(() => this.rollOver(), 60_000));
		this.selected = this.app.workspace.getActiveFile()?.path ?? null;
		await this.deps.taDaIndex.ready;
		if (this.closed) return;
		this.opened = true;
		if (this.kind === "tasks") await this.refreshTrash();
		else this.refresh();
	}

	override async onClose(): Promise<void> {
		this.closed = true;
		this.opened = false;
	}

	// Structure

	/** The panes' frames, drawn once. The navigation body, list header and list body are redrawn as the index changes. */
	private build(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("ta-da-navigator", `is-${this.kind}`);
		if (Platform.isPhone) root.addClass("is-phone");

		if (this.kind !== "agenda") {
			const nav = root.createDiv({ cls: "ta-da-nav-pane" });
			const search = nav.createDiv({ cls: "search-input-container ta-da-search" });
			const searchEl = search.createEl("input", { attr: { type: "search", placeholder: "Search tasks and projects", spellcheck: "false" } });
			searchEl.addEventListener("input", () => this.search(searchEl.value));
			searchEl.addEventListener("keydown", (event) => this.onSearchKey(event));
			this.searchEl = searchEl;
			this.navBodyEl = nav.createDiv({ cls: "ta-da-nav-body" });
		}

		this.listPaneEl = root.createDiv({ cls: "ta-da-list-pane", attr: { tabindex: "0" } });
		this.listPaneEl.addEventListener("keydown", (event) => this.onListKey(event));
		this.listHeadEl = this.listPaneEl.createDiv({ cls: "ta-da-list-head" });
		this.listBodyEl = this.listPaneEl.createDiv({ cls: "ta-da-list-body" });

		this.addAction("plus", "New task", () => this.deps.newTask(this.newTaskContext()));
		if (this.kind === "agenda") return;
		this.collapseEl = this.addAction("panel-left-close", "Hide list pane", () => {
			void this.deps.settings.update({ collapseListPane: !this.deps.settings.data.collapseListPane });
		});
	}

	/** On a phone, shows the search field above search results. */
	private updatePhone(): void {
		if (Platform.isPhone) this.contentEl.toggleClass("is-searching", this.query.trim() !== "");
	}

	/** Back to the navigation pane, clearing a search. */
	private back(): void {
		this.clearSearch();
		this.showingList = false;
		this.maybeRefreshTrash();
		this.refresh();
	}

	private clearSearch(): void {
		this.query = "";
		if (this.searchEl) this.searchEl.value = "";
	}

	private applyCollapse(): void {
		if (!this.collapseEl) return;
		const collapsed = this.deps.settings.data.collapseListPane;
		this.contentEl.toggleClass("is-list-collapsed", collapsed);
		setIcon(this.collapseEl, collapsed ? "panel-left-open" : "panel-left-close");
		this.collapseEl.setAttribute("aria-label", collapsed ? "Show list pane" : "Hide list pane");
	}

	// Data

	/** The domain the list pane shows: the search, while the field has text. */
	private effectiveDomain(): Domain {
		return this.query.trim() === "" ? this.domain : { kind: "search", query: this.query };
	}

	/** What a new task is prefilled from: the list shown, and the Agenda's selection. */
	newTaskContext(): { domain: Domain; selection: AgendaState["selection"] } {
		return { domain: this.effectiveDomain(), selection: this.agenda.selection };
	}

	private context(): ListContext {
		const { dailyNotes } = this.deps.settings;
		return { index: this.deps.taDaIndex.index, today: this.today, trash: this.trash, agenda: this.agenda, notes: { names: this.deps.settings.names, weekNotes: dailyNotes.weekNotes } };
	}

	/** Whether the Trash count or list is on screen: in Tasks, the navigation pane shows when wide, or when the list isn't showing. */
	private wantsTrash(): boolean {
		return this.kind === "tasks" && (this.domain.kind === "trash" || !this.showingList || this.contentEl.clientWidth >= narrowBelow);
	}

	/** Reads `.trash/` later, if it changed and something on screen shows it. */
	private maybeRefreshTrash(): void {
		if (this.trashStale && this.opened && this.wantsTrash()) this.scheduleTrash();
	}

	private async refreshTrash(): Promise<void> {
		if (this.closed) return;
		this.trashStale = false;
		const trash = await readTrash(this.app.vault.adapter);
		if (this.closed) return;
		this.trash = trash;
		this.refresh();
	}

	/** Redraws both panes from the index. */
	private refresh(): void {
		if (!this.opened) return;
		const today = localToday();
		if (!today.equals(this.today)) this.agenda = { ...this.agenda, selection: rolledOver(this.agenda.selection, this.today, today) };
		this.today = today;
		const ctx = this.context();
		const domain = this.effectiveDomain();
		const options = { groupings: this.groupings, picked: this.picked.get(domainKey(domain)) ?? noPicked, folds: this.folds };
		let list = buildList(domain, ctx, options);
		if (!list) {
			this.domain = defaultDomain(this.kind);
			list = buildList(this.domain, ctx, { ...options, picked: noPicked });
		}
		if (!list) return;
		this.contentEl.toggleClass("is-showing-list", this.showingList);
		this.updatePhone();
		if (this.navBodyEl) this.renderNav(this.navBodyEl, ctx);
		this.renderList(list);
	}

	/** Redraws once the date changes. */
	private rollOver(): void {
		if (!localToday().equals(this.today)) this.refresh();
	}

	private save(): void {
		void this.app.workspace.requestSaveLayout();
	}

	// Actions

	private show(domain: Domain): void {
		this.domain = domain;
		this.clearSearch();
		this.showingList = true;
		this.maybeRefreshTrash();
		for (const id of ancestorsOf(domain)) this.expanded.add(id);
		this.lastKey = "";
		this.refresh();
		this.save();
	}

	private search(query: string): void {
		this.query = query;
		if (query.trim() !== "" && !Platform.isPhone) this.showingList = true;
		this.refresh();
	}

	/**
	 * Opens a file as the file explorer does. A click or a new tab or split makes the opened leaf active. A key press
	 * leaves focus in the list and announces the file with `file-open`, so Outline, Backlinks and Properties follow.
	 */
	private openPath(path: string, event?: MouseEvent | KeyboardEvent): void {
		const file = this.app.vault.getFileByPath(path);
		if (!file) return;
		this.select(path, false);
		const newLeaf = event ? Keymap.isModEvent(event) : false;
		const fromKey = event instanceof KeyboardEvent && !newLeaf;
		void this.app.workspace
			.getLeaf(newLeaf)
			.openFile(file, { active: !fromKey })
			.then(() => {
				if (fromKey) this.app.workspace.trigger("file-open", file);
			});
	}

	/** Highlights a path's rows, which follows the active file. */
	private select(path: string | null, scroll: boolean): void {
		if (this.selected !== null) for (const el of this.rowEls.get(this.selected) ?? []) el.removeClass("is-selected");
		this.selected = path;
		const rows = path === null ? [] : (this.rowEls.get(path) ?? []);
		for (const el of rows) el.addClass("is-selected");
		if (scroll) rows[0]?.scrollIntoView({ block: "nearest" });
	}

	private toggleFold(id: string): void {
		if (this.folds.has(id)) this.folds.delete(id);
		else this.folds.add(id);
		this.refresh();
	}

	private pick(tagPath: string, on: boolean): void {
		const key = domainKey(this.effectiveDomain());
		const set = new Set(this.picked.get(key) ?? []);
		if (on) set.add(tagPath);
		else set.delete(tagPath);
		this.picked.set(key, set);
		this.refresh();
	}

	private setGrouping(grouping: Grouping): void {
		const list = this.currentList();
		if (!list) return;
		this.groupings = { ...this.groupings, [list]: grouping };
		this.refresh();
		this.save();
	}

	private currentList(): GroupedList | null {
		return groupedListOf(this.domain);
	}

	/** Changes the Agenda's day or week, or its month, and keeps it. */
	private setAgenda(change: Partial<AgendaState>): void {
		this.agenda = { ...this.agenda, ...change };
		this.refresh();
		this.save();
	}

	private stepAgenda(offset: number, byMonth = this.agenda.monthOpen): void {
		this.setAgenda({ selection: stepSelection(this.agenda.selection, offset, byMonth) });
	}

	private toggleTask(row: TaskRowModel): void {
		const file = this.app.vault.getFileByPath(row.path);
		if (file) this.deps.status.set(file, row.closed ? "Not Started" : "Done");
	}

	/** Obsidian's file menu for a row's file, with the items plugins add to it. */
	private fileMenu(path: string, event: MouseEvent): void {
		const file = this.app.vault.getFileByPath(path);
		if (!file) return;
		event.preventDefault();
		const menu = new Menu();
		this.app.workspace.trigger("file-menu", menu, file, "ta-da", this.leaf);
		menu.showAtMouseEvent(event);
	}

	// Keys

	private onListKey(event: KeyboardEvent): void {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			this.move(event.key === "ArrowDown" ? 1 : -1);
		} else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && this.domain.kind === "agenda" && this.query.trim() === "") {
			event.preventDefault();
			this.stepAgenda(event.key === "ArrowRight" ? 1 : -1, false);
		} else if (event.key === "Enter" && this.selected !== null && this.paths.includes(this.selected)) {
			event.preventDefault();
			this.openPath(this.selected, event);
		}
	}

	private onSearchKey(event: KeyboardEvent): void {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			this.listPaneEl.focus();
			this.move(1);
		} else if (event.key === "Escape" && this.query !== "") {
			event.preventDefault();
			this.clearSearch();
			this.refresh();
		}
	}

	private move(delta: 1 | -1): void {
		const next = moveSelection(this.paths, this.selected, delta);
		if (next !== null) this.select(next, true);
	}

	// Navigation pane

	private renderNav(body: HTMLElement, ctx: ListContext): void {
		if (this.kind === "agenda") return;
		body.empty();
		const active = this.query.trim() === "" ? this.domain : null;
		if (this.kind === "tags") {
			// As Obsidian's file tree: a child sits in its parent's `tree-item-children`, which indents it.
			const levels = [body];
			for (const item of buildNav(ctx, this.kind, this.expanded)) {
				const outer = this.navRow(levels[item.depth] ?? body, item, active !== null && sameDomain(item.domain, active), false);
				levels[item.depth + 1] = outer.createDiv({ cls: "tree-item-children" });
			}
			return;
		}
		for (const item of buildNav(ctx, this.kind, this.expanded)) {
			const outer = this.navRow(body, item, active !== null && sameDomain(item.domain, active), true);
			outer.addClass("ta-da-nav-item");
			(outer.firstElementChild as HTMLElement).style.setProperty("--ta-da-depth", String(item.depth));
		}
	}

	/** A row in Obsidian's tree markup; `icon` adds the item's icon before its name. Returns the row's `tree-item`. */
	private navRow(parent: HTMLElement, item: NavItem, active: boolean, icon: boolean): HTMLElement {
		const outer = parent.createDiv({ cls: `tree-item${item.gap ? " has-gap" : ""}` });
		const self = outer.createDiv({ cls: `tree-item-self is-clickable${active ? " is-active" : ""}${item.expanded !== null ? " mod-collapsible" : ""}` });
		if (item.expanded !== null) {
			const chevron = self.createDiv({ cls: `tree-item-icon collapse-icon${item.expanded ? "" : " is-collapsed"}` });
			setIcon(chevron, "right-triangle");
			chevron.addEventListener("click", (event) => {
				event.stopPropagation();
				if (this.expanded.has(item.id)) this.expanded.delete(item.id);
				else this.expanded.add(item.id);
				this.refresh();
			});
		}
		if (icon) drawIcon(self.createDiv({ cls: "ta-da-nav-icon" }), item.icon);
		self.createDiv({ cls: `tree-item-inner${item.strong ? " is-strong" : ""}`, text: item.label });
		if (item.count !== null && item.count > 0) self.createDiv({ cls: "tree-item-flair-outer" }).createSpan({ cls: "tree-item-flair", text: String(item.count) });
		self.addEventListener("click", () => this.show(item.domain));
		return outer;
	}

	// List pane

	private renderList(list: ListModel): void {
		const key = domainKey(list.domain);
		const scrollTop = key === this.lastKey ? this.listBodyEl.scrollTop : 0;
		this.lastKey = key;
		this.paths = visiblePaths(list);
		this.renderHead(list);
		const body = this.listBodyEl;
		body.empty();
		this.rowEls.clear();
		if (list.empty !== null) body.createDiv({ cls: "ta-da-empty", text: list.empty });
		for (const section of list.sections) this.renderSection(body, section, list);
		body.scrollTop = scrollTop;
		if (this.selected !== null) for (const el of this.rowEls.get(this.selected) ?? []) el.addClass("is-selected");
	}

	private renderHead(list: ListModel): void {
		const head = this.listHeadEl;
		head.empty();
		const { header } = list;
		const title = head.createDiv({ cls: "ta-da-list-title-row" });
		if (this.kind !== "agenda") {
			this.iconButton(title, "chevron-left", "Back", () => this.back());
			title.lastElementChild?.addClass("ta-da-list-back");
		}
		drawIcon(title.createSpan({ cls: "ta-da-list-title-icon" }), header.icon);
		title.createEl("h2", { cls: "ta-da-list-title", text: header.title });
		if (header.detail) title.createSpan({ cls: "ta-da-list-detail", text: header.detail });
		if (list.strip) {
			this.renderStrip(head, title, list.strip);
			return;
		}
		const actions = title.createDiv({ cls: "ta-da-list-actions" });
		const file = header.file;
		if (file) this.iconButton(actions, "file-text", file.label, () => this.openPath(file.path));
		this.groupButton(actions, list);
		for (const line of header.lines) head.createDiv({ cls: "ta-da-list-line", text: line });
		if (header.chips.length > 0) {
			const chips = head.createDiv({ cls: "ta-da-chips" });
			for (const chip of header.chips) {
				const button = chips.createEl("button", { cls: "ta-da-chip" });
				drawIcon(button, chip.icon);
				button.createSpan({ text: chip.label });
				button.createSpan({ cls: "ta-da-chip-count", text: String(chip.count) });
				button.addEventListener("click", () => this.show(chip.domain));
			}
		}
		this.renderFilter(head, list);
	}

	/** The Group pill, on lists that have a Group choice: `Group Status ▾`, opening the menu. */
	private groupButton(parent: HTMLElement, list: ListModel): void {
		const groupList = list.groupList;
		if (!groupList) return;
		const pill = parent.createEl("button", { cls: "ta-da-pill ta-da-group-pill", attr: { "aria-label": `Group: ${list.grouping ?? ""}` } });
		setIcon(pill.createSpan({ cls: "ta-da-pill-icon" }), "list");
		pill.createSpan({ cls: "ta-da-pill-label", text: "Group" });
		pill.createSpan({ cls: "ta-da-pill-value", text: list.grouping ?? "" });
		setIcon(pill.createSpan({ cls: "ta-da-pill-icon" }), "chevron-down");
		pill.addEventListener("click", (event) => {
			const menu = new Menu();
			for (const choice of groupChoices[groupList]) {
				menu.addItem((entry) => entry.setTitle(choice).setChecked(choice === list.grouping).onClick(() => this.setGrouping(choice)));
			}
			menu.showAtMouseEvent(event);
		});
	}

	/** The Agenda's header: Week | Month and ‹ Today › beside the title, then the month's title and the weeks' days. */
	private renderStrip(head: HTMLElement, bar: HTMLElement, strip: StripModel): void {
		bar.addClass("is-agenda");
		const controls = bar.createDiv({ cls: "ta-da-agenda-controls" });
		const size = controls.createDiv({ cls: "ta-da-switch is-compact", attr: { role: "group", "aria-label": "Calendar size" } });
		for (const [open, label] of [[false, "Week"], [true, "Month"]] as const) {
			const button = size.createEl("button", { cls: open === strip.monthOpen ? "is-active" : "", text: label, attr: { "aria-pressed": String(open === strip.monthOpen) } });
			button.addEventListener("click", () => this.setAgenda({ monthOpen: open }));
		}
		const stepper = controls.createDiv({ cls: "ta-da-stepper", attr: { role: "group", "aria-label": `Move through ${strip.unit}s` } });
		const previous = stepper.createEl("button", { attr: { "aria-label": `Previous ${strip.unit}` } });
		setIcon(previous, "chevron-left");
		previous.addEventListener("click", () => this.stepAgenda(-1));
		const today = stepper.createEl("button", { cls: "ta-da-stepper-today", text: "Today" });
		today.addEventListener("click", () => this.setAgenda({ selection: { kind: "day", date: this.today } }));
		const next = stepper.createEl("button", { attr: { "aria-label": `Next ${strip.unit}` } });
		setIcon(next, "chevron-right");
		next.addEventListener("click", () => this.stepAgenda(1));

		head.createDiv({ cls: "ta-da-strip-title", text: strip.title });
		const grid = head.createDiv({ cls: "ta-da-strip", attr: { role: "grid" } });
		const initials = grid.createDiv({ cls: "ta-da-strip-row is-initials", attr: { "aria-hidden": "true" } });
		for (const initial of ["W", ...strip.initials]) initials.createSpan({ text: initial });
		for (const row of strip.rows) {
			const line = grid.createDiv({ cls: "ta-da-strip-row" });
			const week = line.createEl("button", { cls: `ta-da-strip-cell is-week${row.week.selected ? " is-selected" : ""}${row.week.hasNote ? " has-note" : ""}`, attr: { "aria-label": `Week ${row.week.label}${row.week.hasNote ? ", note" : ""}` } });
			week.createSpan({ cls: "ta-da-strip-number", text: row.week.label });
			week.createSpan({ cls: "ta-da-strip-dots" });
			week.addEventListener("click", () => this.setAgenda({ selection: { kind: "week", week: row.week.week } }));
			for (const day of row.days) {
				const cell = line.createEl("button", {
					cls: `ta-da-strip-cell is-day${day.selected ? " is-selected" : ""}${day.today ? " is-today" : ""}${day.faded ? " is-faded" : ""}`,
					attr: { "aria-label": day.aria },
				});
				cell.createSpan({ cls: "ta-da-strip-number", text: day.label });
				this.dots(cell, day);
				cell.addEventListener("click", () => this.setAgenda({ selection: { kind: "day", date: day.date } }));
			}
		}
	}

	private iconButton(parent: HTMLElement, icon: string, label: string, onClick: (event: MouseEvent) => void): void {
		const button = parent.createDiv({ cls: "clickable-icon ta-da-list-button", attr: { "aria-label": label } });
		setIcon(button, icon);
		button.addEventListener("click", onClick);
	}

	/** The filter pill, the picked tags as chips, and how many rows they leave. */
	private renderFilter(parent: HTMLElement, list: ListModel): void {
		const filter = list.filter;
		if (!filter) return;
		const row = parent.createDiv({ cls: "ta-da-filter" });
		const pill = row.createEl("button", { cls: "ta-da-pill" });
		setIcon(pill.createSpan({ cls: "ta-da-pill-icon" }), "list-filter");
		pill.createSpan({ text: "Filter" });
		if (!filter.tags.some((tag) => tag.picked)) pill.addClass("is-dashed");
		pill.addEventListener("click", (event) => {
			const menu = new Menu();
			menu.addItem((entry) => entry.setTitle("Tags in this view").setIsLabel(true));
			for (const tag of filter.tags) {
				menu.addItem((entry) => entry.setTitle(`${tag.name} (${tag.count})`).setChecked(tag.picked).onClick(() => this.pick(tag.path, !tag.picked)));
			}
			menu.showAtMouseEvent(event);
		});
		const picked = filter.tags.filter((tag) => tag.picked);
		for (const tag of picked) {
			const chip = row.createEl("button", { cls: "ta-da-pill is-picked", attr: { "aria-label": `Remove ${tag.name}` } });
			chip.createSpan({ text: `#${tag.name}` });
			setIcon(chip.createSpan({ cls: "ta-da-pill-icon" }), "x");
			chip.addEventListener("click", () => this.pick(tag.path, false));
		}
		if (picked.length > 0) {
			row.createSpan({ cls: "ta-da-filter-count", text: `${filter.shown} of ${filter.total}` });
			const clear = row.createEl("button", { cls: "ta-da-link-button", text: "Clear" });
			clear.addEventListener("click", () => {
				this.picked.set(domainKey(list.domain), new Set());
				this.refresh();
			});
		}
	}

	private renderSection(parent: HTMLElement, section: SectionModel, list: ListModel): void {
		const el = parent.createDiv({ cls: "ta-da-section" });
		if (section.header) this.renderSectionHeader(el, section, section.header, list);
		if (section.folded) return;
		for (const row of section.rows) this.renderRow(el, row);
		if (section.message) el.createDiv({ cls: "ta-da-message", text: section.message });
	}

	private renderSectionHeader(parent: HTMLElement, section: SectionModel, header: SectionHeader, list: ListModel): void {
		switch (header.style) {
			case "count": {
				const el = parent.createDiv({ cls: `ta-da-group-header${header.quiet ? " is-quiet" : ""}${section.foldable ? " is-foldable" : ""}` });
				if (section.foldable) setIcon(el.createSpan({ cls: `ta-da-fold${section.folded ? " is-collapsed" : ""}` }), "chevron-down");
				el.createSpan({ cls: "ta-da-group-title", text: header.title });
				el.createSpan({ cls: "ta-da-group-count", text: String(header.count) });
				if (section.foldable) el.addEventListener("click", () => this.toggleFold(section.id));
				break;
			}
			case "area": {
				const el = parent.createDiv({ cls: "ta-da-group-header is-parent is-link" });
				drawIcon(el.createSpan({ cls: "ta-da-group-icon" }), { type: "area" });
				el.createSpan({ cls: "ta-da-group-title", text: header.title });
				if (header.count > 0) el.createSpan({ cls: "ta-da-group-count", text: String(header.count) });
				el.addEventListener("click", () => this.show({ kind: "area", path: header.path }));
				break;
			}
			case "project": {
				const el = parent.createDiv({ cls: `ta-da-group-header is-parent is-link` });
				drawIcon(el.createSpan({ cls: "ta-da-group-icon" }), header.icon);
				el.createSpan({ cls: "ta-da-group-title", text: header.title });
				if (header.area) el.createSpan({ cls: "ta-da-group-area", text: header.area });
				if (header.count > 0) el.createSpan({ cls: "ta-da-group-count", text: String(header.count) });
				el.addEventListener("click", () => this.show({ kind: "project", path: header.path }));
				break;
			}
			case "loose": {
				const el = parent.createDiv({ cls: "ta-da-group-header is-parent" });
				drawIcon(el.createSpan({ cls: "ta-da-group-icon" }), { type: "icon", name: "inbox", tint: "accent" });
				el.createSpan({ cls: "ta-da-group-title", text: "Loose" });
				break;
			}
			case "dayTitle": {
				const el = parent.createDiv({ cls: "ta-da-period-title" });
				el.createSpan({ cls: "ta-da-period-name", text: header.title });
				if (header.relative) el.createSpan({ cls: "ta-da-period-note is-accent", text: header.relative });
				break;
			}
			case "weekTitle": {
				const el = parent.createDiv({ cls: "ta-da-period-title" });
				el.createSpan({ cls: "ta-da-period-name", text: header.title });
				el.createSpan({ cls: "ta-da-period-note", text: header.range });
				if (header.thisWeek) el.createSpan({ cls: "ta-da-period-note is-accent", text: "This week" });
				break;
			}
			case "scheduled": {
				const el = parent.createDiv({ cls: "ta-da-group-header is-archive is-scheduled" });
				drawIcon(el.createSpan({ cls: "ta-da-group-icon" }), { type: "icon", name: "calendar", tint: "due" });
				el.createSpan({ cls: "ta-da-group-title", text: "Scheduled" });
				const actions = el.createDiv({ cls: "ta-da-list-actions" });
				this.groupButton(actions, list);
				this.renderFilter(parent, list);
				break;
			}
			case "repeats": {
				const el = parent.createDiv({ cls: "ta-da-group-header is-archive is-repeats" });
				drawIcon(el.createSpan({ cls: "ta-da-group-icon" }), { type: "icon", name: "repeat", tint: "muted" });
				el.createSpan({ cls: "ta-da-group-title", text: "Repeats" });
				break;
			}
			case "archive": {
				const el = parent.createDiv({ cls: "ta-da-group-header is-archive" });
				el.createSpan({ cls: "ta-da-group-title", text: header.title });
				if (header.note) el.createSpan({ cls: "ta-da-group-note", text: header.note });
				break;
			}
		}
	}

	// Rows

	private renderRow(parent: HTMLElement, row: ListRow): void {
		let el: HTMLElement;
		switch (row.type) {
			case "task":
				el = this.taskRow(parent, row);
				break;
			case "project":
			case "area":
				el = this.parentRow(parent, row);
				break;
			case "note":
				el = this.noteRow(parent, row);
				break;
			case "logged":
			case "trashed":
				el = this.archiveRow(parent, row);
				break;
			case "day":
				this.dayRow(parent, row);
				return;
			case "occurrence":
				this.occurrenceRow(parent, row);
				return;
			case "periodNote":
				el = this.periodNoteRow(parent, row);
				if (row.path === null) return;
				break;
		}
		if (row.path === null) return;
		const path = row.path;
		const els = this.rowEls.get(path) ?? [];
		els.push(el);
		this.rowEls.set(path, els);
		el.addEventListener("click", (event) => this.openPath(path, event));
	}

	/** A day in a week's list: its note's first paragraph, what's due, and its dots. Clicking it picks the day. */
	private dayRow(parent: HTMLElement, row: AgendaDayRowModel): void {
		const el = parent.createDiv({ cls: `ta-da-row is-day${row.today ? " is-today" : ""}`, attr: { role: "button", tabindex: "-1" } });
		el.createSpan({ cls: "ta-da-day-label", text: row.label });
		if (row.firstRepeat !== null) {
			const note = el.createSpan({ cls: "ta-da-day-note is-repeat" });
			metaIcon(note, "repeat").setAttribute("aria-hidden", "true");
			note.appendText(row.firstRepeat);
		} else {
			el.createSpan({ cls: `ta-da-day-note${row.hasNote ? "" : " is-none"}`, text: row.note });
		}
		el.createSpan({ cls: "ta-da-day-summary", text: row.summary });
		this.dots(el, row);
		el.addEventListener("click", () => this.setAgenda({ selection: { kind: "day", date: row.date } }));
	}

	/** A coming occurrence in the Repeats group: a muted row with a box that can't be ticked. A click opens the task. */
	private occurrenceRow(parent: HTMLElement, row: OccurrenceRowModel): void {
		const el = parent.createDiv({ cls: "ta-da-row is-occurrence", attr: { role: "button", tabindex: "-1", "aria-label": row.label, title: row.tooltip } });
		el.createSpan({ cls: "ta-da-occurrence-box", attr: { "aria-hidden": "true" } });
		if (row.estimated) el.createSpan({ cls: "ta-da-occurrence-pill", text: "≈", attr: { "aria-hidden": "true" } });
		if (row.deadline) el.createSpan({ cls: "ta-da-occurrence-pill is-deadline", text: "Deadline", attr: { "aria-hidden": "true" } });
		el.createSpan({ cls: "ta-da-row-title", text: row.title, attr: { title: row.title } });
		metaIcon(el, "repeat").setAttribute("aria-hidden", "true");
		if (row.place) el.createSpan({ cls: "ta-da-row-place", text: row.place, attr: { "aria-hidden": "true" } });
		el.addEventListener("click", (event) => this.openPath(row.open, event));
	}

	/** A day's or week's note: its name, file and first paragraph; or, with no note, the row that creates it. */
	private periodNoteRow(parent: HTMLElement, row: PeriodNoteRowModel): HTMLElement {
		const day = row.period === "day";
		if (row.path === null) {
			const label = day ? "Start this day’s note" : "Start the week note";
			const el = parent.createDiv({ cls: "ta-da-row is-note-start", attr: { role: "button", tabindex: "-1", "aria-label": label } });
			setIcon(el.createSpan({ cls: "ta-da-row-icon" }), "plus");
			el.createSpan({ cls: "ta-da-note-start-label", text: label });
			el.createSpan({ cls: "ta-da-note-file", text: row.file });
			el.addEventListener("click", () => void this.createNote(row));
			return el;
		}
		const el = parent.createDiv({ cls: "ta-da-row is-period-note" });
		setIcon(el.createSpan({ cls: "ta-da-row-icon is-note-icon" }), day ? "file-text" : "calendar");
		const main = el.createDiv({ cls: "ta-da-row-main" });
		main.createSpan({ cls: "ta-da-row-title", text: row.name });
		const meta = main.createDiv({ cls: "ta-da-row-meta is-single" });
		meta.createSpan({ cls: "ta-da-note-file", text: row.file });
		if (row.summary) {
			meta.createSpan({ text: "·" });
			meta.createSpan({ cls: "ta-da-note-summary", text: row.summary });
		}
		if (row.open > 0) {
			const badge = el.createSpan({ cls: "ta-da-open-badge", attr: { "aria-label": `${row.open} open` } });
			badge.createSpan({ cls: "ta-da-dot" });
			badge.appendText(`${row.open} open`);
		} else if (row.subtasks) {
			el.createSpan({ cls: "ta-da-note-boxes", text: `${row.subtasks.done}/${row.subtasks.total}` });
		}
		return el;
	}

	/** Creates a day's or week's note from its template and opens it. */
	private async createNote(row: PeriodNoteRowModel): Promise<void> {
		const { dailyNotes } = this.deps.settings;
		const template = row.period === "day" ? dailyNotes.dailyTemplate : dailyNotes.weekTemplate;
		const path = await createPeriodNote(this.app, row.target, template, this.today);
		if (path !== null) this.openPath(path);
	}

	/** The ring for a day's unchecked boxes, then the dot for open tasks. */
	private dots(parent: HTMLElement, marks: { hasOpenBoxes: boolean; hasOpenTasks: boolean }): void {
		const dots = parent.createSpan({ cls: "ta-da-strip-dots" });
		if (marks.hasOpenBoxes) dots.createSpan({ cls: "ta-da-dot is-ring" });
		if (marks.hasOpenTasks) dots.createSpan({ cls: "ta-da-dot" });
	}

	/** A task on one line: its box, a date pill, the title, quiet glyphs, and the place at the right. */
	private taskRow(parent: HTMLElement, row: TaskRowModel): HTMLElement {
		const el = parent.createDiv({ cls: `ta-da-row is-task${row.closed ? " is-closed" : ""}` });
		drawCheckbox(el, row.status, `${row.closed ? (row.status === "Done" ? "Mark not done" : "Reopen") : "Complete"}: ${row.title}`, (event) => {
			event.stopPropagation();
			this.toggleTask(row);
		});
		if (row.date) el.createSpan({ cls: `ta-da-date-pill${row.date.overdue ? " is-overdue" : ""}`, text: row.date.text, attr: { "aria-label": row.date.tooltip } });
		el.createSpan({ cls: "ta-da-row-title", text: row.title, attr: { title: row.title } });
		if (row.note || row.subtasks || row.repeat || row.tags > 0) {
			const glyphs = el.createSpan({ cls: "ta-da-glyphs" });
			if (row.note) metaIcon(glyphs, "file-text").setAttribute("aria-label", "Has a note");
			if (row.subtasks) metaIcon(glyphs, "list-checks").setAttribute("aria-label", `${row.subtasks.done} of ${row.subtasks.total} subtasks done`);
			if (row.repeat) {
				const repeat = metaIcon(glyphs, "repeat");
				repeat.setAttribute("aria-label", row.repeat.tooltip);
				repeat.setAttribute("title", row.repeat.tooltip);
				if (row.repeat.next) glyphs.createSpan({ cls: "ta-da-repeat-next", text: row.repeat.next, attr: { title: row.repeat.tooltip } });
			}
			if (row.tags > 0) metaIcon(glyphs, "tag", "accent").setAttribute("aria-label", row.tags === 1 ? "1 tag" : `${row.tags} tags`);
		}
		if (row.place) el.createSpan({ cls: "ta-da-row-place", text: row.place, attr: { "aria-label": `In ${row.place}` } });
		el.addEventListener("contextmenu", (event) => this.fileMenu(row.path, event));
		return el;
	}

	private parentRow(parent: HTMLElement, row: ParentRowModel): HTMLElement {
		const el = parent.createDiv({ cls: `ta-da-row is-parent is-${row.variant}` });
		drawIcon(el.createSpan({ cls: "ta-da-row-icon" }), row.icon);
		const main = el.createDiv({ cls: "ta-da-row-main" });
		main.createSpan({ cls: "ta-da-row-title", text: row.title });
		if (row.meta) {
			const meta = main.createDiv({ cls: "ta-da-row-meta" });
			meta.createSpan({ text: row.meta });
			if (row.tags > 0) {
				const span = meta.createSpan({ cls: "ta-da-meta-item" });
				metaIcon(span, "tag", "accent");
				span.appendText(String(row.tags));
			}
		}
		if (row.deadline) {
			const span = el.createSpan({ cls: `ta-da-row-trailing ta-da-meta-item${row.deadline.overdue ? " is-overdue" : ""}` });
			metaIcon(span, "flag", "deadline");
			span.appendText(row.deadline.text);
		}
		if (row.open !== null) el.createSpan({ cls: "ta-da-row-trailing ta-da-row-count", text: String(row.open) });
		if (row.variant === "card") setIcon(el.createSpan({ cls: "ta-da-row-chevron" }), "chevron-right");
		if (row.type === "project") el.addEventListener("contextmenu", (event) => this.fileMenu(row.path, event));
		return el;
	}

	private noteRow(parent: HTMLElement, row: NoteRowModel): HTMLElement {
		const el = parent.createDiv({ cls: "ta-da-row is-note" });
		setIcon(el.createSpan({ cls: "ta-da-row-icon is-note-icon" }), "file-text");
		const main = el.createDiv({ cls: "ta-da-row-main" });
		main.createSpan({ cls: "ta-da-row-title", text: row.title });
		if (row.subtasks || row.tags > 0 || row.folder) {
			const meta = main.createDiv({ cls: "ta-da-row-meta" });
			if (row.subtasks) {
				const span = meta.createSpan({ cls: "ta-da-meta-item" });
				metaIcon(span, "list-checks");
				span.appendText(`${row.subtasks.done}/${row.subtasks.total}`);
			}
			if (row.tags > 0) {
				const span = meta.createSpan({ cls: "ta-da-meta-item" });
				metaIcon(span, "tag", "accent");
				span.appendText(String(row.tags));
			}
			if (row.folder) {
				const span = meta.createSpan({ cls: "ta-da-meta-item" });
				metaIcon(span, row.folder === "Loose" ? "inbox" : "folder", "link");
				span.appendText(row.folder);
			}
		}
		return el;
	}

	/** A Logbook or Trash row, drawn as a task's or project's. A logged task's box reopens it, as the Mac's; nothing else writes. */
	private archiveRow(parent: HTMLElement, row: ArchiveRowModel): HTMLElement {
		const el = parent.createDiv({ cls: `ta-da-row is-archive${row.status === "Done" || row.status === "Cancelled" ? " is-closed" : ""}${row.path === null ? " is-static" : ""}` });
		if (row.kind === "area") drawIcon(el.createSpan({ cls: "ta-da-row-icon" }), { type: "area" });
		else if (row.kind === "note") setIcon(el.createSpan({ cls: "ta-da-row-icon is-note-icon" }), "file-text");
		else if (row.kind === "project") {
			drawIcon(el.createSpan({ cls: `ta-da-row-icon${row.status === "Cancelled" ? " is-muted" : " is-done"}` }), { type: "ring", fraction: 1, ongoing: false });
		} else {
			const file = row.type === "logged" && row.path !== null ? this.app.vault.getFileByPath(row.path) : null;
			const closed = row.status === "Done" || row.status === "Cancelled";
			drawCheckbox(el, row.status, file ? `${closed ? (row.status === "Done" ? "Mark not done" : "Reopen") : "Complete"}: ${row.title}` : row.title, file ? (event) => {
				event.stopPropagation();
				this.deps.status.toggle(file);
			} : null);
		}
		const main = el.createDiv({ cls: "ta-da-row-main" });
		main.createSpan({ cls: `ta-da-row-title${row.kind === "task" ? "" : " is-strong"}`, text: row.title });
		const meta = main.createDiv({ cls: "ta-da-row-meta" });
		meta.createSpan({ text: row.meta });
		if (row.subtasks) {
			const span = meta.createSpan({ cls: "ta-da-meta-item" });
			metaIcon(span, "list-checks");
			span.appendText(`${row.subtasks.done}/${row.subtasks.total}`);
		}
		if (row.date) el.createSpan({ cls: "ta-da-row-trailing", text: row.date });
		return el;
	}
}
