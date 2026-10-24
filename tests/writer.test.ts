import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
	MarkdownView: class MarkdownView {},
	normalizePath: (path: string) => path.replace(/ /g, " ").replace(/\/+/g, "/").replace(/^\/|\/$/g, ""),
}));

const { MarkdownView } = await import("obsidian");
const { Writer } = await import("../src/Writer");

/** The mocked `MarkdownView` takes no arguments; the real typings want a leaf. */
const newView = (): object => new (MarkdownView as unknown as new () => object)();

interface FakeFile {
	path: string;
	name: string;
	extension: string;
	parent: { path: string; children: { name: string }[] };
}

function makeFile(path: string, siblings: string[] = []): FakeFile {
	const parts = path.split("/");
	const name = parts.pop() as string;
	const folder = parts.join("/");
	return {
		path,
		name,
		extension: "md",
		parent: { path: folder, children: [name, ...siblings].map((entry) => ({ name: entry })) },
	};
}

interface Fake {
	writer: InstanceType<typeof Writer>;
	process: ReturnType<typeof vi.fn>;
	renameFile: ReturnType<typeof vi.fn>;
}

/** An `App` with a vault that holds `texts`, and no open views unless `views` gives them. */
function makeApp(options: { read?: (file: FakeFile) => Promise<string>; current?: string; active?: unknown; leaves?: unknown[] } = {}): Fake {
	const process = vi.fn(async (_file: FakeFile, fn: (text: string) => string) => fn(options.current ?? "base"));
	const renameFile = vi.fn(async () => undefined);
	const app = {
		vault: { read: options.read ?? (async () => "base"), process },
		fileManager: { renameFile },
		workspace: {
			getActiveViewOfType: () => options.active ?? null,
			getLeavesOfType: () => options.leaves ?? [],
		},
	};
	// The fake has only what Writer uses.
	return { writer: new Writer(app as never), process, renameFile };
}

describe("Writer", () => {
	it("runs two applies on the same file in order", async () => {
		const fake = makeApp({
			read: async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return "base";
			},
		});
		const file = makeFile("a.md");
		const order: string[] = [];
		const first = fake.writer.apply(file as never, (text) => {
			order.push("first");
			return `${text}1`;
		});
		const second = fake.writer.apply(file as never, (text) => {
			order.push("second");
			return `${text}2`;
		});
		await Promise.all([first, second]);
		expect(order).toEqual(["first", "second"]);
		expect(fake.process).toHaveBeenCalledTimes(2);
	});

	it("keeps the queue going after a rejection", async () => {
		const fake = makeApp();
		const file = makeFile("a.md");
		const failed = fake.writer.apply(file as never, () => {
			throw new Error("boom");
		});
		await expect(failed).rejects.toThrow("boom");
		await expect(fake.writer.apply(file as never, (text) => `${text}!`)).resolves.toBe(true);
	});

	it("recomputes the edit when process hands over different text", async () => {
		const fake = makeApp({ current: "newer" });
		const edit = vi.fn((text: string) => `${text}+`);
		const result = vi.fn();
		fake.process.mockImplementation(async (_file, fn: (text: string) => string) => {
			result(fn("newer"));
			return "";
		});
		await fake.writer.apply(makeFile("a.md") as never, edit);
		expect(edit.mock.calls.map(([text]) => text)).toEqual(["base", "newer"]);
		expect(result).toHaveBeenCalledWith("newer+");
	});

	it("uses the computed text when process hands over the text it read", async () => {
		const fake = makeApp({ current: "base" });
		const edit = vi.fn((text: string) => `${text}+`);
		const result = vi.fn();
		fake.process.mockImplementation(async (_file, fn: (text: string) => string) => {
			result(fn("base"));
			return "";
		});
		await fake.writer.apply(makeFile("a.md") as never, edit);
		expect(edit).toHaveBeenCalledTimes(1);
		expect(result).toHaveBeenCalledWith("base+");
	});

	it("writes nothing when the edit returns null", async () => {
		const fake = makeApp();
		await expect(fake.writer.apply(makeFile("a.md") as never, () => null)).resolves.toBe(false);
		await expect(fake.writer.apply(makeFile("a.md") as never, (text) => text)).resolves.toBe(false);
		expect(fake.process).not.toHaveBeenCalled();
	});

	it("changes the active view's editor as one transaction on the changed text", async () => {
		const file = makeFile("a.md");
		const view = Object.assign(newView(), {
			file,
			editor: { getValue: () => "---\nstatus: Doing\n---\n", transaction: vi.fn() },
		});
		const fake = makeApp({ active: view });
		await expect(fake.writer.apply(file as never, (text) => text.replace("Doing", "Done"))).resolves.toBe(true);
		expect(view.editor.transaction).toHaveBeenCalledWith({
			changes: [{ from: { line: 1, ch: 10 }, to: { line: 1, ch: 13 }, text: "ne" }],
		});
		expect(fake.process).not.toHaveBeenCalled();
	});

	it("finds an open view among the leaves when the active one shows another file", async () => {
		const file = makeFile("a.md");
		const other = Object.assign(newView(), { file: makeFile("b.md") });
		const view = Object.assign(newView(), { file, editor: { getValue: () => "x", transaction: vi.fn() } });
		const fake = makeApp({ active: other, leaves: [{ view: other }, { view }] });
		await fake.writer.apply(file as never, () => "y");
		expect(view.editor.transaction).toHaveBeenCalledTimes(1);
	});

	it("renames to a numbered name when the name is taken", async () => {
		const fake = makeApp();
		const file = makeFile("Ta Da/tasks/Old.md", ["Task.md", "Other.md"]);
		await fake.writer.rename(file as never, "Task");
		expect(fake.renameFile).toHaveBeenCalledWith(file, "Ta Da/tasks/Task 2.md");
	});

	it("doesn't rename to the name the file has", async () => {
		const fake = makeApp();
		await fake.writer.rename(makeFile("Ta Da/tasks/Task.md") as never, "Task");
		expect(fake.renameFile).not.toHaveBeenCalled();
	});

	it("treats a non-breaking space as a space when checking for a taken name", async () => {
		const fake = makeApp();
		const file = makeFile("tasks/Old.md", ["a b.md"]);
		await fake.writer.rename(file as never, "a b");
		expect(fake.renameFile).toHaveBeenCalledWith(file, "tasks/a b 2.md");
	});
});
