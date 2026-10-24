// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { VaultIndex } from "../../src/core/index/vaultIndex";
import { LocalDate } from "../../src/core/model/localDate";
import { buildHeader, type HeaderActions } from "../../src/ui/header/buildHeader";
import { buildHeaderModel } from "../../src/ui/header/headerModel";
import { makeItem } from "../support";

const today = LocalDate.parse("2026-10-02") as LocalDate;

function actions() {
	return {
		openStatus: vi.fn<(anchor: HTMLElement) => void>(),
		openParent: vi.fn<(anchor: HTMLElement) => void>(),
		openDate: vi.fn<(key: "dueDate" | "deadline", anchor: HTMLElement) => void>(),
		openRepeat: vi.fn<(anchor: HTMLElement) => void>(),
		openAddTag: vi.fn<(anchor: HTMLElement) => void>(),
		removeTag: vi.fn<(name: string) => void>(),
		toggleProperties: vi.fn<() => boolean>(() => true),
	} satisfies HeaderActions;
}

const task = makeItem(
	"Ta Da/tasks/Write.md",
	'type: task\nstatus: Doing\nproject: "[[Nowhere]]"\ndueDate: 2026-10-02\ntags: [dev, home/garden]',
	"- [x] one\n- [ ] two\n#text\n",
);
const model = buildHeaderModel(task, new VaultIndex([task]), today);
if (!model) throw new Error("no model");

describe("buildHeader", () => {
	it("draws the chips, tags and summary", () => {
		const header = buildHeader(document, model, actions(), false);
		const chips = [...header.querySelectorAll(".ta-da-chip")].map((chip) => chip.textContent);
		expect(chips).toEqual(["Doing", "Nowhere", "Due Today", "Deadline", "Repeat"]);
		expect(header.querySelector(".is-parent")?.classList.contains("is-unresolved")).toBe(true);
		expect(header.querySelector(".is-deadline")?.classList.contains("is-missing")).toBe(true);
		const tags = [...header.querySelectorAll(".ta-da-tag")].map((tag) => tag.textContent);
		expect(tags).toEqual(["dev", "home/garden", "text"]);
		expect(header.querySelectorAll(".ta-da-tag-remove")).toHaveLength(2);
		expect(header.querySelector(".ta-da-tag.is-text")?.textContent).toBe("text");
		expect(header.querySelector(".ta-da-summary")?.textContent).toBe("1/2 subtasks");
	});

	it("opens each chip's menu under that chip", () => {
		const a = actions();
		const header = buildHeader(document, model, a, false);
		const chip = (kind: string): HTMLElement => header.querySelector(`.ta-da-chip.is-${kind}`) as HTMLElement;
		chip("status").click();
		chip("parent").click();
		chip("dueDate").click();
		chip("deadline").click();
		chip("repeat").click();
		expect(a.openStatus).toHaveBeenCalledWith(chip("status"));
		expect(a.openParent).toHaveBeenCalledWith(chip("parent"));
		expect(a.openDate.mock.calls).toEqual([
			["dueDate", chip("dueDate")],
			["deadline", chip("deadline")],
		]);
		expect(a.openRepeat).toHaveBeenCalledWith(chip("repeat"));
	});

	it("adds and removes tags", () => {
		const a = actions();
		const header = buildHeader(document, model, a, false);
		(header.querySelector(".ta-da-tag-add") as HTMLElement).click();
		expect(a.openAddTag).toHaveBeenCalledOnce();
		(header.querySelector('[aria-label="Remove tag home/garden"]') as HTMLElement).click();
		expect(a.removeTag).toHaveBeenCalledWith("home/garden");
	});

	it("flips the Properties button with the state the action returns", () => {
		const a = actions();
		const header = buildHeader(document, model, a, false);
		const button = header.querySelector(".ta-da-properties-button") as HTMLElement;
		expect(button.getAttribute("aria-pressed")).toBe("false");
		button.click();
		expect(a.toggleProperties).toHaveBeenCalledOnce();
		expect(button.getAttribute("aria-pressed")).toBe("true");
		expect(button.classList.contains("is-on")).toBe(true);
		expect(buildHeader(document, model, a, true).querySelector(".ta-da-properties-button")?.getAttribute("aria-pressed")).toBe("true");
	});

	it("puts file content in as text, never as markup", () => {
		const hostile = makeItem("Ta Da/tasks/Hostile.md", 'type: task\nproject: "[[<img src=x onerror=alert(1)>]]"\nrepeat: "<b>x</b>"\ntags: ["<i>t</i>"]');
		const hostileModel = buildHeaderModel(hostile, new VaultIndex([hostile]), today);
		if (!hostileModel) throw new Error("no model");
		const header = buildHeader(document, hostileModel, actions(), false);
		expect(header.querySelector("img, b, i")).toBeNull();
		expect(header.textContent).toContain("<b>x</b>");
	});
});
