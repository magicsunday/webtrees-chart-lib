## Overview
This repository hosts `@magicsunday/webtrees-chart-lib` — a shared D3-based JavaScript library consumed by `webtrees-fan-chart`, `webtrees-pedigree-chart`, `webtrees-descendants-chart`, and `webtrees-statistics`. It provides several layers those modules would otherwise reimplement:

- **SVG scaffolding** — export (PNG/SVG), zoom, overlay, `<defs>` helpers.
- **A data-agnostic chart-widget set** (`src/chart/widgets/`) — one class per chart type, all on a shared `BaseWidget`. The files are listed in the source tree below. Used by `webtrees-statistics`.
- **Ancestor-chart colour helpers** (`src/color/`) — HSL primitives for branch/depth tinting. Used by fan/pedigree/descendants.
- **Page-bootstrap helpers** (`src/chart-core.js`, exposed via the `/chart-core` subpath) — AJAX-URL assembly, collapse-state persistence, chart-options publishing.
- **Text helpers** — text measurement and name truncation (public), plus an internal shared follow-cursor tooltip with `escapeHtml` and its line formatters (`tooltipHeader` / `tooltipStat` / `tooltipSub` / `tooltipRow` / `tooltipLines`), used by the widgets but not exported from any entrypoint.
- **localStorage form persistence** (`Storage`).

No PHP, no webtrees integration of its own — pure browser JS shipped via rollup as an ES module.

## Setup/env
- Node 22 LTS is the canonical CI matrix version.
- npm 10/11.
- The package is **distributed as a Git-URL npm dependency** (no public npm registry). Consumers pin a bare-semver tag in their `package.json` (e.g. `"@magicsunday/webtrees-chart-lib": "github:magicsunday/webtrees-chart-lib#1.12.0"`). The `prepare` script builds `dist/` on install so consumers get a built bundle without running rollup themselves.
- Only `dist/` is in the published `files` whitelist — keep the publish surface small.

## Build & tests
- **`npm run ci:test` is the gate that MUST be green before every commit** — it chains `npm run ci:test:js:config` (the `check-js-config` lockstep gate shipped by `@magicsunday/coding-standard`) → `biome ci` (lint + format check, error-on-warnings) → `npm run typecheck` (`tsc --noEmit -p tsconfig.json`) → `npm test` (jest with `--experimental-vm-modules` for native ESM) → `npm run cpd` (jscpd, scan paths in `.jscpd.json`). It is `npm run ci:test:js` followed by `npm run cpd`. The GitHub Actions `test` job runs `ci:test:js`, and copy-paste detection runs as its own `cpd` job through the shared workflow of the `.github` repository.
- The `consumer-types` job runs once per entry of the matrix in `.github/workflows/ci.yml`: it builds this library, swaps the result into that consumer's `node_modules` and runs the consumer's `npm run typecheck` at its default branch, so a public type change that breaks a consumer shows up before a bump. The consumer is typechecked once as installed first. A consumer that is already red on its own gets a warning and is not checked against the new build, so it does not turn the job red. Whether the job blocks a merge is set by branch protection, not by this file. The job checks the declarations only, so a changed peer dependency range is settled by the consumer's own install on its bump, not here. Adding a consumer means adding it to the matrix.
- Individual scripts when iterating: `npm test` (jest only), `npm run lint` / `npm run lint:fix` (biome, `biome.json` extends the shared `magicsunday/coding-standard` base), `npm run typecheck`, `npm run cpd`, `npm run format` / `npm run format:check`.
- Build: `npm run build` (empties `dist/`, then rollup → one `dist/webtrees-chart-lib-<entry>.es.js` per subpath entrypoint + sourcemaps, then `tsc -p tsconfig.dts.json` emits `dist/types/*.d.ts`).
- The `prepare` script runs `npm run build` automatically on install — you rarely need to invoke build manually except when validating output.
- The `prepublishOnly` script runs `ci:test && build` to gate any accidental publish through the full quality bar.

