import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanFacts } from "../src/core/syntax/facts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
/** The markdown spec's grammar cases, in the Live editor's package, cloned beside the Ta Da repo. */
const grammarFolder = resolve(repoRoot, "../swift-markdown-engine-extended/spec/grammar");

interface Expected {
	summary: string | null;
	tasks: { line: number; marker: string; text: string }[];
	links: { line: number; target: string; heading?: string; block?: string; alias?: string }[];
	embeds: { line: number; target: string; heading?: string; block?: string; segments?: string[] }[];
	tags: { line: number; tag: string }[];
	skip?: Record<string, string>;
}

if (!existsSync(grammarFolder)) throw new Error(`The markdown spec is missing: ${grammarFolder}`);

const cases = readdirSync(grammarFolder)
	.filter((name) => name.endsWith(".md"))
	.map((name) => name.slice(0, -3))
	.sort();

const optedOut = (name: string): boolean => {
	const expected = JSON.parse(readFileSync(join(grammarFolder, `${name}.facts.json`), "utf8")) as Expected;
	return expected.skip !== undefined && "ta-da-obsidian" in expected.skip;
};

/** Leaves out the optional fields a fact doesn't have, as the spec's JSON does. */
function present<T extends Record<string, unknown>>(value: T): Partial<T> {
	return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null && v !== undefined)) as Partial<T>;
}

describe("spec grammar", () => {
	it("has cases", () => {
		expect(cases.length).toBeGreaterThan(20);
	});

	for (const name of cases) {
		(optedOut(name) ? it.skip : it)(name, () => {
			const body = readFileSync(join(grammarFolder, `${name}.md`), "utf8");
			const expected = JSON.parse(readFileSync(join(grammarFolder, `${name}.facts.json`), "utf8")) as Expected;
			const facts = scanFacts(body);
			expect({
				summary: facts.summary,
				tasks: facts.tasks.map((task) => ({ line: task.line, marker: task.marker, text: task.text })),
				links: facts.links.map((fact) => present({ line: fact.line, ...fact.parts })),
				embeds: facts.embeds.map((fact) =>
					present({
						line: fact.line,
						target: fact.target,
						heading: fact.heading,
						block: fact.block,
						segments: fact.segments.length === 0 ? null : fact.segments,
					}),
				),
				tags: facts.tags.map((tag) => ({ line: tag.line, tag: tag.name })),
			}).toEqual({
				summary: expected.summary,
				tasks: expected.tasks,
				links: expected.links,
				embeds: expected.embeds,
				tags: expected.tags,
			});
		});
	}
});
