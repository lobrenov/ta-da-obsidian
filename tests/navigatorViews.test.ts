import { describe, expect, it } from "vitest";
import type { Domain } from "../src/ui/navigator/domain";
import { defaultDomain, offersDomain, viewKinds, viewSpecs } from "../src/ui/navigator/views";

const domains: Domain[] = [
	{ kind: "agenda" },
	{ kind: "loose" },
	{ kind: "logbook" },
	{ kind: "trash" },
	{ kind: "project", path: "p.md" },
	{ kind: "area", path: "a.md" },
	{ kind: "tag", path: null },
	{ kind: "search", query: "x" },
];

const offered = (view: (typeof viewKinds)[number]): string[] => domains.filter((domain) => offersDomain(view, domain)).map((domain) => domain.kind);

describe("views", () => {
	it("are Agenda, Tasks and Tags, each with its own type, title and icon", () => {
		expect(viewKinds.map((kind) => viewSpecs[kind].title)).toEqual(["Ta Da: Agenda", "Ta Da: Tasks", "Ta Da: Tags"]);
		expect(new Set(viewKinds.map((kind) => viewSpecs[kind].type)).size).toBe(3);
		expect(new Set(viewKinds.map((kind) => viewSpecs[kind].icon)).size).toBe(3);
		expect(viewKinds.map((kind) => viewSpecs[kind].openName)).toEqual(["Open Ta Da: Agenda", "Open Ta Da: Tasks", "Open Ta Da: Tags"]);
	});

	it("offer the Agenda only in Agenda, the Tasks lists in Tasks, tags in Tags, and search in Tasks and Tags", () => {
		expect(offered("agenda")).toEqual(["agenda"]);
		expect(offered("tasks")).toEqual(["loose", "logbook", "trash", "project", "area", "search"]);
		expect(offered("tags")).toEqual(["tag", "search"]);
	});

	it("start on a domain the view offers", () => {
		for (const kind of viewKinds) expect(offersDomain(kind, defaultDomain(kind))).toBe(true);
	});
});
