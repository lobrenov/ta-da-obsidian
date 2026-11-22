import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { readTag, type Tag } from "../src/core/model/tag";
import { carrierCount, deleteTagEverywhere, failureMessage, fileCount, renameTagEverywhere } from "../src/ui/tagEdits";
import { makeItem } from "./support";

const tag = (name: string): Tag => readTag(name) as Tag;

const texts: Record<string, string> = {
	"Ta Da/tasks/C.md": "---\ntype: task\ntags: [work]\n---\n",
	"Ta Da/tasks/A.md": "---\ntype: task\ntags: [work, home]\n---\nSee #work.\n",
	"Ta Da/tasks/B.md": "---\ntype: task\ntags: |\n  work, x\n---\n#work\n",
	"Ta Da/tasks/D.md": "---\ntype: task\ntags: [other]\n---\n",
	"Ta Da/logbook/2026/E.md": "---\ntype: task\nstatus: Done\ntags: [Work/old]\n---\n",
	"Ta Da/tasks/F.md": "---\ntype: task\ntags: [work]\n---\nBody\n",
};
const index = new VaultIndex(Object.entries(texts).map(([path, text]) => makeItem(path, text.split("---\n")[1] as string, text.split("---\n")[2] ?? "")));

/** An app of fake files by path, and a writer that runs each edit on the file's text and keeps what it returns. */
function setup(fail: string[] = [], missing: string[] = []) {
	const files = new Map(Object.keys(texts).filter((path) => !missing.includes(path)).map((path) => [path, { path }]));
	const current = { ...texts };
	const order: string[] = [];
	const writer = {
		apply: vi.fn(async (file: { path: string }, edit: (text: string) => string | null) => {
			order.push(file.path);
			if (fail.includes(file.path)) throw new Error("disk");
			const next = edit(current[file.path] as string);
			if (next === null) return false;
			current[file.path] = next;
			return true;
		}),
	};
	const app = { vault: { getFileByPath: (path: string) => files.get(path) ?? null } };
	return { app: app as never, writer, current, order };
}

describe("renameTagEverywhere", () => {
	it("writes every carrier in path order, logged ones too, and not the others", async () => {
		const { app, writer, current, order } = setup();
		const result = await renameTagEverywhere(app, index, writer, tag("work"), tag("job"));
		expect(order).toEqual(["Ta Da/logbook/2026/E.md", "Ta Da/tasks/A.md", "Ta Da/tasks/B.md", "Ta Da/tasks/C.md", "Ta Da/tasks/F.md"]);
		expect(current["Ta Da/tasks/A.md"]).toBe("---\ntype: task\ntags: [job, home]\n---\nSee #job.\n");
		expect(current["Ta Da/logbook/2026/E.md"]).toBe("---\ntype: task\nstatus: Done\ntags: [job/old]\n---\n");
		expect(current["Ta Da/tasks/D.md"]).toBe(texts["Ta Da/tasks/D.md"]);
		expect(result).toEqual({ carriers: 5, failed: 1 });
	});

	it("counts a file whose tags: can't be spliced, still editing its body", async () => {
		const { app, writer, current } = setup();
		const result = await renameTagEverywhere(app, index, writer, tag("work"), tag("job"));
		expect(current["Ta Da/tasks/B.md"]).toBe("---\ntype: task\ntags: |\n  work, x\n---\n#job\n");
		expect(result.failed).toBe(1);
	});

	it("counts a write that throws or a file that's gone, and goes on to the rest", async () => {
		const { app, writer, current } = setup(["Ta Da/tasks/A.md"], ["Ta Da/tasks/F.md"]);
		const result = await renameTagEverywhere(app, index, writer, tag("work"), tag("job"));
		expect(result).toEqual({ carriers: 5, failed: 3 });
		expect(current["Ta Da/tasks/C.md"]).toBe("---\ntype: task\ntags: [job]\n---\n");
	});

	it("leaves a file the edit doesn't change to the writer as null", async () => {
		const { app, writer } = setup();
		await renameTagEverywhere(app, index, writer, tag("work/old"), tag("Work/old"));
		const edit = writer.apply.mock.calls[0]?.[1] as (text: string) => string | null;
		expect(edit(texts["Ta Da/logbook/2026/E.md"] as string)).toBeNull();
	});
});

describe("deleteTagEverywhere", () => {
	it("removes the tag and its children from tags: and the body", async () => {
		const { app, writer, current } = setup();
		const result = await deleteTagEverywhere(app, index, writer, tag("work"));
		expect(current["Ta Da/tasks/A.md"]).toBe("---\ntype: task\ntags: [home]\n---\nSee.\n");
		expect(current["Ta Da/logbook/2026/E.md"]).toBe("---\ntype: task\nstatus: Done\ntags:\n---\n");
		expect(result).toEqual({ carriers: 5, failed: 1 });
	});

	it("does nothing for a tag no file carries", async () => {
		const { app, writer } = setup();
		expect(await deleteTagEverywhere(app, index, writer, tag("none"))).toEqual({ carriers: 0, failed: 0 });
		expect(writer.apply).not.toHaveBeenCalled();
	});
});

describe("wording", () => {
	it("counts carriers and says files", () => {
		expect(carrierCount(index, tag("work"))).toBe(5);
		expect(fileCount(1)).toBe("1 file");
		expect(fileCount(2)).toBe("2 files");
	});

	it("names the tag and the count in the failure notice, never a file", () => {
		expect(failureMessage(tag("work"), 0)).toBeNull();
		expect(failureMessage(tag("work"), 1)).toBe("1 file still has “work”. Ta Da can’t edit its tags property.");
		expect(failureMessage(tag("work"), 3)).toBe("3 files still have “work”. Ta Da can’t edit their tags property.");
	});
});
