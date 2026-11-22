import { describe, expect, it } from "vitest";
import { readTag, type Tag } from "../src/core/model/tag";
import { followsEdit, followTag, type TagState } from "../src/ui/navigator/tagState";

const tag = (name: string): Tag => readTag(name) as Tag;

const state = (extra: Partial<TagState> = {}): TagState => ({
	domain: { kind: "tag", path: "home/garden" },
	picked: new Map([
		["agenda", new Set(["home", "home/garden", "work", ""])],
		["tag:home", new Set(["home/garden"])],
		["tag:work", new Set(["work/x"])],
	]),
	folds: new Set(["tag:home|Tasks", "tag:home/garden|Notes", "tag:work|Tasks", "agenda|Tag: #Home/Garden", "agenda|Tag: #work", "loose|Status: Done"]),
	expanded: new Set(["tag:home", "tag:home/garden", "tag:work"]),
	...extra,
});

const sorted = (set: ReadonlySet<string>): string[] => [...set].sort();

describe("followTag, renaming", () => {
	const { state: next, domain } = followTag(state(), tag("Home"), tag("House"));

	it("moves the tag page on screen", () => {
		expect(domain).toEqual({ kind: "tag", path: "house/garden" });
	});

	it("moves tag filters and their lists' keys, leaving other tags and No tag", () => {
		expect([...(next.picked.get("agenda") ?? [])].sort()).toEqual(["", "house", "house/garden", "work"]);
		expect([...(next.picked.get("tag:house") ?? [])]).toEqual(["house/garden"]);
		expect(next.picked.has("tag:home")).toBe(false);
		expect([...(next.picked.get("tag:work") ?? [])]).toEqual(["work/x"]);
	});

	it("moves open rows and folds, those of a Tag group too", () => {
		expect(sorted(next.expanded)).toEqual(["tag:house", "tag:house/garden", "tag:work"]);
		expect(sorted(next.folds)).toEqual(
			["agenda|Tag: #House/Garden", "agenda|Tag: #work", "loose|Status: Done", "tag:house/garden|Notes", "tag:house|Tasks", "tag:work|Tasks"].sort(),
		);
	});

	it("follows a rename into a nested path, and a case-only rename", () => {
		expect(followTag(state(), tag("home"), tag("a/b")).domain).toEqual({ kind: "tag", path: "a/b/garden" });
		expect(followTag(state(), tag("home"), tag("Home")).domain).toEqual({ kind: "tag", path: "home/garden" });
	});

	it("leaves a sibling that merely starts with the same letters", () => {
		const result = followTag(state({ domain: { kind: "tag", path: "homework" }, expanded: new Set(["tag:homework"]) }), tag("home"), tag("house"));
		expect(result.domain).toEqual({ kind: "tag", path: "homework" });
		expect(sorted(result.state.expanded)).toEqual(["tag:homework"]);
	});
});

describe("followTag, deleting", () => {
	const { state: next, domain } = followTag(state(), tag("home"), null);

	it("drops the tag page on screen, for the caller to replace", () => {
		expect(domain).toBeNull();
	});

	it("drops the tag, its children and their state", () => {
		expect([...(next.picked.get("agenda") ?? [])].sort()).toEqual(["", "work"]);
		expect([...next.picked.keys()].sort()).toEqual(["agenda", "tag:work"]);
		expect(sorted(next.expanded)).toEqual(["tag:work"]);
		expect(sorted(next.folds)).toEqual(["agenda|Tag: #work", "loose|Status: Done", "tag:work|Tasks"]);
	});

	it("keeps a domain that isn't a tag", () => {
		expect(followTag(state({ domain: { kind: "loose" } }), tag("home"), null).domain).toEqual({ kind: "loose" });
		expect(followTag(state({ domain: { kind: "tag", path: null } }), tag("home"), null).domain).toEqual({ kind: "tag", path: null });
	});
});

describe("followsEdit", () => {
	it("follows once every carrier is written, or when only the case changed", () => {
		expect(followsEdit(tag("home"), tag("house"), 0)).toBe(true);
		expect(followsEdit(tag("home"), null, 0)).toBe(true);
		expect(followsEdit(tag("home"), tag("house"), 1)).toBe(false);
		expect(followsEdit(tag("home"), null, 2)).toBe(false);
		expect(followsEdit(tag("home"), tag("Home"), 1)).toBe(true);
	});
});
