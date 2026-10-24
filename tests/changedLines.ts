/**
 * What an edit changed: the lines outside the longest common subsequence, in order. Lines are split on LF only, so a
 * CRLF line shows its `\r`.
 */
export function changedLines(before: string, after: string): [removed: string[], added: string[]] {
	const old = before.split("\n");
	const next = after.split("\n");
	// lcs[i][j] = common subsequence length of old[i...] and next[j...]
	const lcs = Array.from({ length: old.length + 1 }, () => new Array<number>(next.length + 1).fill(0));
	const at = (i: number, j: number): number => (lcs[i] as number[])[j] as number;
	for (let i = old.length - 1; i >= 0; i--) {
		for (let j = next.length - 1; j >= 0; j--) {
			(lcs[i] as number[])[j] = old[i] === next[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
		}
	}
	const removed: string[] = [];
	const added: string[] = [];
	let i = 0;
	let j = 0;
	while (i < old.length || j < next.length) {
		if (i < old.length && j < next.length && old[i] === next[j]) {
			i++;
			j++;
		} else if (j < next.length && (i === old.length || at(i, j + 1) >= at(i + 1, j))) {
			added.push(next[j] as string);
			j++;
		} else {
			removed.push(old[i] as string);
			i++;
		}
	}
	return [removed, added];
}
