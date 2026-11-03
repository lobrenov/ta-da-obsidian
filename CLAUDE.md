# Ta Da for Obsidian

Obsidian plugin (id `ta-da`) for Ta Da's tasks, projects and areas, over the same vault as the Ta Da Mac and iPhone apps. Desktop and mobile. Proof of concept.

- Repo: https://github.com/lobrenov/ta-da-obsidian (private; `origin`)
- Ta Da repo, cloned beside this one at `../Ta Da`: the build plan (`docs/archive/build plans/Obsidian POC.md`), the file format (`docs/file-format.md`, the source of truth) and the architecture (`docs/architecture.md`, Obsidian section).
- Design: the canvas's Obsidian POC page, https://claude.ai/artifact/A7c33hg9HUKz41u3wbki3V.

## Commands
- Test: `npm test` (Vitest). `TADA_REPO=<path>` points the tests at a Ta Da checkout other than `../Ta Da`.
- Build: `npm run build` (typechecks `src/` and `tests/`, then bundles `main.js`).
- Dev: `OBSIDIAN_VAULT=<vault> npm run dev` (watch build, copied into `<vault>/.obsidian/plugins/ta-da/`).
- Install into SampleVault: `npm run build`, then copy `main.js`, `manifest.json` and `styles.css` into `../Ta Da/SampleVault/.obsidian/plugins/ta-da/`, or run `OBSIDIAN_VAULT="../Ta Da/SampleVault" npm run dev`. Reload the plugin in Obsidian.

## Layout
- `src/core/`: the TypeScript port of TaDaCore (`model/`, `parsing/`, `syntax/` from the editor fork's `MarkdownEngineSyntax`, `index/`, `writing/`, `storage/`, including `storage/settingsFile.ts`, the read and write of `Ta Da/settings.json`). No Obsidian imports.
- `src/TaDaIndex.ts`: `VaultIndex` built from the vault's markdown on layout ready, patched on file and editor changes.
- `src/settingsData.ts`: `SettingsStore`. `data.json` holds `hideProperties`, `navigator` and `lastLogged` (the day the daily run last succeeded); the Daily notes settings and `editor.taskLinkBoxes` (default on) are in the vault's `Ta Da/settings.json` (shared with Ta Da, `docs/file-format.md` Settings), each daily notes key falling back to `data.json`'s old `dailyNotes`, then Obsidian's `daily-notes.json` (folder and template), then the default. Loading never writes; a change writes the file through `src/vaultFiles.ts`, keeping its other keys, and `main.ts` reloads on the file's create, modify and delete.
- `src/Writer.ts`: every write to a file's text, and the reads a write builds on (the open editor's text, else the file's), one queue per file.
- `src/ui/header/`: the Ta Da header on task, project and area files (Live Preview widget and Reading view post-processor) and its menus.
- `src/ui/navigator/`: the Agenda, Tasks and Tags views (one `NavigatorView` class, three kinds in `views.ts`), their domains, lists and settings.
- `src/ui/newTask/`: the New task modal.
- `src/ui/fileMenu.ts`: the plugin's items in Obsidian's file menu and files menu (several files), which are also a navigator row's right-click menu. `src/ui/fileActions.ts` (pure: the kind of a set of files, the agreed date and parent, drop targets) and `src/ui/fileEdits.ts` (Move, Schedule and Set deadline on a list of files) serve the menus, the commands and drag to move. Picking and dragging are in `NavigatorView`, with `pickClick` in `src/ui/navigator/selection.ts`; dragging uses Obsidian's `app.dragManager` (at runtime, declared in `src/obsidian.d.ts`).
- `src/ui/deleteFiles.ts` and `src/ui/DeleteAreaModal.ts`: Delete project and Delete area, through `vault.trash(file, false)`; the files that go are `filesToTrash` in `src/core/storage/trashPlan.ts`.
- Logging: `src/DailyLog.ts` (the daily run at layout ready and day change, and Log now) and `src/Logbook.ts` (applies `planLog` and `planUnlog` plans from `src/core/writing/`, picking each name at move time; `StatusActions` puts back reopened files through it). The queries are in `src/core/index/logQueries.ts`.
- `src/ui/extractTask.ts`: Extract to task, from the editor menu and its command. `src/ui/convertTask.ts` and `src/ui/convert/`: Convert to project and its modal. Both create task files through `createTask` in `src/vaultFiles.ts`.
- `src/commands.ts`: New task, Complete, Move to project or area, Schedule, Set deadline, Extract subtask to task, Convert task to project. Set status commands are in `src/main.ts`.
- `src/ui/statusActions.ts`: every status change, with the apps' rules.
- Recurrence UI: `src/ui/repeatWording.ts` (port of `RepeatWording.swift`: chip, row, menu and occurrence text) and `src/ui/repeatRules.ts` (`repeatStart`, the `repeat` and first due date a rule writes). Rules are typed in `DateModal` (`src/ui/header/modals.ts`). Where a completed task moves is `src/core/index/repeatMove.ts`; logging moves it.
- `tests/`: Vitest tests, including conformance with TaDaCore.

## Conformance
The tests read TaDaCore's fixtures from the Ta Da repo: `../Ta Da/Packages/TaDaCore/Tests/TaDaCoreTests/Fixtures/Conformance/` (`read.json`, `queries.json`, `writes.json`, `settings.json`, `recurrence.json` and `RecurrenceVault/`, `logging.json` and `LoggingVault/`, `HomeVault/`) and `../DesignVault/` beside it. `tests/spec.test.ts` reads the grammar spec from `../swift-markdown-engine-extended/spec/grammar`. Regenerate the JSON from the Ta Da repo with `swift test --package-path Packages/TaDaCore --filter writeConformance` (`ConformanceExportTests.swift`); a port change that changes behaviour starts there.

## Rules
- The plugin never changes how Obsidian renders Markdown. Where Ta Da's editor renders Markdown differently, Obsidian's rendering stands.
- Writes splice lines through `Writer`: the open file through its `Editor` as one transaction, other files through `Vault.process`. Never `processFrontMatter`, never re-serialise YAML. Renames go through `FileManager.renameFile`, named by the ported `FileNaming`; deletes through `vault.trash(file, false)`.
- Community store rules: no default hotkeys, sentence-case UI text, no `innerHTML` with file content, no Node or Electron at runtime (the esbuild config rejects Node built-ins).
- Dependencies are pinned exactly (`.npmrc` has `save-exact=true`).
- Licence MIT (`LICENSE`). Third-party notices go in `ACKNOWLEDGEMENTS.txt`.
- Tests use Vitest, with jsdom for DOM tests.

## Versioning
`x.y.z`, as the Ta Da repo's `docs/versioning.md` says. A new version sets `version` in `manifest.json` and `package.json`, adds its `versions.json` entry, is tagged `<x.y.z>` (no `v`, to match `manifest.json`), and adds its row to that file's pairing table. Pushing the tag runs `.github/workflows/release.yml`, which builds and publishes the GitHub release with `main.js`, `manifest.json` and `styles.css`.
