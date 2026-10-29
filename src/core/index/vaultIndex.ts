import { type Item, isLogged, isLoggedPath, titleOfPath, type Warning } from "../model/item";
import { attachmentName, linkTitle } from "../model/wikiLink";
import type { Tag } from "../model/tag";
import type { LocalDate } from "../model/localDate";
import { folderOf } from "../storage/vault";
import { compareCodeUnits, identityKey } from "../text";

const titleCollator = new Intl.Collator(undefined, { numeric: true });

/** Orders titles as Foundation's `localizedStandardCompare`: numbers by value, lowercase before uppercase, unaccented before accented. */
export function compareTitles(a: string, b: string): number {
	return titleCollator.compare(a, b);
}

/**
 * Every Ta Da item in the vault, held in memory. Files are the only truth; this is built at start and patched as
 * files change. Each patch touches only the changed item's entries in the maps.
 * Logged files are held too: links to them resolve, but the lists of tasks, projects and areas, the files filed under
 * a parent, and the tag map leave them out.
 */
export class VaultIndex {
	private readonly itemsByPath = new Map<string, Item>();
	/** Lowercased title to paths: live tasks, projects and areas first, then notes, then logged files, each by path. */
	private readonly pathsByTitle = new Map<string, string[]>();
	/** Lowercased title of a task's `project` link to the tasks' paths. */
	private readonly tasksByProjectTitle = new Map<string, Set<string>>();
	/** Lowercased title of a project's or task's `area` link to their paths. */
	private readonly filedByAreaTitle = new Map<string, Set<string>>();
	/** Lowercased title of a link in a body to the paths of the items that link to it. */
	private readonly linkersByTitle = new Map<string, Set<string>>();
	/** Lowercased image filename to the paths of the items that embed it. */
	private readonly embeddersByName = new Map<string, Set<string>>();
	/** Tag path to the paths of the items that carry it (not counting its children). */
	private readonly pathsByTag = new Map<string, Set<string>>();
	/** Folder (empty for the top level) to the paths of the notes straight in it. */
	private readonly notesByFolder = new Map<string, Set<string>>();
	/** Tag path to the tag as spelled by the first carrier (live before logged, then by path), and that path. */
	private readonly tagsByPath = new Map<string, { tag: Tag; path: string }>();

	constructor(items: Item[] = []) {
		for (const item of items) this.update(item);
	}

	get(path: string): Item | undefined {
		return this.itemsByPath.get(path);
	}

	get items(): ReadonlyMap<string, Item> {
		return this.itemsByPath;
	}

	/** Adds or replaces an item. */
	update(item: Item): void {
		const old = this.itemsByPath.get(item.path);
		this.itemsByPath.set(item.path, item);
		if (old) {
			this.removeLinks(old);
			this.removeTags(old);
			removeFrom(this.notesByFolder, folderOf(old.path), old.path);
			if ((old.properties.kind === "note") !== (item.properties.kind === "note")) this.sortTitle(item.path);
		} else {
			this.addTitle(item.path);
		}
		this.addLinks(item);
		this.addTags(item);
		if (item.properties.kind === "note" && !isLogged(item)) addTo(this.notesByFolder, folderOf(item.path), item.path);
	}

	remove(path: string): void {
		const old = this.itemsByPath.get(path);
		if (!old) return;
		this.itemsByPath.delete(path);
		this.removeTitle(path);
		this.removeLinks(old);
		this.removeTags(old);
		removeFrom(this.notesByFolder, folderOf(path), path);
	}

	/** Items that aren't logged. */
	get liveItems(): Item[] {
		return [...this.itemsByPath.values()].filter((item) => !isLogged(item));
	}

	get tasks(): Item[] {
		return this.liveItems.filter((item) => item.properties.kind === "task");
	}

	get projects(): Item[] {
		return this.liveItems.filter((item) => item.properties.kind === "project");
	}

	get areas(): Item[] {
		return this.liveItems.filter((item) => item.properties.kind === "area");
	}

