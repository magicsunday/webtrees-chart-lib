# AGENTS.md

`@magicsunday/webtrees-chart-lib` is a browser-only, D3-based ES module library. It has no PHP. The only webtrees-facing code is the page-bootstrap helpers in `src/chart-core.js`. Consumers: `webtrees-fan-chart`, `webtrees-pedigree-chart`, `webtrees-descendants-chart` (tree-chart infrastructure) and `webtrees-statistics` (widget set). Humans start at [README.md](README.md).

## Commands

| Task | Command |
|---|---|
| Full gate, green before every commit | `npm run ci:test` (`ci:test:js`, then `cpd`) |
| Tests only | `npm test` (jest, native ESM via `--experimental-vm-modules`) |
| Lint / format | `npm run lint`, `npm run lint:fix`, `npm run format`, `npm run format:check` (Biome) |
| Type check | `npm run typecheck` |
| Duplicate detection | `npm run cpd` (jscpd, config in `.jscpd.json`) |
| Build | `npm run build` (rollup bundles to `dist/`, then `.d.ts` via `tsconfig.dts.json`) |

- `ci:test:js` runs `check-js-config`, `biome ci --error-on-warnings`, the type check and the tests. The CI `test` job runs `ci:test:js`, copy-paste detection runs as its own `cpd` job through the shared workflow of `magicsunday/.github`.
- The Node version is the one the `setup-node` step in `.github/workflows/ci.yml` sets. There is no `engines` field.
- The `consumer-types` job builds this library, swaps it into each consumer listed in the matrix of `ci.yml` and runs that consumer's `npm run typecheck`. A consumer that is already red on its own is skipped with a warning. The job checks declarations only, so a changed peer range is settled by the consumer's own install. Adding a consumer means adding it to the matrix.
- Distribution is a Git-URL npm dependency, not the public registry. `prepare` builds `dist/` on install, so a tagged commit whose build breaks breaks every consumer that pins that tag. Keep `main` buildable. `dist/` is gitignored and `files` ships only `dist/`.

## Layout

- `src/infra.js`, `src/linked-tree.js`, `src/widgets.js`, `src/chart-core.js`: the public entrypoints and rollup entries (`./infra`, `./linked-tree`, `./widgets`, `./chart-core`). There is no bare entrypoint.
- `src/linked-tree/`: the render layer shared by the pedigree and descendants chart (SVG host, layout constants and orientations, person boxes, text and date renderers). Module-specific rendering such as the name layout stays in the module.
- `src/chart/`: scaffolding (`svg/` export, zoom, defs, `links/`, `orientation/`, `text/`, `util/`, the tooltip and overlay), `panel/` (the `DetailPanel` and the `PanelSelection` of the tree chart modules, published by `chart-core`) and `widgets/` (one class per chart type on `BaseWidget`).
- `src/color/`, `src/text/`, `src/storage.js`: color helpers, name truncation, localStorage persistence.
- `src/types/`: ambient typings for d3 entry points without their own.
- `tests/` mirrors `src/`. `build-config.test.js` and `index.test.js` guard the build wiring and the public surface (below).
- File names are kebab-case, exported classes PascalCase.

## Public API rules

- A new export is re-exported from the matching entrypoint: a widget from `widgets.js`, an export of the linked tree render layer from `linked-tree.js`, everything else from `infra.js` or `chart-core.js`. Add its name to the matching list in `tests/index.test.js` (`WIDGETS_SURFACE`, `INFRA_SURFACE`, `LINKED_TREE_SURFACE`, `CHART_CORE_SURFACE`), which are compared by set equality, so an unlisted export fails CI.
- Add it to the import block of its subpath in `README.md`. Those blocks are the complete lists, the tables below them cover only exports that need explaining. Nothing checks the README, keep it in step by hand.
- A widget also gets a row in the README widget table. Its last column lists the `d3-*` packages the widget's own module imports, including side-effect imports such as `import "d3-transition"`, `none` for no import.
- A module-level `@typedef` or `@callback` in `chart-core.js` is published as an `export type` and must be listed in `CHART_CORE_TYPE_SURFACE`. Keep internal helper types out of that file.
- Before removing an export, verify that no consumer imports it, as a value or as a JSDoc `@import` type.

## D3 dependencies

