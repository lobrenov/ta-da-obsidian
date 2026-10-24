import {
	type Document,
	isAlias,
	isMap,
	isNode,
	isScalar,
	isSeq,
	LineCounter,
	type Node,
	parseDocument,
	type Scalar,
	visit,
	type YAMLError,
	type YAMLMap,
} from "yaml";
import { type Kind, makeProperties, type Properties, type Warning } from "../model/item";
import { LocalDate } from "../model/localDate";
import { readStatus } from "../model/status";
import { readTag, type Tag, uniqueTags } from "../model/tag";
import { readWikiLink, readWikiLinkInner, linkTitle, type WikiLink } from "../model/wikiLink";
import { compareCodeUnits, trimBlanks } from "../text";

export interface ReadResult {
	properties: Properties;
	warnings: Warning[];
}

/**
 * Reads frontmatter YAML from the `yaml` library's node tree with the failsafe schema, so values stay the strings
 * that were written: no YAML coercion of dates, `yes`/`no` or numbers.
 * Null when the YAML doesn't declare `type: task`, `type: project` or `type: area` (matched case-insensitively).
 * Invalid YAML falls back to a line scan for `type`, so a broken Ta Da file still loads with a warning.
 */
export function readProperties(yaml: string): ReadResult | null {
	const composed = compose(yaml);
	if ("warning" in composed) {
		const kind = scanKind(yaml);
		return kind === null ? null : { properties: makeProperties(kind), warnings: [composed.warning] };
	}
	const root = composed.root;
	if (!isMap(root)) return null;

	const reader = new Reader(composed.doc, root);
	const type = reader.text("type");
	const kind = type === null ? null : readKind(type);
	if (kind === null) return null;
	const properties = makeProperties(kind);

	if (kind !== "area") {
		const status = reader.text("status");
		if (status !== null) {
			const parsed = readStatus(status);
			if (parsed) properties.status = parsed;
			else reader.warnings.push({ case: "unknownStatus", value: status });
		} else {
			reader.warnings.push({ case: "missingStatus" });
		}
	}
	const project = kind === "task" ? reader.text("project") : null;
	if (project !== null) {
		properties.project = readWikiLink(project);
		if (properties.project === null) reader.warnings.push({ case: "invalidProject", value: project });
	}
	if (kind !== "area") {
		const areaText = reader.text("area");
		const area = areaText === null ? null : areaLink(areaText);
		if (area) {
			if (project === null) properties.area = area;
			else reader.warnings.push({ case: "areaIgnored", value: linkTitle(area) });
		}
	}
	properties.createdDate = reader.date("createdDate");
	properties.completedDate = reader.date("completedDate");
	properties.dueDate = reader.date("dueDate");
	properties.deadline = reader.date("deadline");
	properties.repeatRule = reader.text("repeat");
	properties.tags = reader.tags();
	return { properties, warnings: reader.warnings };
}

/**
 * A note's frontmatter: `createdDate` and `tags:` only. No frontmatter, or YAML that isn't a mapping, reads as
 * nothing; invalid YAML adds a warning.
 */
export function readNoteProperties(yaml: string | null): ReadResult {
	const properties = makeProperties("note");
	if (yaml === null) return { properties, warnings: [] };
	const composed = compose(yaml);
	if ("warning" in composed) return { properties, warnings: [composed.warning] };
	if (!isMap(composed.root)) return { properties, warnings: [] };
	const reader = new Reader(composed.doc, composed.root);
	properties.createdDate = reader.date("createdDate");
	properties.tags = reader.tags();
	return { properties, warnings: reader.warnings };
}

type Composed = { doc: Document; root: Node | null } | { warning: Warning };

