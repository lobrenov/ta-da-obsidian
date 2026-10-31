/**
 * The path selected after an arrow key, among the list's `paths` top to bottom. With nothing selected in the list,
 * down picks the first and up the last. The ends don't wrap.
 */
export function moveSelection(paths: readonly string[], current: string | null, delta: 1 | -1): string | null {
	if (paths.length === 0) return null;
	const at = current === null ? -1 : paths.indexOf(current);
	if (at < 0) return (delta === 1 ? paths[0] : paths[paths.length - 1]) ?? null;
	return paths[Math.min(Math.max(at + delta, 0), paths.length - 1)] ?? null;
}

/** The rows picked in a list and the row a range starts from. */
export interface Picks {
	paths: readonly string[];
	anchor: string | null;
}

/**
 * The picks after a click on `path` among the list's `paths` top to bottom. A toggle adds or removes the row and makes it
 * the anchor. A range picks everything from the anchor to the row (the whole range replaces the picks; the anchor stays),
 * or just the row when the anchor isn't in the list. Picks come back in list order.
 */
export function pickClick(paths: readonly string[], picks: Picks, path: string, mode: "toggle" | "range"): Picks {
	const at = paths.indexOf(path);
	if (at < 0) return picks;
	if (mode === "toggle") {
		const next = new Set(picks.paths);
		if (!next.delete(path)) next.add(path);
		return { paths: paths.filter((candidate) => next.has(candidate)), anchor: path };
	}
	const from = picks.anchor === null ? -1 : paths.indexOf(picks.anchor);
	if (from < 0) return { paths: [path], anchor: path };
	return { paths: paths.slice(Math.min(from, at), Math.max(from, at) + 1), anchor: picks.anchor };
}
