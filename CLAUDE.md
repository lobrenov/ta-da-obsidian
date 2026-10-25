# Ta Da for Obsidian

Obsidian plugin (id `ta-da`) for Ta Da's tasks, projects and areas, over the same vault as the Ta Da Mac and iPhone apps. Desktop and mobile. Proof of concept.

- Repo: https://github.com/lobrenov/ta-da-obsidian (private; `origin`)
- Ta Da repo, cloned beside this one at `../Ta Da`: the build plan (`docs/build plans/Obsidian POC.md`, or `docs/archive/build plans/` once complete), the file format (`docs/file-format.md`, the source of truth) and the architecture (`docs/architecture.md`, Obsidian section).
- Design: the canvas's Obsidian POC page, https://claude.ai/artifact/A7c33hg9HUKz41u3wbki3V.

## Commands
- Test: `npm test` (Vitest). `TADA_REPO=<path>` points the tests at a Ta Da checkout other than `../Ta Da`.
- Build: `npm run build` (typechecks `src/` and `tests/`, then bundles `main.js`).
- Dev: `OBSIDIAN_VAULT=<vault> npm run dev` (watch build, copied into `<vault>/.obsidian/plugins/ta-da/`).
- Install into SampleVault: `npm run build`, then copy `main.js`, `manifest.json` and `styles.css` into `../Ta Da/SampleVault/.obsidian/plugins/ta-da/`, or run `OBSIDIAN_VAULT="../Ta Da/SampleVault" npm run dev`. Reload the plugin in Obsidian.

## Layout
- `src/core/`: the TypeScript port of TaDaCore (`model/`, `parsing/`, `syntax/` from the editor fork's `MarkdownEngineSyntax`, `index/`, `writing/`, `storage/`). No Obsidian imports.
- `src/TaDaIndex.ts`: `VaultIndex` built from the vault's markdown on layout ready, patched on file and editor changes.
- `src/Writer.ts`: every write to a file's text, one queue per file.
- `src/ui/header/`: the Ta Da header on task, project and area files (Live Preview widget and Reading view post-processor) and its menus.
- `src/ui/navigator/`: the Agenda, Tasks and Tags views (one `NavigatorView` class, three kinds in `views.ts`), their domains, lists and settings.
- `src/ui/newTask/`: the New task modal.
- `src/commands.ts`: New task, Complete, Move to project or area. Set status commands are in `src/main.ts`.
- `src/ui/statusActions.ts`: every status change, with the apps' rules.
- `tests/`: Vitest tests, including conformance with TaDaCore.

## Conformance
The tests read TaDaCore's fixtures from the Ta Da repo: `../Ta Da/Packages/TaDaCore/Tests/TaDaCoreTests/Fixtures/Conformance/` (`read.json`, `queries.json`, `writes.json`, `HomeVault/`) and `../DesignVault/` beside it. `tests/spec.test.ts` reads the grammar spec from `../swift-markdown-engine-extended/spec/grammar`. Regenerate the JSON from the Ta Da repo with `swift test --package-path Packages/TaDaCore --filter writeConformance` (`ConformanceExportTests.swift`); a port change that changes behaviour starts there.

## Rules
- Writes splice lines through `Writer`: the open file through its `Editor` as one transaction, other files through `Vault.process`. Never `processFrontMatter`, never re-serialise YAML. Renames go through `FileManager.renameFile`, named by the ported `FileNaming`.
- Community store rules: no default hotkeys, sentence-case UI text, no `innerHTML` with file content, no Node or Electron at runtime (the esbuild config rejects Node built-ins).
- Dependencies are pinned exactly (`.npmrc` has `save-exact=true`).
- Licence MIT (`LICENSE`). Third-party notices go in `ACKNOWLEDGEMENTS.txt`.
- Tests use Vitest, with jsdom for DOM tests.
