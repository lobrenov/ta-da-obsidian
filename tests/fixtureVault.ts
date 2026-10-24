import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Item } from "../src/core/model/item";
import { VaultIndex } from "../src/core/index/vaultIndex";
import { parseItem } from "../src/core/parsing/parseItem";
import { compareCodeUnits } from "../src/core/text";

/** TaDaCore's fixture vaults, in the Ta Da repo beside this one. */
const fixtures = resolve(fileURLToPath(new URL("..", import.meta.url)), "../Ta Da/Packages/TaDaCore/Tests/TaDaCoreTests/Fixtures");

/** Every `.md` file under a fixture vault as TaDaCore indexes them: hidden folders are skipped, except the old `.logbook/`. */
export function loadFixtureIndex(name: string): VaultIndex {
	const items: Item[] = [];
	const walk = (directory: string, prefix: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareCodeUnits(a.name, b.name))) {
			const hidden = entry.name.startsWith(".") && !(prefix === "" && entry.name === ".logbook");
			if (hidden) continue;
			if (entry.isDirectory()) walk(join(directory, entry.name), `${prefix}${entry.name}/`);
			else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
				const item = parseItem(readFileSync(join(directory, entry.name), "utf8"), `${prefix}${entry.name}`);
				if (item) items.push(item);
			}
		}
	};
	walk(join(fixtures, name), "");
	return new VaultIndex(items);
}
