import { titleOfPath } from "../../core/model/item";
import { sanitise, filename } from "../../core/writing/fileNaming";
import { draftFolder, type QuickEntryDraft } from "../../core/writing/quickEntryDraft";

/** Where a draft's file goes. */
export interface Placement {
	folder: string;
	path: string;
	/** The name was taken, so the file gets a number. */
	numbered: boolean;
}

/**
 * The folder and path for the draft's file, numbered when its name is taken. `folderNames` are the filenames in the
 * folder; a project's name is also taken by any project elsewhere, as links name projects by title.
 */
export function placeDraft(draft: QuickEntryDraft, folderNames: Iterable<string>, projectNames: Iterable<string>): Placement {
	const folder = draftFolder(draft);
	const taken = draft.kind === "project" ? [...folderNames, ...projectNames] : folderNames;
	const name = filename(draft.title, taken);
	const path = folder === "" ? name : `${folder}/${name}`;
	return { folder, path, numbered: titleOfPath(path) !== sanitise(draft.title) };
}