### Two TypeScript configs
- `tsconfig.json` runs the strict type-check pass (`tsc --noEmit -p tsconfig.json`) and is the gate for type correctness. It extends the shared strict base `@magicsunday/coding-standard/tsconfig/base` (see *Tooling parity* below) and adds only this repository's own options (target/module/lib, `checkJs`, the `src/` include).
- Under the strict base, a value the checker cannot prove present — a guarded array element, a backing field the constructor always fills through its setter — is narrowed with a JSDoc cast (`/** @type {T} */ (expr)`) or read through the widget's own getter, never by changing runtime behaviour. Widgets read `this.margin` / `this.emptyMessage` / `this.ariaLabel` / `this.i18n` (and their own configured fields) through the getters, which cast the backing field once.
- `tsconfig.dts.json` is the emit-only config that ships `.d.ts` files to consumers (`checkJs: false`, `emitDeclarationOnly: true`). The split keeps d.ts emission resilient against transient JSDoc issues during refactors without silently degrading consumer typings — the strict pass remains the gate. That pass cannot see an untyped member of the emitted declaration, so `tests/dts-emit.test.js` emits the declarations and type-checks them under `noImplicitAny` the way a strict consumer would. A field documented with `@private` was emitted without its type, so a field carries `@type` and no `@private`.

## Architecture

### Layout
All filenames are kebab-case; class identifiers exported from them stay PascalCase.
```
src/
  infra.js                — tree-chart infrastructure re-exports; also the `/infra` rollup subpath entry
  widgets.js              — widget re-exports; also the `/widgets` rollup subpath entry
  chart-core.js           — page-bootstrap helpers (buildChartAjaxUrl, syncCollapseToggle,
                            setChartAjaxUrl, setChartOptionsGlobal);
                            also the `/chart-core` rollup subpath entry
  storage.js              — Storage class
  chart/
    chart-overlay.js      — centred SVG group wrapper
    tooltip.js            — createChartTooltip(), escapeHtml(), tooltip line formatters
    axis/
      axis-chrome.js      — stripAxisDomainPath(), stripAxisTickLines() (d3-axis chrome removal)
    bars/
      rounded-bar-path.js — rounded-corner bar <path> builder (bar, mirror and diverging widgets)
    layout/
      network-layout.js   — seeded force solver, aspect fit and label placement (network graph)
    links/
      constants.js        — LINE_END_TRIM_PX, MARRIAGE_STAGGER_PX
      elbow-path.js       — elbowsPath()
      marriage-path.js    — marriagePath()
    orientation/
      orientation.js                  — Orientation (layout shape and direction of a d3.tree() layout)
    svg/
      chart-export.js          — base class (ChartExport)
      chart-export-factory.js  — format dispatcher (createChartExport)
      chart-zoom.js            — D3 zoom config (ChartZoom)
      svg-defs.js              — <defs> helper (SvgDefs)
      export/
        png-chart-export.js    — canvas → PNG (PngChartExport)
        svg-chart-export.js    — standalone .svg with embedded styles (SvgChartExport)
    text/
      measure.js               — measureText()
    util/
      coerce.js                — numeric/option coercion helpers
      safe-href.js             — consumer-href sanitiser (blocks every non-http(s) scheme)
    widgets/                   — data-agnostic chart primitives (one PascalCase export each)
      base-widget.js           — BaseWidget (target resolution, shared accessors, empty state, redraw clearing)
      area-density.js, bar-chart.js, box-plot.js, chord-diagram.js,
      diverging-bar-chart.js, donut-chart.js, event-timeline.js, gauge-arc.js,
      heatmap.js, line-chart.js, mirror-histogram.js, month-radial.js,
      name-bubbles.js, name-timeline.js, network-graph.js, sankey-flow.js,
      sequence-chain.js, stacked-bar.js, stream-graph.js, treemap.js,
      world-map.js
  color/
    family-color.js            — depthHsl, familyBranchHsl, hexToHsl, …
  text/
    truncate-name.js           — truncateNames, truncateToFit
  types/
    d3-axis.d.ts, d3-sankey.d.ts — local ambient typings for untyped d3 entry points
tests/                         — mirrors src/ layout (kebab-case filenames);
                                 build-config.test.js guards the d3-import ↔ rollup-external ↔ peerDependencies
                                 sync and that the entrypoints, bundles, declarations and `files` agree
```