	get notes(): Item[] {
		const notes: Item[] = [];
		for (const paths of this.notesByFolder.values()) {
			for (const path of paths) {
				const item = this.itemsByPath.get(path);
				if (item) notes.push(item);
			}
		}
		return notes;
	}

	/** The filenames of every project's title, live or logged, except the project at `path`: the names a project's file avoids. */
	projectFilenames(excluding?: string): Set<string> {
		const names = new Set<string>();
		for (const item of this.itemsByPath.values()) {
			if (item.properties.kind === "project" && item.path !== excluding) names.add(`${item.title}.md`);
		}
		return names;
	}

	/** Logged tasks and projects. */
	get logged(): Item[] {
		return [...this.itemsByPath.values()].filter((item) => isLogged(item));
	}

	/** Every tag carried by an item, spelled as in the first carrier (live before logged, then by path), in no order. */
	get carriedTags(): Tag[] {
		return [...this.tagsByPath.values()].map((entry) => entry.tag);
	}

	/** The paths of the notes straight in each folder. */
	get notePathsByFolder(): ReadonlyMap<string, ReadonlySet<string>> {
		return this.notesByFolder;
	}

	/** The paths of the items that carry this tag path itself, not its children. */
	pathsCarrying(tagPath: string): ReadonlySet<string> {
		return this.pathsByTag.get(tagPath) ?? new Set();
	}

	/** Items with this title, ignoring case: live tasks, projects and areas, then notes, then logged files, each by path. */
	itemsTitled(title: string): Item[] {
		return (this.pathsByTitle.get(identityKey(title)) ?? []).flatMap((path) => this.itemsByPath.get(path) ?? []);
	}

	/** The project file a task's `project` link resolves to. Null for loose tasks. */
	projectOf(task: Item): Item | null {
		if (task.properties.kind !== "task" || !task.properties.project) return null;
		return this.projectTitled(linkTitle(task.properties.project));
	}

	/**
	 * The area file a project's `area` link resolves to, or a task's through its project; a task without a `project`
	 * uses its own `area`. Null when there's none or it doesn't resolve.
	 */
	areaOf(item: Item): Item | null {
		switch (item.properties.kind) {
			case "area":
			case "note":
				return null;
			case "project":
				return item.properties.area ? this.areaTitled(linkTitle(item.properties.area)) : null;
			case "task": {
				if (item.properties.project) {
					const project = this.projectOf(item);
					return project ? this.areaOf(project) : null;
				}
				return item.properties.area ? this.areaTitled(linkTitle(item.properties.area)) : null;
			}
		}
	}

	/** The file a task or project is filed under: a task's project, else its area; a project's area. */
	parentOf(item: Item): Item | null {
		switch (item.properties.kind) {
			case "area":
			case "note":
				return null;
			case "project":
				return this.areaOf(item);
			case "task":
				return this.projectOf(item) ?? (item.properties.area ? this.areaTitled(linkTitle(item.properties.area)) : null);
		}
	}

	/** Tasks filed straight under this project or area, sorted by their earliest date, then title; logged ones only when `includingLogged`. */
	tasksIn(parent: Item, includingLogged = false): Item[] {
		return this.filedUnder(parent).filter((item) => item.properties.kind === "task" && (includingLogged || !isLogged(item))).sort(byDate);
	}

	/** Projects whose `area` resolves to this area, sorted by title; logged ones only when `includingLogged`. */
	projectsIn(area: Item, includingLogged = false): Item[] {
		return this.filedUnder(area).filter((item) => item.properties.kind === "project" && (includingLogged || !isLogged(item)));
	}

	/** A project's tasks that aren't Done or Cancelled, sorted by their earliest date, then title. */
	openTasksIn(project: Item): Item[] {
		return this.tasksIn(project).filter((task) => task.properties.status !== "Done" && task.properties.status !== "Cancelled");
	}

