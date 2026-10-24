import type { Domain } from "./domain";

/** The bottom bar's tabs on a phone, in order. */
export const phoneTabs = [
	{ id: "agenda", label: "Agenda", icon: "calendar" },
	{ id: "projects", label: "Projects", icon: "box" },
	{ id: "files", label: "Files", icon: "folder" },
] as const;

export type PhoneTab = (typeof phoneTabs)[number]["id"];

/**
 * The tab to highlight: Agenda while its list shows, Projects for the navigation pane and every list opened from it,
 * and none while searching. Files leaves the navigator, so it's never current here.
 */
export function currentPhoneTab(state: { domain: Domain; query: string; showingList: boolean }): PhoneTab | null {
	if (state.query.trim() !== "") return null;
	return state.showingList && state.domain.kind === "agenda" ? "agenda" : "projects";
}
