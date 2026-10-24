import { characters, isNewlineCharacter, lowercased, splitOnCharacter, trimWhitespaceCharacters } from "./characters";

/*
 * Filenames from titles. The title is the filename without `.md`.
 */

const dropped: ReadonlySet<string> = new Set(["*", "?", '"', "<", ">", "[", "]", "#", "^"]);

/**
 * Replaces characters that are invalid in filenames or break Obsidian links.
 * `:` becomes ` -`, `/ \ |` become `-`, and `* ? " < > [ ] # ^` are dropped.
 * Leading dots (hidden files) and repeated spaces go; the result fits in 200 UTF-8 bytes.
 */
export function sanitise(title: string): string {
	let name = "";
	for (const character of characters(title)) {
		if (character === ":") name += " -";
		else if (character === "/" || character === "\\" || character === "|") name += "-";
		else if (dropped.has(character)) continue;
		else if (isNewlineCharacter(character) || character === "\t") name += " ";
		else name += character;
	}
	let parts = characters(splitOnCharacter(name, " ").join(" "));
	while (parts[0] === ".") parts = characters(parts.slice(1).join(""));
	parts = characters(trimWhitespaceCharacters(parts.join("")));
	let bytes = utf8Length(parts.join(""));
	while (bytes > 200) {
		bytes -= utf8Length(parts.pop() as string);
	}
	name = trimWhitespaceCharacters(parts.join(""));
	return name === "" ? "Untitled" : name;
}

/**
 * `<title>.md`, or `<title> 2.md`, `<title> 3.md`… when the name is taken; another extension, such as `png`, in place
 * of `md`. `existing` holds filenames in the target folder; matching ignores case, like APFS.
 */
export function filename(title: string, existing: Iterable<string>, extension = "md"): string {
	const base = sanitise(title);
	const taken = takenSet(existing);
	let candidate = `${base}.${extension}`;
	let number = 2;
	while (taken.has(key(candidate))) {
		candidate = `${base} ${number}.${extension}`;
		number++;
	}
	return candidate;
}

/**
 * A folder name from a title, as `sanitise` makes it, or `<name> 2`, `<name> 3`… when it's taken. `existing` holds the
 * names in the parent folder; matching ignores case.
 */
export function folderName(title: string, existing: Iterable<string>): string {
	const base = sanitise(title);
	const taken = takenSet(existing);
	let candidate = base;
	let number = 2;
	while (taken.has(key(candidate))) {
		candidate = `${base} ${number}`;
		number++;
	}
	return candidate;
}

/** `Name.png` → (`Name`, `png`); a name without an extension → (name, empty). */
export function splitFilename(name: string): { base: string; ext: string } {
	const parts = characters(name);
	const dot = parts.lastIndexOf(".");
	if (dot <= 0) return { base: name, ext: "" };
	return { base: parts.slice(0, dot).join(""), ext: parts.slice(dot + 1).join("") };
}

/** A name's identity in a folder: lowercased, and canonically equivalent spellings match, as Swift's `Set<String>` does. */
function key(name: string): string {
	return lowercased(name).normalize("NFC");
}

function takenSet(existing: Iterable<string>): Set<string> {
	return new Set(Array.from(existing, key));
}

function utf8Length(text: string): number {
	let length = 0;
	for (const scalar of text) {
		const code = scalar.codePointAt(0) as number;
		length += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
	}
	return length;
}
