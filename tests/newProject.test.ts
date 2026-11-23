import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { LocalDate } from "../src/core/model/localDate";
import { makeItem } from "./support";

vi.mock("obsidian", () => ({}));

const { createProject } = await import("../src/ui/newProject");

const today = LocalDate.parse("2026-10-02") as LocalDate;

function vault(taken: string[]) {
	const created: { path: string; text: string }[] = [];
	const folders = new Set(["Ta Da", "Ta Da/projects"]);
	return {
		created,
		vault: {
			getFolderByPath: (path: string) => (folders.has(path) ? { children: path === "Ta Da/projects" ? taken.map((name) => ({ name })) : [] } : null),
			createFolder: async (path: string) => void folders.add(path),
			create: async (path: string, text: string) => (created.push({ path, text }), { path, basename: path.slice(path.lastIndexOf("/") + 1, -3) }),
		},
	};
}

describe("createProject", () => {
	it("makes a project file in the projects folder with a project's frontmatter", async () => {
		const { vault: v, created } = vault([]);
		const file = await createProject({ app: { vault: v } as never, index: new VaultIndex(), today: () => today }, "Trip");
		expect(created).toEqual([{ path: "Ta Da/projects/Trip.md", text: "---\ntype: project\nstatus: Not Started\ncreatedDate: 2026-10-02\n---\n" }]);
		expect(file.basename).toBe("Trip");
	});

	it("numbers a name taken in the folder or by any project's title", async () => {
		const { vault: v, created } = vault(["Trip.md"]);
		await createProject({ app: { vault: v } as never, index: new VaultIndex([makeItem("Ta Da/Logbook/Trip 2.md", "type: project")]), today: () => today }, "Trip");
		expect(created[0]?.path).toBe("Ta Da/projects/Trip 3.md");
	});
});
