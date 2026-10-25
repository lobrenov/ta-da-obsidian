import { identityKey } from "../text";
import { home, logbookFolder, trashFolder } from "../storage/vault";
import type { Checkbox } from "./checkbox";
import type { LocalDate } from "./localDate";
import type { Status } from "./status";
import type { Tag } from "./tag";
import type { WikiLink } from "./wikiLink";

export type Kind = "task" | "project" | "area" | "note";

/** The frontmatter keys Ta Da understands. Other keys are left alone. */
export interface Properties {
	kind: Kind;
	/** Always Not Started on areas and notes, which have no status. */
	status: Status;
	/** The area a project or task is filed under; always null on areas and notes, and on tasks with a `project`. */
	area: WikiLink | null;
	/** Tasks only; always null on projects, areas and notes. */
	project: WikiLink | null;
	createdDate: LocalDate | null;
	completedDate: LocalDate | null;
	dueDate: LocalDate | null;
	deadline: LocalDate | null;
	/** The `repeat` text, displayed only. */
	repeatRule: string | null;
	/** `tags:`, in order, without repeats. */
	tags: Tag[];
}

export function makeProperties(kind: Kind): Properties {
	return {
		kind,
		status: "Not Started",
		area: null,
		project: null,
		createdDate: null,
		completedDate: null,
		dueDate: null,
		deadline: null,
		repeatRule: null,
		tags: [],
	};
}

/** Something in a file Ta Da couldn't read as intended. The file still loads. */
export type Warning =
	/** The frontmatter isn't valid YAML, so only `type` was read. `line` is 1-based in the file. */
	| { case: "invalidYAML"; problem: string; line: number | null }
	/** Missing or empty `status`; read as Not Started. */
	| { case: "missingStatus" }
	/** A `status` that isn't one of the six; read as Not Started. */
	| { case: "unknownStatus"; value: string }
	| { case: "invalidDate"; key: string; value: string }
	/** A `project` value that isn't a `"[[Title]]"` link. */
	| { case: "invalidProject"; value: string }
	/** A list or mapping where text was expected, or vice versa. */
	| { case: "unexpectedValue"; key: string }
	/** A task's `project` link doesn't match any project file, so the task is loose. */
	| { case: "unresolvedProject"; value: string }
	/** An `area` link doesn't match any area file, so the file has no parent. */
	| { case: "unresolvedArea"; value: string }
	/** A task has both keys; `project` has a value, so its `area` (this title) is ignored. */
	| { case: "areaIgnored"; value: string };

/** A tag on a file and where it's written. */
export interface TagUse {
	tag: Tag;
	inFrontmatter: boolean;
	inBody: boolean;
}

/** One task, project, area or note file, as parsed from its text. */
export interface Item {
	/** Path relative to the vault folder, for example `Ta Da/tasks/Pick a test framework.md`. */
	path: string;
	/** The filename without `.md`. */
	title: string;
	properties: Properties;
	/** The body's first paragraph as plain text. */
	summary: string | null;
	/** Whether the body has a non-blank line that isn't a checkbox's. */
	hasNote: boolean;
	checkboxes: Checkbox[];
	/** Links in the body. They never set project membership. */
	links: WikiLink[];
	/** Embeds in the body, such as `![[front.jpg]]`. They aren't links. */
	embeds: WikiLink[];
	/** The file's tags: `tags:` in order, then the body's that aren't in `tags:`. Each keeps its first spelling. */
	tags: TagUse[];
	warnings: Warning[];
}

/** Done and total subtasks. Cancelled boxes are left out of the total; icon-only boxes aren't subtasks. */
export function subtasks(item: Item): { done: number; total: number } {
	let done = 0;
	let total = 0;
	for (const box of item.checkboxes) {
		if (box.state === "done") {
			done++;
			total++;
		} else if (box.state === "open") {
			total++;
		}
	}
	return { done, total };
}

/** Whether a path is in `Ta Da/logbook/`, ignoring case. */
export function isLoggedPath(path: string): boolean {
	const lower = identityKey(path);
	return lower.startsWith(`${identityKey(logbookFolder)}/`);
}

export function isLogged(item: Item): boolean {
	return isLoggedPath(item.path);
}

/** The top-level folders whose files are never notes, lowercased: `Ta Da/`. */
export const reservedFolders: ReadonlySet<string> = new Set([identityKey(home)]);

/**
 * Whether an untyped file at `path` is a note: a `.md` file outside hidden folders and the top-level reserved folders
 * (ignoring case). A path in `.trash/` is judged by the rest of it.
 */
export function isNotePath(path: string): boolean {
	const parts = path.split("/").filter((part) => part !== "");
	if (parts[0] === trashFolder) parts.shift();
	const name = parts[parts.length - 1];
	if (name === undefined || !name.toLowerCase().endsWith(".md")) return false;
	if (parts.length > 1 && reservedFolders.has(identityKey(parts[0] ?? ""))) return false;
	return !parts.some((part) => part.startsWith("."));
}

/** `folder/Name.md` gives `Name`. */
export function titleOfPath(path: string): string {
	const parts = path.split("/").filter((part) => part !== "");
	const name = parts[parts.length - 1] ?? path;
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}