	/** An area's own tasks, then its projects' tasks, each sorted by their earliest date, then title. */
	allTasksIn(area: Item): Item[] {
		return this.tasksIn(area).concat(this.projectsIn(area).flatMap((project) => this.tasksIn(project)));
	}

	/** Items whose body links to this item's title, sorted by title. */
	backlinks(item: Item): Item[] {
		const paths = this.linkersByTitle.get(identityKey(item.title)) ?? new Set<string>();
		return [...paths]
			.filter((path) => path !== item.path)
			.flatMap((path) => this.itemsByPath.get(path) ?? [])
			.sort(byTitle);
	}

	/** Items whose body embeds this image filename (for example `front.jpg`), with how many times each embeds it, sorted by title. */
	embedders(name: string): { item: Item; count: number }[] {
		const lower = identityKey(name);
		const paths = this.embeddersByName.get(lower) ?? new Set<string>();
		return [...paths]
			.flatMap((path) => this.itemsByPath.get(path) ?? [])
			.sort(byTitle)
			.map((item) => ({ item, count: item.embeds.filter((embed) => identityKey(attachmentName(embed) ?? "") === lower).length }));
	}

	/** The file's own warnings, plus one for a `project` or `area` link that doesn't resolve. */
	warnings(item: Item): Warning[] {
		const warnings = [...item.warnings];
		const { project, area } = item.properties;
		if (project && !this.projectOf(item)) warnings.push({ case: "unresolvedProject", value: linkTitle(project) });
		if (area && !this.areaTitled(linkTitle(area))) warnings.push({ case: "unresolvedArea", value: linkTitle(area) });
		return warnings;
	}

	/** The project a link to this title resolves to: the first project by path. */
	private projectTitled(title: string): Item | null {
		return this.itemsTitled(title).find((item) => item.properties.kind === "project") ?? null;
	}

	/** The area a link to this title resolves to: the first area by path. */
	private areaTitled(title: string): Item | null {
		return this.itemsTitled(title).find((item) => item.properties.kind === "area") ?? null;
	}

	/** Items whose link resolves to this project or area, sorted by title. */
	private filedUnder(parent: Item): Item[] {
		const title = identityKey(parent.title);
		switch (parent.properties.kind) {
			case "project": {
				if (this.projectTitled(title)?.path !== parent.path) return [];
				return this.resolve(this.tasksByProjectTitle.get(title));
			}
			case "area": {
				if (this.areaTitled(title)?.path !== parent.path) return [];
				return this.resolve(this.filedByAreaTitle.get(title));
			}
			default:
				return [];
		}
	}

	private resolve(paths: Set<string> | undefined): Item[] {
		return [...(paths ?? [])].flatMap((path) => this.itemsByPath.get(path) ?? []).sort(byTitle);
	}

	private addTitle(path: string): void {
		const title = identityKey(titleOfPath(path));
		const paths = this.pathsByTitle.get(title) ?? [];
		paths.push(path);
		this.pathsByTitle.set(title, paths);
		this.sortTitle(path);
	}

	/** Re-sorts the paths that share this path's title. */
	private sortTitle(path: string): void {
		const rank = (p: string): number => (isLoggedPath(p) ? 2 : this.itemsByPath.get(p)?.properties.kind === "note" ? 1 : 0);
		this.pathsByTitle.get(identityKey(titleOfPath(path)))?.sort((a, b) => rank(a) - rank(b) || compareCodeUnits(a, b));
	}

	private removeTitle(path: string): void {
		const title = identityKey(titleOfPath(path));
		const remaining = (this.pathsByTitle.get(title) ?? []).filter((p) => p !== path);
		if (remaining.length === 0) this.pathsByTitle.delete(title);
		else this.pathsByTitle.set(title, remaining);
	}

	/** Files the item under the titles it links to (a task's `project`, an `area`, and the links in its body) and the images it embeds. */
	private addLinks(item: Item): void {
		const project = projectTitle(item);
		if (project) addTo(this.tasksByProjectTitle, project, item.path);
		if (item.properties.area) addTo(this.filedByAreaTitle, identityKey(linkTitle(item.properties.area)), item.path);
		for (const link of item.links) addTo(this.linkersByTitle, identityKey(linkTitle(link)), item.path);
		for (const name of attachmentNames(item)) addTo(this.embeddersByName, name, item.path);
	}