### Public API (subpath entrypoints)
See README.md for the per-export purpose table. The package declares these public entrypoints, and no bare one: `./infra` (`src/infra.js`, the tree-chart infrastructure), `./widgets` (`src/widgets.js`, every class extending `BaseWidget`) and `./chart-core` (`src/chart-core.js`, the page-bootstrap helpers the tree-chart modules import from their `page-init.js`).

Adding a new public API: re-export it from `src/infra.js` or `src/widgets.js` (a widget goes to `widgets.js`, everything else to `infra.js`) or from `src/chart-core.js` for that subpath, add the name to the matching list in `tests/index.test.js` (`WIDGETS_SURFACE` for a widget, `INFRA_SURFACE` for the infrastructure, or `CHART_CORE_SURFACE`), and add it to the README **import block** of its subpath. Those blocks are the complete lists, whereas the API tables below them are prose covering only the exports that need explaining, so add a table row when yours does. The tests compare every pinned surface by set equality, so any export not listed in `tests/index.test.js` fails CI. The README is not checked, keep it in step by hand.

A **module-level `@typedef` or `@callback` in `src/chart-core.js`** is public too: TypeScript emits it as an `export type` a consumer can `@import`, so it must be listed in `CHART_CORE_TYPE_SURFACE`, the type counterpart of `CHART_CORE_SURFACE` in the same file. That check scans the whole module, so an internal-only helper type declared there fails CI as well — keep such types out of `chart-core.js`, or list them and accept that they are published.

Removing an export is a public-API change: verify no consumer imports it, as a **value or a JSDoc `@import` type**, before dropping it.

When the export is a **widget** (a class extending `BaseWidget`), also add its row to the widget table in `README.md` (the last column lists the `d3-*` packages its own module imports, `none` for no import) and its file to the `widgets/` entry of the source tree in the Layout section. Nothing checks these two listings, so keep them in step by hand.

### D3 dependencies
Every modular `d3-*` package the library imports is a **peer dependency** (also listed in `devDependencies` for local dev) and is marked `external` in `rollup.config.js`, so it is *not* bundled into `dist/` — the consuming module supplies the runtime D3 once. The authoritative list lives in `package.json` `peerDependencies`.

**Three lists must stay in lockstep**: the `d3-*` imports across `src/`, the `external` array in `rollup.config.js`, and `peerDependencies` in `package.json`. `tests/build-config.test.js` enforces this — adding a widget that pulls a new `d3-*` module without declaring it external/peer (or leaving a stale declaration behind) fails CI. When you introduce a new d3 import, update all three, and for a widget module also its row in the README widget table.

## Code style
- ES module syntax everywhere (`import`/`export`, `.js` extensions on relative imports — biome rule `correctness/useImportExtensions: error` enforces this).
- Double quotes, semicolons (biome formatter config).
- 4-space indent, 100 col width.
- `useConst`, `useTemplate`, `noParameterAssign` enforced.
- `noDoubleEquals` — always `===`/`!==`.
- File header comment: `This file is part of the package magicsunday/webtrees-chart-lib.`

## Local development with consumer modules

When fixing a bug that surfaces in a consumer (fan/ped/des or Statistics), you typically want to see the chart-lib change live there without releasing first. Statistics in particular consumes chart-lib through a sibling symlink in dev (its `compose.yaml` mounts `../webtrees-chart-lib`), so a rebuilt `dist/` is picked up directly. Three general options:

