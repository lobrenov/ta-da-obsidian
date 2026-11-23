import { describe, expect, it, vi } from "vitest";
import { defaultDailyNotes, type TaDaData } from "../src/settingsData";

vi.mock("obsidian", () => ({ PluginSettingTab: class {} }));
vi.mock("../src/ui/navigator/navigatorSettings", () => ({
	dailyNotesDefinitions: () => [],
	navigatorDefinitions: () => [],
	navigatorControlValue: () => undefined,
	setNavigatorControlValue: () => false,
}));

const { TaDaSettingTab } = await import("../src/settings");

function tab(over: Partial<TaDaData> = {}) {
	const settings: TaDaData = { hideProperties: true, navigator: { openOnStartup: { agenda: false, tasks: false, tags: false }, collapseListPane: false }, dailyNotes: defaultDailyNotes, taskLinkBoxes: true, noteSubtasks: false, ...over };
	const setNoteSubtasks = vi.fn();
	const instance = new TaDaSettingTab({} as never, {} as never, settings, () => undefined, {} as never, () => undefined, setNoteSubtasks);
	return { instance, setNoteSubtasks };
}

describe("TaDaSettingTab", () => {
	it("has Subtasks from notes straight after Task checkboxes on links, with the shared-file note", () => {
		const names = tab().instance.getSettingDefinitions().map((definition) => (definition as { name: string }).name);
		expect(names.slice(0, 3)).toEqual(["Hide properties on Ta Da files", "Task checkboxes on links", "Subtasks from notes"]);
		const definition = tab().instance.getSettingDefinitions()[2] as { desc: string; control: unknown };
		expect(definition.desc).toBe("Lists open subtasks from notes in the Agenda, projects, areas and Loose tasks. Shared with Ta Da through Ta Da/settings.json in the vault.");
		expect(definition.control).toEqual({ type: "toggle", key: "noteSubtasks" });
	});

	it("reads and sets the setting, off by default", () => {
		const { instance, setNoteSubtasks } = tab();
		expect(instance.getControlValue("noteSubtasks")).toBe(false);
		instance.setControlValue("noteSubtasks", true);
		expect(setNoteSubtasks).toHaveBeenCalledWith(true);
		expect(tab({ noteSubtasks: true }).instance.getControlValue("noteSubtasks")).toBe(true);
	});
});
