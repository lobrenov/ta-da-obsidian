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
