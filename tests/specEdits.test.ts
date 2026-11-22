import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deleteInlineTags, renameInlineTags } from "../src/core/syntax/tagEdit";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
/** The markdown spec's edit cases, in the Live editor's package, cloned beside the Ta Da repo. */
const editsFolder = resolve(repoRoot, "../swift-markdown-engine-extended/spec/edits");

interface EditCase {
	name: string;
	command: string;
	args: { from: string; to?: string };
	before: string;
	after: string;
	skip?: Record<string, string>;
}

const file = join(editsFolder, "tags.json");
if (!existsSync(file)) throw new Error(`The markdown spec is missing: ${file}`);
const cases = (JSON.parse(readFileSync(file, "utf8")) as { cases: EditCase[] }).cases;

describe("spec tag edits", () => {
	it("has cases", () => {
		expect(cases.length).toBeGreaterThan(30);
	});

	for (const testCase of cases) {
		(testCase.skip !== undefined && "ta-da-obsidian" in testCase.skip ? it.skip : it)(testCase.name, () => {
			const { command, args, before, after } = testCase;
			const result =
				command === "tag.rename" ? renameInlineTags(args.from, args.to as string, before) : deleteInlineTags(args.from, before);
			expect(result).toBe(after);
		});
	}
});
