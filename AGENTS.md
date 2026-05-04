## Overview
This repository hosts `@magicsunday/webtrees-chart-lib` — a shared D3-based JavaScript library consumed by `webtrees-fan-chart`, `webtrees-pedigree-chart`, and `webtrees-descendants-chart`. It contains the common SVG helpers (export, zoom, overlay, defs), text measurement, and localStorage form persistence those modules use, so each chart does not have to reimplement them. No PHP, no webtrees integration of its own — pure browser JS shipped via rollup as an ES module.

## Setup/env
- Node 22 LTS is the canonical CI matrix version.
- npm 10/11.
- The package is **distributed as a Git-URL npm dependency** (no public npm registry). Consumers pin a tag in their `package.json` (e.g. `"@magicsunday/webtrees-chart-lib": "github:magicsunday/webtrees-chart-lib#v1.0.1"`). The `prepare` script builds `dist/` on install so consumers get a built bundle without running rollup themselves.
- Only `dist/` is in the published `files` whitelist — keep the publish surface small.

## Build & tests
- **`npm test` MUST run before every commit** — jest with `--experimental-vm-modules` for native ESM support.
- **`npm run lint` MUST run before every commit** — biome lint (uses `biome.json` shared with the chart modules).
- Build: `npm run build` (rollup → `dist/webtrees-chart-lib.es.js` + sourcemap).
- The `prepare` script runs `npm run build` automatically on install — you rarely need to invoke build manually except when validating output.
- The `prepublishOnly` script runs `lint && build` to gate any accidental publish through the quality bar.

### Two TypeScript configs
- `jsconfig.json` runs the strict type-check pass (`tsc --noEmit -p jsconfig.json`) and is the gate for type correctness.
- `tsconfig.dts.json` is the emit-only config that ships `.d.ts` files to consumers (`checkJs: false`, `emitDeclarationOnly: true`). The split keeps d.ts emission resilient against transient JSDoc issues during refactors without silently degrading consumer typings — the strict pass remains the gate.

## Architecture

### Layout
All filenames are kebab-case; class identifiers exported from them stay PascalCase.
```
src/
  index.js                — barrel re-exports for the public API
  storage.js              — Storage class
  chart/
    chart-overlay.js      — centred SVG group wrapper
    links/
      constants.js        — LINE_END_TRIM_PX, MARRIAGE_STAGGER_PX
      elbow-path.js       — elbowsPath()
      marriage-path.js    — marriagePath()
    orientation/
      orientation.js                  — abstract base
      orientation-top-bottom.js       — OrientationTopBottom
      orientation-bottom-top.js       — OrientationBottomTop
      orientation-left-right.js       — OrientationLeftRight
      orientation-right-left.js       — OrientationRightLeft
    svg/
      chart-export.js          — base class (ChartExport)
      chart-export-factory.js  — format dispatcher (ChartExportFactory)
      chart-zoom.js            — D3 zoom config (ChartZoom)
      svg-defs.js              — <defs> helper (SvgDefs)
      export/
        png-chart-export.js    — canvas → PNG (PngChartExport)
        svg-chart-export.js    — standalone .svg with embedded styles (SvgChartExport)
    text/
      measure.js               — measureText()
  color/
    family-color.js            — depthHsl, familyBranchHsl, hexToHsl, …
  text/
    truncate-name.js           — truncateNames, truncateToFit
tests/                         — mirrors src/ layout (kebab-case filenames)
```

### Public API (index.js barrel)
See README.md for the per-export purpose table. Adding a new public API: re-export from `src/index.js` so consumers can import it from the package root.

### D3 dependencies
`d3-selection`, `d3-transition`, `d3-zoom` are **peer dependencies** (also listed in `devDependencies` for local dev). They are marked as `external` in `rollup.config.js` so they are *not* bundled into `dist/`. The consuming module supplies the runtime D3.

## Code style
- ES module syntax everywhere (`import`/`export`, `.js` extensions on relative imports — biome rule `correctness/useImportExtensions: error` enforces this).
- Double quotes, semicolons (biome formatter config).
- 4-space indent, 100 col width.
- `useConst`, `useTemplate`, `noParameterAssign` enforced.
- `noDoubleEquals` — always `===`/`!==`.
- File header comment: `This file is part of the package magicsunday/webtrees-chart-lib.`

## Local development with consumer modules

When fixing a bug that surfaces in fan/ped/des, you typically want to see the chart-lib change live in the consumer without releasing first. Three options:

1. **`npm link`** (classic): `npm link` here, then `npm link @magicsunday/webtrees-chart-lib` in the consumer module. Reverse with `npm unlink`.
2. **`npm install <local-path>`** (direct path install): `npm install ../webtrees-chart-lib` in the consumer. Replaced again on the consumer's next `npm ci` against its lockfile.
3. **Edit-in-place via Git URL**: clone chart-lib alongside the consumer's `node_modules`, then symlink. Most fragile — npm's `prepare` script may overwrite. Prefer (1) or (2).

After local changes, rebuild dist with `npm run build` so the consumer's import resolves to the updated bundle.

## Tooling parity with chart modules
`biome.json` is shared with the chart modules (same rules, same formatter config). When updating biome version or rules here, mirror to fan/ped/des in the same session, and vice versa. Same applies to the jest config and CI workflow shape. fan-chart is the canonical source.

## Release
- Library — no asset zip pipeline. Releases are pure git tag + GitHub release plus a one-line bump of every consumer's `package.json` to the new tag.

### Pre-tag checklist
1. `npm test` clean.
2. `npm run lint` clean.
3. `npm run build` clean (sanity — published consumers will run this on install).
4. `package.json` `version` reflects the new tag.

### Tag + release
```shell
git tag v<X.Y.Z>
git push origin main --tags
gh release create v<X.Y.Z> --title "v<X.Y.Z>" --notes-file /path/to/notes.md
```

### Bump consumers
For each of fan/ped/des, edit `package.json`:

```diff
-  "@magicsunday/webtrees-chart-lib": "github:magicsunday/webtrees-chart-lib#v<OLD>"
+  "@magicsunday/webtrees-chart-lib": "github:magicsunday/webtrees-chart-lib#v<X.Y.Z>"
```

Then `npm install` in each consumer to refresh its `package-lock.json`, commit, and ship a patch release of the consumer.

## Common pitfalls
- The lib does **not** publish to the public npm registry. `npm publish` is intentionally blocked indirectly by the `prepublishOnly` gate; consumers always install via Git URL.
- The `prepare` script runs on every install. If it fails (rollup error, biome lint error in `prepublishOnly`), consumers' `npm ci` fails too. Keep `main` always green-buildable.
- D3 imports: import from the modular packages (`d3-selection`, `d3-zoom`, …) — never from the meta `d3` package, since that pulls in everything and breaks rollup tree-shaking.
- Path imports must include the `.js` extension (biome `useImportExtensions: error`). `import "./foo"` is invalid; write `import "./foo.js"`.