function compose(yaml: string): Composed {
	const lines = new LineCounter();
	// A lone CR is a line break to libyaml.
	const doc = parseDocument(yaml.replace(/\r(?!\n)/g, "\n"), { schema: "failsafe", resolveKnownTags: false, lineCounter: lines });
	const error = doc.errors[0];
	if (error) return { warning: invalidYAML(error, yaml, lines) };
	let undefinedAlias: { pos: number } | null = null;
	visit(doc, {
		Alias(_key, node) {
			if (!undefinedAlias && node.resolve(doc) === undefined) undefinedAlias = { pos: node.range?.[0] ?? 0 };
		},
	});
	if (undefinedAlias) {
		return {
			warning: {
				case: "invalidYAML",
				problem: "found undefined alias",
				line: lines.linePos((undefinedAlias as { pos: number }).pos).line + 1,
			},
		};
	}
	return { doc, root: isNode(doc.contents) ? doc.contents : null };
}

/**
 * The warning for the first YAML error. The problem text is libyaml's (as Yams reports it) where the error maps to
 * one; otherwise the `yaml` library's own message. `line` is 1-based in the file, whose YAML starts on its second line.
 */
function invalidYAML(error: YAMLError, yaml: string, lines: LineCounter): Warning {
	if (error.code === "DUPLICATE_KEY") {
		// Yams reports this as a generic error: no line.
		return { case: "invalidYAML", problem: duplicateKeyProblem(yaml), line: null };
	}
	return { case: "invalidYAML", problem: libyamlProblem(error, yaml), line: libyamlLine(error, yaml, lines) + 1 };
}

/** The 1-based line within the YAML where libyaml puts the error's mark. */
function libyamlLine(error: YAMLError, yaml: string, lines: LineCounter): number {
	const lineAt = (offset: number): number => lines.linePos(offset).line;
	switch (error.code) {
		case "MULTILINE_IMPLICIT_KEY":
			// libyaml finds the missing `:` when it reaches the next token, where this range ends.
			if (!isSequenceIndicator(yaml, error.pos[0])) return lineAt(Math.max(error.pos[0], error.pos[1] - 1));
			return lineAt(error.pos[0]);
		case "BLOCK_AS_IMPLICIT_KEY":
			// libyaml stops at the `:` that can't start a value.
			return lineAt(nextValueIndicator(yaml, error.pos[0]) ?? error.pos[0]);
		default:
			return lineAt(error.pos[0]);
	}
}

function isSequenceIndicator(yaml: string, offset: number): boolean {
	return yaml[offset] === "-" && (yaml[offset + 1] === undefined || /[ \t\r\n]/.test(yaml[offset + 1] as string));
}

/** The first `:` at or after `from` that's followed by a blank, a line break or the end. */
function nextValueIndicator(yaml: string, from: number): number | null {
	for (let i = from; i < yaml.length; i++) {
		if (yaml[i] === ":" && (yaml[i + 1] === undefined || /[ \t\r\n]/.test(yaml[i + 1] as string))) return i;
	}
	return null;
}

function libyamlProblem(error: YAMLError, yaml: string): string {
	switch (error.code) {
		case "BAD_SCALAR_START":
			return "found character that cannot start any token";
		case "TAB_AS_INDENT":
			return "found a tab character that violates indentation";
		case "MISSING_CHAR":
			return "found unexpected end of stream";
		case "BAD_DQ_ESCAPE":
			return "found unknown escape character";
		case "BLOCK_AS_IMPLICIT_KEY":
			return "mapping values are not allowed in this context";
		case "MULTILINE_IMPLICIT_KEY":
			return isSequenceIndicator(yaml, error.pos[0]) ? "did not find expected key" : "could not find expected ':'";
		case "BAD_INDENT":
			if (error.message.startsWith("Flow sequence")) return "did not find expected ',' or ']'";
			if (error.message.startsWith("Flow map")) return "did not find expected ',' or '}'";
			return firstLine(error.message);
		default:
			return firstLine(error.message);
	}
}

function firstLine(message: string): string {
	return message.split("\n")[0] ?? message;
}

