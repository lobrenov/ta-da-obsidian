import { Plugin } from "obsidian";
import { TaDaIndex } from "./TaDaIndex";

export default class TaDaPlugin extends Plugin {
	taDaIndex!: TaDaIndex;

	override onload(): void {
		this.taDaIndex = new TaDaIndex(this);
		this.taDaIndex.start();
	}
}