Every modular `d3-*` package the library imports is a peer dependency (also a devDependency), and it is `external` in `rollup.config.js`. The `d3-*` imports in `src/`, the `external` array and `peerDependencies` stay in lockstep, `tests/build-config.test.js` enforces it. Import from the modular packages and never from the meta `d3` package, which would bypass the peer and external contract.

## Conventions

- Biome rules and the TypeScript base live in `magicsunday/coding-standard`, a `github:` devDependency pinned to an exact tag. `biome.json` and `tsconfig.json` only extend its base. Change a shared rule there and bump the pin, do not weaken it locally. `npm run ci:test:js:config` fails on a config that stops extending or weakens the base.
- `@biomejs/biome` and `typescript` stay this repository's own devDependencies. Keep `$schema` in `biome.json` at the installed Biome version.
- `tsconfig.json` carries no `paths` mapping. Biome reads it too, and a mapped bare import trips `useImportExtensions`.
- `tsconfig.json` is the strict gate for type correctness. `tsconfig.dts.json` only emits declarations, and `tests/dts-emit.test.js` type-checks the emitted declarations under `noImplicitAny` like a strict consumer. A field carries `@type` and no `@private`, otherwise it is emitted without its type.
- Under the strict base, narrow a value the checker cannot prove with a JSDoc cast or read it through the widget's getter, never by changing runtime behaviour.
- `.jscpd.json` names languages by jscpd format (`javascript`, `typescript`), never `js` or `ts`, which jscpd rejects as unsupported formats.
- Relative imports carry the `.js` extension. Code comments are English. New source files start with the header `This file is part of the package magicsunday/webtrees-chart-lib.`
- The jest config and the CI workflow shape follow `webtrees-fan-chart`, the canonical source.

## Git

- Commit subjects and the PR title follow the shared `commit-convention` gate (`magicsunday/.github`, `commit-convention.yml`). A `GH-` subject matches `^GH-\d+: [A-Z]`, any other `^[A-Z]`, and conventional-commit prefixes or path-like starts are rejected. The gate blocks a merge once it is a required check in branch protection.
- The branch for an issue is named exactly `GH-<N>`. The PR body closes the issue with `Closes #<N>`, the subject prefix closes nothing.
- Every issue implementation checks `README.md` and `AGENTS.md` and updates them in the same change when they describe what changed (public API, widget inventory, commands, conventions, versions). Each statement written there is verified against the source first.
- Commits are signed off (`git commit -s`, DCO). Never add a `Co-Authored-By:` trailer or any AI attribution.

## Release

`Make/release.mk` runs the whole flow: `make release X.Y.Z [NOTES_FILE=path | NOTES="..."]`. Run it where the JS toolchain and `gh` exist (for example the webtrees buildbox), with `GH_TOKEN` set for non-interactive use. Inside the buildbox a `NOTES_FILE` must lie under the bind-mounted repository directory.

- `release-check` verifies the tools, a bare-semver version without `v` prefix, a clean tree on a branch and an authenticated `gh`.
- `release-prepare` runs `npm ci`, lint, tests and build, not the full gate, so run `npm run ci:test` first. It bumps `package.json` and `package-lock.json`, commits `Release X.Y.Z` and tags `X.Y.Z`.
- `release-publish` pushes `main` with tags and creates the GitHub release.
- `make release-recover` restores the two manifests after an aborted prepare. It does not undo a created commit or tag.

### Bumping a consumer

- Change the `github:magicsunday/webtrees-chart-lib#<X.Y.Z>` pin in the consumer's `package.json`.
- A plain `npm install` keeps the old resolved commit in the lockfile. Remove `node_modules/@magicsunday/webtrees-chart-lib`, then install the exact spec `@magicsunday/webtrees-chart-lib@github:magicsunday/webtrees-chart-lib#<X.Y.Z>`, and check that the lock entry names the new version and the tag's commit.
- That install does not run the consumer's `prepare`. Rebuild the consumer's committed bundle, check that the diff shows only chart-lib code and the version banner, and commit manifest, lockfile and bundle together.

## Local development against a consumer

`npm link` here and `npm link @magicsunday/webtrees-chart-lib` in the consumer, or `npm install --no-save ../webtrees-chart-lib` in the consumer. Run `npm run build` after each change so the consumer resolves the new `dist/`. The consumer's next `npm ci` replaces either setup. The statistics module's dev compose file mounts the sibling checkout, so a rebuilt `dist/` is picked up there directly.
