import { describe, expect, it } from "vitest";
import { type LineChange, lineChange } from "../src/core/writing/lineChange";

/** Applies a change to a text as an editor would. */
function apply(text: string, change: LineChange): string {
	const lines = text.split("\n");
	const offset = ({ line, ch }: { line: number; ch: number }): number =>
		lines.slice(0, line).reduce((total, entry) => total + entry.length + 1, 0) + ch;
	return text.slice(0, offset(change.from)) + change.text + text.slice(offset(change.to));
}

describe("lineChange", () => {
	it("is null for equal texts", () => {
		expect(lineChange("a\nb\n", "a\nb\n")).toBeNull();
	});

	it("covers only the changed line", () => {
		const before = "---\ntype: task\nstatus: Doing\n---\nBody\n";
		const after = "---\ntype: task\nstatus: Done\n---\nBody\n";
		expect(lineChange(before, after)).toEqual({ from: { line: 2, ch: 10 }, to: { line: 2, ch: 13 }, text: "ne" });
	});

	it("covers an insertion and a deletion in the middle", () => {
		expect(lineChange("a\nb\n", "a\nx\nb\n")).toEqual({ from: { line: 1, ch: 0 }, to: { line: 1, ch: 0 }, text: "x\n" });
		expect(lineChange("a\nx\nb\n", "a\nb\n")).toEqual({ from: { line: 1, ch: 0 }, to: { line: 2, ch: 0 }, text: "" });
	});

	it("reaches the end of a text with no final line break", () => {
		expect(lineChange("a\nb", "a\nc")).toEqual({ from: { line: 1, ch: 0 }, to: { line: 1, ch: 1 }, text: "c" });
		expect(lineChange("a", "a\nb")).toEqual({ from: { line: 0, ch: 1 }, to: { line: 0, ch: 1 }, text: "\nb" });
		expect(lineChange("a\nb", "a")).toEqual({ from: { line: 0, ch: 1 }, to: { line: 1, ch: 1 }, text: "" });
		expect(lineChange("", "x")).toEqual({ from: { line: 0, ch: 0 }, to: { line: 0, ch: 0 }, text: "x" });
	});

	it("leaves a caret inside a changed line in place", () => {
		// Caret after "sta" is untouched by a change at the end of the line; caret after "Do" too.
		const change = lineChange("status: Doing\n", "status: Done\n") as LineChange;
		expect(change.from.ch).toBeGreaterThanOrEqual(10);
		expect(lineChange("- [ ] a\n", "- [x] a\n")).toEqual({ from: { line: 0, ch: 3 }, to: { line: 0, ch: 4 }, text: "x" });
		expect(lineChange("abc\ndef\n", "aXc\ndYf\n")).toEqual({ from: { line: 0, ch: 1 }, to: { line: 1, ch: 2 }, text: "X" + "c\nd" + "Y" });
	});

	it("doesn't split a surrogate pair", () => {
		const change = lineChange("a😀b", "a😁b") as LineChange;
		expect(apply("a😀b", change)).toBe("a😁b");
		expect(change.text).toBe("😁");
	});

	it("turns any text into any other", () => {
		const texts = ["", "\n", "a", "a\n", "a\nb", "a\nb\n", "b\na\n", "a\n\nb\n", "x\na\nb\nx", "a\nb\nb\nb\n", "a\nb\nb\n", "---\nx: 1\n---\n", "---\nx: 1\ny: 2\n---\n", "a😀b", "a😁b", "abab", "ab", "aXa\naXa"];
		for (const before of texts) {
			for (const after of texts) {
				const change = lineChange(before, after);
				expect(change === null ? before : apply(before, change), JSON.stringify([before, after])).toBe(after);
			}
		}
	});
});
