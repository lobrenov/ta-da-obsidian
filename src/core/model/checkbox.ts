export type CheckboxState = "open" | "done" | "cancelled" | "icon";

/** Every marker character rendered as a checkbox: GFM's and the Alternative Checkboxes Reference Set. */
export const taskMarkers: readonly string[] = [
	" ", "x", "X",
	"/", "-", ">", "<", "?", "!", "*", '"', "l", "b", "i", "S", "I", "p", "c", "f", "k", "w", "u", "d",
];

/** The spec's reading of a marker; null for a character outside the reference set. */
export function checkboxState(marker: string): CheckboxState | null {
	switch (marker) {
		case " ":
		case "/":
		case ">":
		case "<":
			return "open";
		case "x":
		case "X":
			return "done";
		case "-":
			return "cancelled";
		default:
			return taskMarkers.includes(marker) ? "icon" : null;
	}
}

/** A checkbox in a file's body: a list item whose marker is followed by `[c]` and a space or tab. */
export interface Checkbox {
	/** The character between the brackets. */
	readonly marker: string;
	/** 0-based line in the whole file. */
	readonly lineIndex: number;
	/** UTF-8 offset of `marker` within its line. */
	readonly column: number;
	readonly state: CheckboxState;
}
