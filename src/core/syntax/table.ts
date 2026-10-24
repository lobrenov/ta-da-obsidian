import { trimBlanks } from "../text";

/** A GFM table's cells. Cells hold `\n` where the file has `<br>` and an unescaped `|` where it has `\|`. */
export interface MarkdownTable {
	columnCount: number;
	/** The header plus the body rows. */
	rowCount: number;
	/** Row 0 is the header. */
	cell(row: number, column: number): string;
}

/** Ragged rows are padded (or cut) to the wider of the header and the delimiter row. */
export function parseTable(source: string): MarkdownTable | null {
	const lines = source.split(/\r\n|[\n\r\u2028\u2029\u0085]/).filter((line) => trimBlanks(line) !== "");
	const first = lines[0];
	const second = lines[1];
	if (first === undefined || second === undefined) return null;

	const header = parseRow(first);
	const alignmentCount = parseRow(second).length;
	if (header.length === 0 || alignmentCount === 0) return null;

	const columnCount = Math.max(header.length, alignmentCount);
	const pad = (cells: string[]): string[] =>
		cells.length >= columnCount ? cells.slice(0, columnCount) : cells.concat(new Array<string>(columnCount - cells.length).fill(""));
	const rows = lines.slice(2).map((line) => pad(parseRow(line)));
	const paddedHeader = pad(header);
	return {
		columnCount,
		rowCount: 1 + rows.length,
		cell: (row, column) => (row === 0 ? paddedHeader[column] : rows[row - 1]?.[column]) ?? "",
	};
}

/**
 * Splits on UNESCAPED `|` only: a `|` after an odd run of backslashes is the cell's own (`\|`). A cell holding
 * `` `a \| b` `` is one cell.
 */
function parseRow(line: string): string[] {
	let s = trimBlanks(line);
	if (s.startsWith("|")) s = s.slice(1);
	if (s.endsWith("|")) {
		let run = 0;
		for (let k = s.length - 2; k >= 0 && s[k] === "\\"; k--) run++;
		if (run % 2 === 0) s = s.slice(0, -1);
	}

	const cells: string[] = [];
	let raw = "";
	let run = 0;
	for (const ch of s) {
		if (ch === "\\") {
			run++;
		} else if (ch === "|" && run % 2 === 0) {
			cells.push(finishCell(raw));
			raw = "";
			run = 0;
			continue;
		} else {
			run = 0;
		}
		raw += ch;
	}
	cells.push(finishCell(raw));
	return cells;
}

/** The text a cell's source stands for: backslash runs before an escaped `|` or at the end are halved. */
function decode(raw: string): string {
	let out = "";
	let run = 0;
	const flush = (followedByPipe: boolean, atEnd: boolean): void => {
		if (followedByPipe) out += "\\".repeat((run - 1) / 2);
		else if (atEnd && run % 2 === 0) out += "\\".repeat(run / 2);
		else out += "\\".repeat(run);
		run = 0;
	};
	for (const ch of raw) {
		if (ch === "\\") {
			run++;
			continue;
		}
		if (ch === "|" && run > 0) flush(true, false);
		else flush(false, false);
		out += ch;
	}
	flush(false, true);
	return out;
}

function finishCell(raw: string): string {
	return decode(trimBlanks(raw)).replace(/<br\s*\/?>/gi, "\n");
}
