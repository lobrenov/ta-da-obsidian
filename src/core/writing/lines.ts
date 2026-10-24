/** A text's lines, each keeping its own line ending, so joining them gives back the exact text. */
export class Lines {
	lines: string[] = [];

	constructor(text: string) {
		let start = 0;
		while (start < text.length) {
			const newline = text.indexOf("\n", start);
			const end = newline < 0 ? text.length : newline + 1;
			this.lines.push(text.slice(start, end));
			start = end;
		}
	}

	get text(): string {
		return this.lines.join("");
	}

	/** The file's line ending, taken from its first line. LF when there is none. */
	get ending(): string {
		const first = this.lines[0];
		if (first === undefined || !first.endsWith("\n")) return "\n";
		return first.endsWith("\r\n") ? "\r\n" : "\n";
	}

	/** A line without its line ending. */
	static content(line: string): string {
		let end = line.length;
		if (line.endsWith("\n")) end--;
		if (end > 0 && line.charCodeAt(end - 1) === 0x0d) end--;
		return line.slice(0, end);
	}
}
