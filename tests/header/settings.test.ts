import { describe, expect, it } from "vitest";
import { resolveSettings } from "../../src/settingsData";
import { hidesProperties } from "../../src/ui/header/propertiesVisibility";

describe("resolveSettings", () => {
	it("hides properties when nothing is saved", () => {
		expect(resolveSettings(null)).toEqual({ hideProperties: true });
		expect(resolveSettings(undefined)).toEqual({ hideProperties: true });
		expect(resolveSettings({})).toEqual({ hideProperties: true });
	});

	it("keeps a saved choice, and ignores a wrong type", () => {
		expect(resolveSettings({ hideProperties: false }).hideProperties).toBe(false);
		expect(resolveSettings({ hideProperties: "no" }).hideProperties).toBe(true);
	});

	it("hides on a Ta Da file with no saved settings", () => {
		expect(hidesProperties("task", resolveSettings(null).hideProperties, false)).toBe(true);
	});
});
