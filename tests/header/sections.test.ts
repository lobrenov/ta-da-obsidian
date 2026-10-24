import { describe, expect, it } from "vitest";
import { kindOfFrontmatter, ownsHeader } from "../../src/ui/header/sections";

const withBody = "---\ntype: task\n---\n\nFirst paragraph\n\n- [ ] box\n";
const noBody = "---\ntype: project\n---\n";

describe("ownsHeader", () => {
	it("gives the header to the first section after the frontmatter", () => {
		expect(ownsHeader(withBody, 3)).toBe(true);
		expect(ownsHeader(withBody, 4)).toBe(true);
		expect(ownsHeader(withBody, 6)).toBe(false);
	});

	it("leaves the frontmatter section out when there is a body", () => {
		expect(ownsHeader(withBody, 0)).toBe(false);
	});

	it("gives a body-less file's header to the frontmatter section", () => {
		expect(ownsHeader(noBody, 0)).toBe(true);
		expect(ownsHeader(`${noBody}\n\n`, 0)).toBe(true);
	});
});

describe("kindOfFrontmatter", () => {
	it("reads the declared kind", () => {
		expect(kindOfFrontmatter({ type: "Task" })).toBe("task");
		expect(kindOfFrontmatter({ type: "project" })).toBe("project");
		expect(kindOfFrontmatter({ type: "meeting" })).toBeUndefined();
		expect(kindOfFrontmatter(null)).toBeUndefined();
		expect(kindOfFrontmatter({})).toBeUndefined();
	});
});
