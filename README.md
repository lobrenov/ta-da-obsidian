# Ta Da for Obsidian

Ta Da's tasks, projects and areas inside Obsidian, over the same vault as the Ta Da Mac and iPhone apps. Works on desktop and mobile. Proof of concept.

## What it does
- **Header**: task, project and area files show a row of chips for status, project or area, dates and tags, in Live Preview and Reading view. Each chip opens its menu and changes one line of the file. Obsidian's Properties are hidden on these files; the header's Properties button shows them.
- **Agenda, Tasks and Tags**: three Ta Da views, each its own tab in the left sidebar beside the file explorer (and its own entry in a phone's drawer). Agenda shows the strip and a day's or week's list. Tasks has search, Loose tasks, Logbook, Trash, and areas with their projects; Tags has search and the tag tree. The list beside them shows the chosen page, with grouping and a tag filter. Each view has New task in its header, follows the open file, and has a ribbon icon. Arrow keys move through the list and Return opens a file. On a phone, Tasks and Tags show one pane at a time, with a back button.
- **Agenda**: a week or month strip and a day's or a week's tasks, with the day's daily note or the week's note (Create when it's missing). A ring on a day marks open boxes in its daily note.
- **New task**: a modal for a task or project with title, status, project or area, dates and tags. It starts in the project, area or tag on screen, or due on the Agenda's selected day.
- **Commands**: New task, Complete, Move to project or area, Set status (one per status), Open Ta Da: Agenda, Open Ta Da: Tasks, Open Ta Da: Tags. None has a default hotkey.
- **Status rules**, as in the apps: closing a project with open tasks asks first; reopening a task reopens its Done or Cancelled project; reopening a logged file moves it, and its logged project, out of the Logbook.

Files are created where the apps create them, in `Ta Da/` at the vault's top level. Logging, Calendar events and reminders stay with the apps.

## Install
By hand: copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/ta-da/`, then turn on Ta Da in Settings ▸ Community plugins.

## Settings
- Hide properties on Ta Da files.
- Open Agenda, Tasks and Tags on startup, one setting each.
- Collapse the list pane.
- Daily notes: the folder and template for daily notes, and for week notes, which can be turned off. These are shared with Ta Da through `Ta Da/settings.json` in the vault.

## Development
The Ta Da repo must be cloned beside this one (`../Ta Da`), with `swift-markdown-engine-extended` beside both; the tests read their fixtures. `CLAUDE.md` has the layout and rules.

- `npm test`: Vitest, including conformance with TaDaCore.
- `npm run build`: typecheck and bundle `main.js`.
- `OBSIDIAN_VAULT=<vault> npm run dev`: watch build, copied into `<vault>/.obsidian/plugins/ta-da/`.

## Licence
MIT (`LICENSE`). Third-party notices: `ACKNOWLEDGEMENTS.txt`.