function duplicateKeyProblem(yaml: string): string {
	const duplicates: string[] = [];
	const firsts = new Map<string, { line: number; col: number }>();
	const lines = new LineCounter();
	const doc = parseDocument(yaml, { schema: "failsafe", resolveKnownTags: false, lineCounter: lines });
	visit(doc, {
		Map(_key, map) {
			const seen = new Set<string>();
			for (const pair of map.items) {
				const key = isScalar(pair.key) ? String(pair.key.value ?? "") : null;
				if (key === null) continue;
				if (seen.has(key)) {
					if (!duplicates.includes(key)) duplicates.push(key);
				} else {
					seen.add(key);
					if (!firsts.has(key) && isScalar(pair.key) && pair.key.range) {
						firsts.set(key, lines.linePos(pair.key.range[0]));
					}
				}
			}
		},
	});
	const first = duplicates[0] === undefined ? undefined : firsts.get(duplicates[0]);
	const names = [...duplicates].sort(compareCodeUnits).map((name) => `'${name}'`).join(", ");
	return (
		`Parser: expected all keys to be unique but found the following duplicated key(s): ${names}.\n` +
		`Context:\n${yaml} in line ${first?.line ?? 1}, column ${first?.col ?? 1}\n`
	);
}

class Reader {
	warnings: Warning[] = [];

	constructor(
		private readonly doc: Document,
		private readonly root: YAMLMap,
	) {}

	/** A scalar's text; null when missing or empty. */
	text(key: string): string | null {
		const node = this.value(key);
		if (node === undefined) return null;
		if (!isScalar(node)) {
			this.warnings.push({ case: "unexpectedValue", key });
			return null;
		}
		return isEmpty(node) ? null : scalarText(node);
	}

	date(key: string): LocalDate | null {
		const text = this.text(key);
		if (text === null) return null;
		const date = LocalDate.parse(text);
		if (!date) {
			this.warnings.push({ case: "invalidDate", key, value: text });
			return null;
		}
		return date;
	}

	/** `tags:` as a list of strings, or one string split on commas. Other items are skipped. */
	tags(): Tag[] {
		const node = this.value("tags");
		if (node === undefined) return [];
		let texts: string[];
		if (isSeq(node)) {
			texts = [];
			for (const item of node.items) {
				const resolved = this.resolve(item);
				if (isScalar(resolved) && !isEmpty(resolved)) texts.push(scalarText(resolved));
			}
		} else if (isScalar(node)) {
			texts = isEmpty(node) ? [] : scalarText(node).split(",").filter((part) => part !== "");
		} else {
			this.warnings.push({ case: "unexpectedValue", key: "tags" });
			return [];
		}
		return uniqueTags(texts.flatMap((text) => readTag(text) ?? []));
	}

	private value(key: string): unknown {
		for (const pair of this.root.items) {
			const k = this.resolve(pair.key);
			if (isScalar(k) && scalarText(k) === key) return this.resolve(pair.value);
		}
		return undefined;
	}

	private resolve(node: unknown): unknown {
		return isAlias(node) ? node.resolve(this.doc) : node;
	}
}

function scalarText(scalar: Scalar): string {
	return scalar.value === null || scalar.value === undefined ? "" : String(scalar.value);
}

/** Empty, or an unquoted YAML null (`~`, `null`). */
function isEmpty(scalar: Scalar): boolean {
	const text = scalarText(scalar);
	return text === "" || (scalar.type === "PLAIN" && ["~", "null", "Null", "NULL"].includes(text));
}

/** An `area` value: a `"[[Title]]"` link, or plain text read as the title. */
function areaLink(text: string): WikiLink | null {
	return readWikiLink(text) ?? readWikiLinkInner(text);
}

/** Finds an unindented `type: task|project|area` line, with optional quotes. */
function scanKind(yaml: string): Kind | null {
	for (const line of yaml.split(/\r?\n/)) {
		if (line === "" || !line.startsWith("type:")) continue;
		const value = trimBlanks(line.slice("type:".length)).replace(/^["']+|["']+$/g, "");
		return readKind(value);
	}
	return null;
}

/** `task`, `project` or `area`, ignoring case. */
function readKind(text: string): Kind | null {
	const lower = text.toLowerCase();
	return lower === "task" || lower === "project" || lower === "area" ? lower : null;
}
