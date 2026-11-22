import { describe, expect, it } from "vitest";
import { swipesBack } from "../src/ui/navigator/swipe";

describe("swipesBack", () => {
	it("goes back on a rightward swipe far enough and mostly level", () => {
		expect(swipesBack({ x: 40, y: 300 }, { x: 140, y: 320 })).toBe(true);
		expect(swipesBack({ x: 40, y: 300 }, { x: 90, y: 300 })).toBe(false);
		expect(swipesBack({ x: 140, y: 300 }, { x: 40, y: 300 })).toBe(false);
		expect(swipesBack({ x: 40, y: 300 }, { x: 140, y: 380 })).toBe(false);
	});
});
