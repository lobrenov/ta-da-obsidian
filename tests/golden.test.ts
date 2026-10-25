import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { WikiLink } from "../src/core/model/wikiLink";
import { scanBody } from "../src/core/parsing/bodyScanner";
import { splitFrontmatter } from "../src/core/parsing/frontmatterSplitter";
import { taDaRepo } from "./taDaRepo";

/** The Ta Da repo's fixture vaults, beside this repo, and what its body scanner read from them. */
const fixtures = resolve(taDaRepo, "Packages/TaDaCore/Tests/TaDaCoreTests/Fixtures");
const goldenFile = join(fixtures, "BodyScans.txt");

const linkText = (link: WikiLink): string => link.target + (link.heading ? `#${link.heading}` : "") + (link.alias ? `|${link.alias}` : "");

/** One block per file: its path, then each non-empty part of its scan. */
function render(name: string, text: string): string {
	const split = splitFrontmatter(text);
	const scan = scanBody(split.body, split.bodyFirstLineIndex);
	const lines = [`## ${name}`];
	if (scan.summary !== null) lines.push(`summary: ${scan.summary}`);
	const parts: [string, string][] = [
		["checkboxes", scan.checkboxes.map((box) => `[${box.marker}]${box.lineIndex}:${box.column}`).join(" ")],
		["links", scan.links.map(linkText).join(", ")],
		["embeds", scan.embeds.map(linkText).join(", ")],
		["tags", scan.tags.map((tag) => tag.name).join(", ")],
	];
	for (const [label, value] of parts) if (value !== "") lines.push(`${label}: ${value}`);
	return lines.join("\n");
}

if (!existsSync(goldenFile)) throw new Error(`The Ta Da repo's fixtures are missing: ${goldenFile}`);

const golden = readFileSync(goldenFile, "utf8")
	.split("\n\n")
	.map((block) =>
		block
			.split("\n")
			.filter((line) => !line.startsWith("linkTargets:") && !line.startsWith("embedTargets:"))
			.join("\n")
			.trim(),
	)
	.filter((block) => block !== "");

describe("body scans of the fixture vaults", () => {
	it.each(golden.map((block) => [(block.split("\n")[0] as string).slice(3), block] as const))("%s", (path, block) => {
		expect(render(path, readFileSync(join(fixtures, path), "utf8"))).toBe(block);
	});
});
