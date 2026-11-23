import { describe, expect, it, vi } from "vitest";

// jsdom's window by hand: the jsdom environment can't resolve a mocked "obsidian".
const { dom, platform } = await vi.hoisted(async () => ({ dom: new (await import("jsdom")).JSDOM(""), platform: { isMobile: false } }));
const { document } = dom.window;
vi.mock("obsidian", () => ({
	Modal: class {},
	ToggleComponent: class {},
	Platform: platform,
	SuggestModal: class {
		inputEl = document.createElement("input");
		modalEl = document.createElement("div");
		closed = false;
		constructor(public app: unknown) {
			const container = document.createElement("div");
			container.appendChild(this.inputEl);
			this.modalEl.appendChild(container);
		}
		setPlaceholder(): void {}
		close(): void {
			this.closed = true;
		}
	},
}));

const { ParentModal, TagModal } = await import("../../src/ui/header/modals");

const pickers = {
	parent: () => new ParentModal({} as never, "Move to project or area", [], () => undefined),
	tag: () => new TagModal({} as never, () => [], () => undefined),
};

describe("picker Cancel", () => {
	for (const [name, make] of Object.entries(pickers)) {
		it(`${name} picker: Cancel beside the field closes it on mobile`, () => {
			platform.isMobile = true;
			const modal = make() as unknown as { inputEl: HTMLInputElement; closed: boolean };
			const cancel = modal.inputEl.parentElement?.querySelector("button.ta-da-prompt-cancel") as HTMLButtonElement | null;
			expect(cancel?.textContent).toBe("Cancel");
			cancel?.click();
			expect(modal.closed).toBe(true);
		});

		it(`${name} picker: no Cancel on desktop`, () => {
			platform.isMobile = false;
			const modal = make() as unknown as { modalEl: HTMLElement };
			expect(modal.modalEl.querySelector(".ta-da-prompt-cancel")).toBeNull();
		});
	}
});
