# Ta Da for Obsidian

Ta Da's tasks, projects and areas inside Obsidian, over the same vault as the Ta Da Mac and iPhone apps. Works on desktop and mobile. Proof of concept.

> [!NOTE]
> **AI Disclaimer:** Ta Da and its Obsidian plugin version are 100% vibe-coded. I've no intention of claiming that "I made" Ta Da or could quickly or easily re-create it myself. It almost definitely has many AI-isms in its visual design and codebase.

## What it does
- **Header**: task, project and area files show a row of chips for status, project or area, dates and tags, in Live Preview and Reading view. Each chip opens its menu and changes one line of the file. Obsidian's Properties are hidden on these files; the header's Properties button shows them.
- **Agenda, Tasks and Tags**: three Ta Da views, each its own tab in the left sidebar beside the file explorer (and its own entry in a phone's drawer). Agenda shows the strip and a day's or week's list. Tasks has search, Loose tasks, Logbook, Trash, and areas with their projects; Tags has search and the tag tree. The list beside them shows the chosen page, with grouping and a tag filter. Each view has New task in its header, follows the open file, and has a ribbon icon. Arrow keys move through the list and Return opens a file. On a phone, Tasks and Tags show one pane at a time, with a back button.
- **Agenda**: a week or month strip and a day's or a week's tasks, with the day's daily note or the week's note (Create when it's missing). A ring on a day marks open boxes in its daily note.
- **New task**: a modal for a task or project with title, status, project or area, dates and tags. It starts in the project, area or tag on screen, or due on the Agenda's selected day.
- **File menu**: a task's, project's or area's file menu, which is also its row's right-click menu in the views and the Tasks navigator, has Move…, Schedule…, Set deadline…, Tags… and Status… (a submenu of statuses) on tasks and projects, Tags… on areas, and Convert to project… on a task. In the views, a project's or area's menu also has Delete project or Delete area.
- **Picking**: ⌘-click (Ctrl-click) and Shift-click pick several task and project rows, on desktop. A picked row's right-click opens Obsidian's menu for several files, with Status…, Schedule… and Set deadline…, and Move… when they're all tasks or all projects; the file explorer's multi-select has the same items.
- **Drag to move**: task and project rows, and files dragged from the file explorer, drop onto a project or area in the Tasks navigator, on desktop. A row dragged into a note links it.
- **Delete project and Delete area**: a project goes to `.trash/` with its tasks, an area with its projects, their tasks and its own tasks, after asking first. Logged files stay in the Logbook; embedded images stay where they are.
- **Logging**: once a day, when Obsidian opens and when the day changes, completed tasks and projects move to `Ta Da/logbook/<yyyy-MM>/`, completed repeating tasks move forward, and reopened logged files come back, as in the apps. Log now in the Logbook logs every completed file. The plugin, Ta Da's Mac app and its iPhone app each log the same vault; a file one has already moved is skipped by the others.
- **Extract to task**: a subtask's line becomes a task of its own, filed under the file's project or area, from the editor's right-click menu or its command.
- **Convert to project**: a modal to make a task a project, with its status, area and, optionally, its subtasks made tasks under it. The file moves to `Ta Da/projects/`.
- **Commands**: New task, Complete, Move to project or area, Schedule, Set deadline (these three act on the picked rows when a Ta Da view is active, else the open file), Set status (one per status), Extract subtask to task, Convert task to project, Open Ta Da: Agenda, Open Ta Da: Tasks, Open Ta Da: Tags. None has a default hotkey.
- **Repeating tasks**: the due date's modal takes a repeat rule (`every mon`, `every 2 weeks when done`), with when done and an end date. Chips, rows, the status menu and the Agenda show the rule and where a completed task moves at the next logging.
- **Status rules**, as in the apps: closing a project with open tasks asks first; reopening a task reopens its Done or Cancelled project; reopening a logged file moves it, and its logged project, out of the Logbook.

Files are created where the apps create them, in `Ta Da/` at the vault's top level. Calendar events and reminders stay with the apps.

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