1. **`npm link`** (classic): `npm link` here, then `npm link @magicsunday/webtrees-chart-lib` in the consumer module. Reverse with `npm unlink`.
2. **`npm install <local-path>`** (direct path install): `npm install ../webtrees-chart-lib` in the consumer. Replaced again on the consumer's next `npm ci` against its lockfile.
3. **Edit-in-place via Git URL**: clone chart-lib alongside the consumer's `node_modules`, then symlink. Most fragile — npm's `prepare` script may overwrite. Prefer (1) or (2).

After local changes, rebuild dist with `npm run build` so the consumer's import resolves to the updated bundle.

## Tooling parity with chart modules
The Biome rules and formatter settings live in `magicsunday/coding-standard`, not here: `biome.json` is an `extends` stub of `@magicsunday/coding-standard/biome/base.json` that only sets `files.includes`. The package is a `github:` devDependency pinned to an exact tag (`github:magicsunday/coding-standard#<tag>`); a rule change is made there and picked up here by bumping that pin. Do not re-add rules or turn a shared rule off in the local `biome.json` without a documented reason — `npm run ci:test:js:config` (the `check-js-config` bin of that package, part of `ci:test`) fails on a stub that stops extending the base or weakens it.
- `@biomejs/biome` and `typescript` stay this repository's own devDependencies — the shared package delivers no toolchain — and must satisfy its `peerDependencies` (read them from `node_modules/@magicsunday/coding-standard/package.json`). Keep `$schema` in `biome.json` at the installed Biome version.
- `tsconfig.json` extends `@magicsunday/coding-standard/tsconfig/base` and must not override any flag that base pins (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `isolatedModules`, `forceConsistentCasingInFileNames`, …) — `npm run ci:test:js:config` checks the effective config against the base (GH-101).
- `tsconfig.json` carries no `paths` mapping: a tsconfig does not type-check JavaScript inside `node_modules` (`maxNodeModuleJsDepth` 0, unlike a jsconfig), so the ambient `src/types/d3-axis.d.ts` / `d3-sankey.d.ts` modules already win for those imports. Do not add one back — Biome reads `tsconfig.json` `paths` too, and a mapped bare import (`d3-axis`, `src/…`) then trips `useImportExtensions`.
- `.jscpd.json` lists every language in `src/` by jscpd **format** name (`javascript`, `typescript` for the ambient `src/types/*.d.ts`) — never `js`/`ts`, which scan nothing and report a clean run.
- The jest config and CI workflow shape stay in step with the chart modules; fan-chart is the canonical source.

## Git flow
- Commit subjects — and the pull-request title — are governed by the shared `commit-convention` gate; the normative rule and its full rationale live in `magicsunday/.github/.github/workflows/commit-convention.yml@main`, which self-tests a decision table before applying it. In short: a `GH-`-prefixed subject must match `^GH-\d+: [A-Z]`, every other subject `^[A-Z]` — a capitalised English imperative — and conventional-commit prefixes (`feat:`, `Fix:`, …) as well as path-like starts (`src/…: …`) are rejected whatever their case. It runs on every pull request via `.github/workflows/commit-lint.yml`, advisory until `commit-convention / Commit convention` is a required context in branch protection.
- Branches for an issue are named exactly `GH-<N>`; the `GH-<N>: ` prefix marks work that belongs to that issue, so a drive-by fix on the branch keeps its own unprefixed subject.
- The pull-request body closes the issue with `Closes #<N>` — the `GH-<N>: ` subject prefix is not a GitHub link and closes nothing.
- Never add a `Co-Authored-By:` trailer or any other AI attribution.

## Release
Library — no asset zip pipeline, no PHP vendor bundle. A release is just verify → bump → commit → tag → push → GitHub release. `dist/` is gitignored and never committed; the consumer's `prepare` script rebuilds it on install.

