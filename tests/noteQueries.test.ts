import { describe, expect, it } from "vitest";
import { type FolderNode, folderTree, looseNotes, notesIn } from "../src/core/index/noteQueries";
import { tagBrowser, tagTree, untagged } from "../src/core/index/tagQueries";
import { VaultIndex } from "../src/core/index/vaultIndex";
import * as queries from "../src/core/index/queries";
import { LocalDate } from "../src/core/model/localDate";
import { readTag, type Tag } from "../src/core/model/tag";
import { folderOf } from "../src/core/storage/vault";
import { compareCodeUnits } from "../src/core/text";
import { loadFixtureIndex } from "./fixtureVault";
import { makeItem, titles } from "./support";

const emptyFolders = new Set(["Empty", "Typed/Sub"]);

function describeNodes(nodes: FolderNode[], depth = 0): string[] {
	return nodes.flatMap((node) => [`${"  ".repeat(depth)}${node.name} ${node.count}`, ...describeNodes(node.children, depth + 1)]);
}

describe("note queries on NoteVault", () => {
	const index = loadFixtureIndex("NoteVault");

	it("treats the untyped files outside the to-do folders as notes", () => {
		expect(index.notes.map((note) => note.path).sort(compareCodeUnits)).toEqual([
			"Loose idea.md",
			"Meetings/2026/Standup.md",
			"Meetings/Ark planning call.md",
			"Reading list.md",
			"Work/Clients/Brief.md",
		]);
		expect(index.get("Typed/Task elsewhere.md")?.properties.kind).toBe("task");
		expect(index.get("tasks/Untyped in tasks.md")).toBeUndefined();
		expect(index.get("attachments/Untyped in attachments.md")).toBeUndefined();
	});

	it("rolls note counts up the folder tree and sorts by name", () => {
		expect(describeNodes(folderTree(index, emptyFolders))).toEqual([
			"Empty 0",
			"Meetings 2",
			"  2026 1",
			"Typed 0",
			"  Sub 0",
			"Work 1",
			"  Clients 1",
		]);
	});

	it("keeps a known folder when its last note goes", () => {
		const known = new Set(index.notes.map((note) => folderOf(note.path)).filter((folder) => folder !== ""));
		index.remove("Meetings/2026/Standup.md");
		expect(notesIn(index, "Meetings/2026")).toEqual([]);
		expect(describeNodes(folderTree(index, known)).slice(0, 2)).toEqual(["Meetings 1", "  2026 0"]);
	});

	it("adds the parents of empty folders", () => {
		const small = new VaultIndex([makeItem("b/Note.md", "tags: []")]);
		expect(describeNodes(folderTree(small, new Set(["a/x/y", "C/z"])))).toEqual(["a 0", "  x 0", "    y 0", "b 1", "C 0", "  z 0"]);
	});

	it("lists a folder's notes without its subfolders", () => {
		const fresh = loadFixtureIndex("NoteVault");
		expect(titles(looseNotes(fresh))).toEqual(["Loose idea", "Reading list"]);
		expect(titles(notesIn(fresh, "Meetings"))).toEqual(["Ark planning call"]);
		expect(notesIn(fresh, "Work")).toEqual([]);
		expect(notesIn(fresh, "Empty")).toEqual([]);
	});

	it("counts notes in tags and Untagged", () => {
		const fresh = loadFixtureIndex("NoteVault");
		const work = readTag("work") as Tag;
		expect(tagTree(fresh).find((node) => node.tag.path === "work")?.count).toBe(3);
		expect(titles(tagBrowser(fresh, work).notes)).toEqual(["Ark planning call", "Standup"]);
		expect(titles(untagged(fresh))).toEqual(["Brief", "Loose idea", "Task elsewhere"]);
		expect(titles(tagBrowser(fresh, null).notes)).toEqual(["Brief", "Loose idea"]);
	});

	it("keeps notes out of the to-do lists", () => {
		const fresh = loadFixtureIndex("NoteVault");
		const today = LocalDate.parse("2026-10-10") as LocalDate;
		expect(titles(queries.looseTasks(fresh))).toEqual(["Ship it", "Task elsewhere"]);
		expect(queries.todayTasks(fresh, today)).toEqual([]);
		expect(queries.upcoming(fresh, today)).toEqual([]);
	});
});
