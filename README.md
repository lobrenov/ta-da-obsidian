# Ta Da for Obsidian

Ta Da's tasks, projects and areas in Obsidian. Each is one markdown file with YAML frontmatter, so the plugin works over the same vault as the [Ta Da](https://github.com/lobrenov/ta-da-swift) Mac and iPhone apps, or on its own. Works on desktop and mobile.

> [!NOTE]
> **AI Disclaimer:** Ta Da and its Obsidian plugin version are 100% vibe-coded. I've no intention of claiming that "I made" Ta Da or could quickly or easily re-create it myself. It almost definitely has many AI-isms in its visual design and codebase.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/agenda-dark.png">
  <img alt="Ta Da in Obsidian: a task's header, Tasks and the Agenda" src="docs/images/agenda-light.png">
</picture>

## What it does
- **Header**: a row of chips on task, project and area files for status, project or area, dates and tags. Each chip opens its menu and changes one line of the file. Obsidian's Properties are behind the header's Properties button.
- **Agenda**: a week or month strip and a day's or a week's tasks, with the daily or week note.
- **Tasks and Tags**: areas with their projects, Loose tasks, the Logbook and Trash, and the tag tree, each in a sidebar tab with grouping and a tag filter.
- **New task**: a modal for a task, project or area, starting in the project, area, tag or day on screen.
- **File menu**: Move, Schedule, Set deadline, Tags and Status on one file, or on several picked rows. Rows drag onto a project or area.
- **Logging**: once a day, completed tasks and projects move to the Logbook and completed repeating tasks move forward, as in the apps.
- **Repeating tasks**, **Extract to task**, **Convert to project**, and Ta Da's **status rules**.

<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/tasks-dark.png">
    <img alt="Tasks: a project's open tasks" src="docs/images/tasks-light.png" width="49%">
  </picture>
  <img alt="New task" src="docs/images/quick-entry.png" width="49%">
</p>

<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/phone-agenda-dark.png">
    <img alt="Phone: Agenda" src="docs/images/phone-agenda-light.png" width="32%">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/phone-tasks-dark.png">
    <img alt="Phone: Tasks" src="docs/images/phone-tasks-light.png" width="32%">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/phone-taskfile-dark.png">
    <img alt="Phone: a task" src="docs/images/phone-taskfile-light.png" width="32%">
  </picture>
</p>

## Install
Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/ta-da/`, then turn on Ta Da in Settings ▸ Community plugins.

## Files
The plugin creates files where the apps do, in `Ta Da/` at the vault's top level, and edits them by changing only the lines it needs. Calendar events and reminders stay with the apps. The format is in Ta Da's [`docs/file-format.md`](https://github.com/lobrenov/ta-da-swift/blob/main/docs/file-format.md).

## Commands
New task, Complete, Move to project or area, Schedule, Set deadline, Set status, Extract subtask to task, Convert task to project, and Open Ta Da: Agenda, Tasks or Tags. None has a default hotkey.

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