### `make release`
`Make/release.mk` automates the whole flow. Run it in an environment with the JS toolchain directly (`git node npm jq gh`), e.g. the webtrees buildbox; non-interactive needs `GH_TOKEN`:
```shell
export GH_TOKEN=<token>
make release X.Y.Z [NOTES_FILE=path | NOTES="..."]
# make release VERSION=X.Y.Z … is also accepted
```
What it does (targets `release-check` → `release-prepare` → `release-publish`):
1. **Checks** — required tools present, `VERSION` is bare semver (`^[0-9]+\.[0-9]+\.[0-9]+$`, no `v` prefix, to match the chart-module / Statistics pipelines), working tree clean, HEAD on a branch, `gh` authenticated.
2. **Verify** — `npm ci` → `npm run lint` → `npm test` → `npm run build` (CI parity).
3. **Bump + commit + tag** — bumps `version` in `package.json` + `package-lock.json` via `jq`, commits `Release X.Y.Z` (the conventional release-commit subject; no post-release `-dev` bump), tags `X.Y.Z`.
4. **Publish** — `git push origin main --tags`, then `gh release create`. Notes precedence: `NOTES_FILE` > `NOTES` > GitHub auto-generated. When releasing inside the buildbox container, put `NOTES_FILE` under the bind-mounted repo dir — a host `/tmp` path is not mounted.

`make release-recover` restores `package.json` / `package-lock.json` if `release-prepare` aborts after the bump (it does not unwind a created commit/tag — the printed hints show how).

### Bump consumers
After tagging, for each of fan/ped/des plus Statistics, bump the pin in `package.json`:

```diff
-  "@magicsunday/webtrees-chart-lib": "github:magicsunday/webtrees-chart-lib#<OLD>"
+  "@magicsunday/webtrees-chart-lib": "github:magicsunday/webtrees-chart-lib#<X.Y.Z>"
```

**A plain `npm install` does NOT re-resolve a moved/new git tag** — npm keeps the old `resolved` commit in `package-lock.json`, and `npm cache clean --force` does not change that. Force re-resolution by removing the package and installing the exact spec:

```shell
rm -rf node_modules/@magicsunday/webtrees-chart-lib
npm install @magicsunday/webtrees-chart-lib@github:magicsunday/webtrees-chart-lib#<X.Y.Z>
```

Verify the lock entry now reads `"version": "<X.Y.Z>"` and `resolved …#<the tag's commit SHA>`, and that its embedded `peerDependencies` match the new release. For a consumer kept on a local dev symlink (`node_modules/@magicsunday/webtrees-chart-lib` → the sibling source), this same step replaces the symlink with the released tag — correct once the iteration is shipped.

**The explicit-spec install does NOT run the consumer's `prepare`/build**, so the committed bundle would otherwise stay built against the old chart-lib. Rebuild and confirm the result:

```shell
npm run prepare          # or `make build`
git diff --word-diff resources/js/*-dev.min.js   # expect only real chart-lib code (+ Version banner)
```

A consumer that only uses chart-lib scaffolding may show no bundle change; one that bundles a changed widget will. Then commit `package.json` + `package-lock.json` + any regenerated bundle, and ship a consumer patch release only if the bump has a user-visible effect.

## Common pitfalls
- The lib does **not** publish to the public npm registry. `npm publish` is intentionally blocked indirectly by the `prepublishOnly` gate; consumers always install via Git URL.
- The `prepare` script runs on every install. If it fails (rollup error, biome lint error in `prepublishOnly`), consumers' `npm ci` fails too. Keep `main` always green-buildable.
- D3 imports: import from the modular packages (`d3-selection`, `d3-zoom`, …) — never from the meta `d3` package, since that pulls in everything and breaks rollup tree-shaking.
- Path imports must include the `.js` extension (biome `useImportExtensions: error`). `import "./foo"` is invalid; write `import "./foo.js"`.
