import { type App, type TFile } from "obsidian";
import type { VaultIndex } from "../core/index/vaultIndex";
import type { LocalDate } from "../core/model/localDate";
import { projectFolder } from "../core/storage/vault";
import { filename } from "../core/writing/fileNaming";
import { newProject } from "../core/writing/newFile";
import { createIn } from "../vaultFiles";

/** Creates a project file named for `title` in the projects folder, its name numbered against that folder and every project's title. */
export function createProject(host: { app: App; index: Pick<VaultIndex, "projectFilenames">; today: () => LocalDate }, title: string): Promise<TFile> {
	const { vault } = host.app;
	const names = [...(vault.getFolderByPath(projectFolder)?.children ?? []).map((child) => child.name), ...host.index.projectFilenames()];
	return createIn(vault, projectFolder, `${projectFolder}/${filename(title, names)}`, newProject({ today: host.today() }));
}