	private removeLinks(item: Item): void {
		const project = projectTitle(item);
		if (project) removeFrom(this.tasksByProjectTitle, project, item.path);
		if (item.properties.area) removeFrom(this.filedByAreaTitle, identityKey(linkTitle(item.properties.area)), item.path);
		for (const link of item.links) removeFrom(this.linkersByTitle, identityKey(linkTitle(link)), item.path);
		for (const name of attachmentNames(item)) removeFrom(this.embeddersByName, name, item.path);
	}

	private addTags(item: Item): void {
		for (const use of item.tags) {
			addTo(this.pathsByTag, use.tag.path, item.path);
			const current = this.tagsByPath.get(use.tag.path);
			if (!current || spells(item.path, current.path)) this.tagsByPath.set(use.tag.path, { tag: use.tag, path: item.path });
		}
	}

	private removeTags(item: Item): void {
		for (const use of item.tags) {
			removeFrom(this.pathsByTag, use.tag.path, item.path);
			if (this.tagsByPath.get(use.tag.path)?.path !== item.path) continue;
			const first = [...(this.pathsByTag.get(use.tag.path) ?? [])].sort((a, b) => (spells(a, b) ? -1 : spells(b, a) ? 1 : 0))[0];
			const carrier = first === undefined ? undefined : this.itemsByPath.get(first);
			const match = carrier?.tags.find((other) => other.tag.path === use.tag.path);
			if (first !== undefined && match) this.tagsByPath.set(use.tag.path, { tag: match.tag, path: first });
			else this.tagsByPath.delete(use.tag.path);
		}
	}
}

/** Whether the carrier at `a` sets a tag's spelling before the one at `b`: live files before logged ones, each by path. */
function spells(a: string, b: string): boolean {
	const [x, y] = [isLoggedPath(a) ? 1 : 0, isLoggedPath(b) ? 1 : 0];
	return x !== y ? x < y : compareCodeUnits(a, b) < 0;
}

/** Orders items by title, then by path. */
export function byTitle(a: Item, b: Item): number {
	return compareTitles(a.title, b.title) || compareCodeUnits(a.path, b.path);
}

function earliest(item: Item): LocalDate | null {
	const dates = [item.properties.dueDate, item.properties.deadline].filter((date): date is LocalDate => date !== null);
	return dates.reduce<LocalDate | null>((min, date) => (min === null || date.compare(min) < 0 ? date : min), null);
}

/** By the earlier of `dueDate` and `deadline`, undated last, then by title. */
export function byDate(a: Item, b: Item): number {
	const [x, y] = [earliest(a), earliest(b)];
	if (x && y && !x.equals(y)) return x.compare(y);
	if (!x && y) return 1;
	if (x && !y) return -1;
	return byTitle(a, b);
}

/** The lowercased image filenames an item embeds. */
function attachmentNames(item: Item): Set<string> {
	const names = new Set<string>();
	for (const embed of item.embeds) {
		const name = attachmentName(embed);
		if (name !== null) names.add(identityKey(name));
	}
	return names;
}

/** The lowercased title a task's `project` links to; null for a project or a task without one. */
function projectTitle(item: Item): string | null {
	if (item.properties.kind !== "task" || !item.properties.project) return null;
	return identityKey(linkTitle(item.properties.project));
}

function addTo(map: Map<string, Set<string>>, key: string, path: string): void {
	const set = map.get(key);
	if (set) set.add(path);
	else map.set(key, new Set([path]));
}

/** Takes the path out of the key's set, and the key out of the map once its set is empty. */
function removeFrom(map: Map<string, Set<string>>, key: string, path: string): void {
	const set = map.get(key);
	if (!set) return;
	set.delete(path);
	if (set.size === 0) map.delete(key);
}
