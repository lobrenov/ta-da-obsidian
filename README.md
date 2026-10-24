# Ta Da for Obsidian

Ta Da's tasks, projects and areas inside Obsidian, over the same vault as the Ta Da Mac and iPhone apps. Proof of concept.

Build plan, file format and architecture: the Ta Da repo (`docs/build plans/Obsidian POC.md`, `docs/file-format.md`).

## Development
The Ta Da repo must be cloned beside this one (`../Ta Da`), with `swift-markdown-engine-extended` beside both; the tests read their fixtures.

- `npm test`: Vitest, including conformance with TaDaCore.
- `npm run build`: typecheck and bundle `main.js`.
- `OBSIDIAN_VAULT=<vault> npm run dev`: watch build, copied into `<vault>/.obsidian/plugins/ta-da/`.

## Licence
MIT (`LICENSE`). Third-party notices: `ACKNOWLEDGEMENTS.txt`.
