[![Latest version](https://img.shields.io/github/v/release/magicsunday/webtrees-chart-lib?sort=semver)](https://github.com/magicsunday/webtrees-chart-lib/releases/latest)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](https://github.com/magicsunday/webtrees-chart-lib/blob/main/LICENSE)
[![CI](https://github.com/magicsunday/webtrees-chart-lib/actions/workflows/ci.yml/badge.svg)](https://github.com/magicsunday/webtrees-chart-lib/actions/workflows/ci.yml)

# @magicsunday/webtrees-chart-lib

Shared D3-based JavaScript chart library for the [magicsunday](https://github.com/magicsunday) family of [webtrees](https://www.webtrees.net) chart modules. Centralises SVG export, zoom behaviour, overlay rendering, text measurement, and localStorage form persistence so each chart module does not have to reimplement them.

This package ships no UI of its own — it is consumed as an npm dependency by:

- [webtrees-fan-chart](https://github.com/magicsunday/webtrees-fan-chart) — SVG ancestor fan chart
- [webtrees-pedigree-chart](https://github.com/magicsunday/webtrees-pedigree-chart) — SVG pedigree chart
- [webtrees-descendants-chart](https://github.com/magicsunday/webtrees-descendants-chart) — SVG descendants chart
- [webtrees-statistics](https://github.com/magicsunday/webtrees-statistics) — multi-tab statistics dashboard; consumes the full chart-widget set (see the Widgets section below)

## Installation

The package is distributed as a Git-URL npm dependency (not on the public npm registry). Pin to a bare-semver tag in your `package.json` (no `v` prefix — matches the chart-module / Statistics release-pipeline convention):

```json
"dependencies": {
    "@magicsunday/webtrees-chart-lib": "github:magicsunday/webtrees-chart-lib#1.12.0"
}
```

The published `dist/` folder is built on install via the `prepare` script, so consumers do not need to run rollup themselves.

### Peer dependencies

The consuming module supplies the modular d3 packages the library imports (so it controls the exact D3 version and the lib does not contribute to bundle duplication). The authoritative list — with version ranges — lives in `package.json` `peerDependencies`; the build keeps it in lockstep with the actual `src/` imports via `tests/build-config.test.js`. Which widget pulls which package is documented per-row in the Widgets section below.

## Public API

```javascript
import {
    // Chart scaffolding
    ChartOverlay,
    ChartExportFactory,
    ChartZoom,
    PngChartExport,
    SvgChartExport,
    SvgDefs,
    // Orientation strategies
    Orientation,
    OrientationTopBottom,
    OrientationBottomTop,
    OrientationLeftRight,
    OrientationRightLeft,
    // Link/marriage geometry
    elbowsPath,
    marriagePath,
    LINE_END_TRIM_PX,
    MARRIAGE_STAGGER_PX,
    // Text
    measureText,
    truncateNames,
    truncateToFit,
    // Storage
    Storage,
    // Color helpers (ancestor charts)
    hexToHsl,
    depthHsl,
    familyCenterHsl,
    familyBranchHsl,
    // Chart widgets
    DonutChart,
    EventTimeline,
    WorldMap,
    ProgressList,
    BarChart,
    LineChart,
    StackedBar,
    DivergingBarChart,
    ChordDiagram,
    SankeyFlow,
    StreamGraph,
    NameBubbles,
    MonthRadial,
    MirrorHistogram,
    GaugeArc,
    AreaDensity,
    BoxPlot,
    Heatmap,
    Treemap,
    NameTimeline,
    NetworkGraph,
    SequenceChain,
} from "@magicsunday/webtrees-chart-lib";
```

### `chart-core` subpath entrypoint

For page bootstrap code shared by pedigree/fan/descendants modules, use the dedicated subpath:

```javascript
import {
    Storage,
    applyQueryEntry,
    buildChartAjaxUrl,
    syncCollapseToggle,
    setChartAjaxUrl,
    setChartOptionsGlobal,
} from "@magicsunday/webtrees-chart-lib/chart-core";
```

This entrypoint centralises URL/query assembly, collapse-state persistence, and
chart-options namespace publishing so module page-init scripts can share one implementation.

### Chart scaffolding

| Export | Purpose |
|---|---|
| `ChartOverlay` | SVG group helper — centres the chart inside its viewport, accepts pan/transform updates from `ChartZoom`. |
| `ChartZoom` | Configures a D3 zoom behaviour for the chart's visual group. Restricted to Ctrl+wheel + pinch (so normal page scrolling is preserved); zoom range 0.1× – 20×. |
| `ChartExportFactory` | Picks the right export implementation by file format (`png` / `svg`). |
| `PngChartExport` | Renders the live SVG into a PNG via canvas. |
| `SvgChartExport` | Serialises the live SVG to a standalone `.svg` file (with embedded styles + fonts). |
| `SvgDefs` | Helper to attach `<defs>` elements (gradients, clipPaths, arrowhead markers) to a chart's root SVG. |

### Text & storage

| Export | Purpose |
|---|---|
| `measureText(text, font)` | Returns the rendered pixel width of a text string using a lazily-created off-screen canvas. Reuses the canvas across calls. |
| `Storage` | Persists configuration form values to localStorage. Each field is registered by its element ID and restored on page load. |

### Color helpers (added in 1.1.0)

Hue/saturation/lightness primitives for coloring ancestor charts by family branch and generational depth. All functions work on HSL tuples (`[hue, saturation, lightness]`); use `hexToHsl()` to convert a user-picked hex color into the input form.

| Export | Purpose |
|---|---|
| `hexToHsl(hex)` | Converts a 6-digit hex string (e.g. `"#3b82b0"`, leading `#` optional) to an `[h, s, l]` tuple. Hue 0..360, S/L 0..100. Falls back to neutral grey `[0, 0, 50]` on invalid input. |
| `depthHsl(hue, baseHsl, depth, maxGenerations = 10)` | Returns a CSS `hsl(...)` string for a given depth — saturation drops 3.5 points per generation, lightness rises 3 points per generation, hue is taken from the caller (e.g. shifted by branch). `maxGenerations` controls how many steps the gradient spans. |
| `familyCenterHsl(baseHsl)` | Returns a CSS `hsl(...)` string for the proband's center box — one step beyond the most pastel depth-1 value so the root reads as the family root rather than a peer of generation 1. |
| `familyBranchHsl(baseHsl, depth, half, maxGenerations = 10)` | Returns a CSS `hsl(...)` string for a branch box. `half` is the branch position in `0..1` within its paternal/maternal half — `0.5` is the half's center, `0` and `1` are its outer edges. Internally calls `depthHsl()` with a hue shifted by `(half - 0.5) × 60°`. |

### Chart widgets

Data-agnostic chart primitives consumed via `new Widget(target, options).draw(data)`. Every widget renders the same `.chart-empty-state` placeholder when `draw([])` is called, so consumers do not need to guard against empty datasets. Redraw is idempotent in both directions (data → empty → data → empty).

| Export             | Purpose                                                                                                                                                                                                                                       | d3 modules pulled                                                       |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| `DonutChart`       | D3 donut with optional centre value + label. One `<path>` per slice, caller-controlled CSS class + inline fill. Sanitises non-finite / negative values; all-zero datasets fall through to empty-state.                                        | `d3-shape`, `d3-selection`                                              |
| `WorldMap`         | D3-geo choropleth. Geojson is consumer-owned. Case-insensitive ISO-3166-1 alpha-2 country lookup; `accent` option tints rows per-view; renders geometry even when data is empty.                                                               | `d3-geo`, `d3-scale`, `d3-scale-chromatic`, `d3-array`, `d3-selection`  |
| `ProgressList`     | Plain-HTML labelled bar list. Bar width = `value / total-or-dataset-max`, clamped at 100 %. `textContent` rendering — caller-provided labels stay safe.                                                                                       | none                                                                    |
| `BarChart`         | Vertical bar chart with 2-px minimum-height clamp on non-zero bars so a single low value stays clickable, plus a 1-px stub on the baseline for zero-value bars.                                                                                | `d3-scale`, `d3-selection`                                              |
| `LineChart`        | Single-/multi-series line chart, y-axis rendered as gridlines, colour delegated to CSS when themed (`.line-1`, `.line-2`, …).                                                                                                                  | `d3-scale`, `d3-shape`, `d3-selection`                                  |
| `StackedBar`       | Multi-segment vertical bars with wrap-aware legend that reserves vertical band before overflow.                                                                                                                                                | `d3-scale`, `d3-shape`, `d3-selection`                                  |
| `DivergingBarChart`| Diverging (two-sided) bar chart — `left`/`right` series across shared row categories with rounded outer-corner bars, an entrance animation, and an optional group picker (omitted for single-group data).                                       | `d3-array`, `d3-ease`, `d3-path`, `d3-scale`, `d3-selection`, `d3-transition` |
| `ChordDiagram`     | Circular chord with caller-supplied tooltip value label.                                                                                                                                                                                       | `d3-chord`, `d3-shape`, `d3-selection`                                  |
| `SankeyFlow`       | Sankey flow diagram.                                                                                                                                                                                                                           | `d3-sankey`, `d3-selection`                                             |
| `StreamGraph`      | Stacked-area stream graph for trend visualisation over time.                                                                                                                                                                                   | `d3-scale`, `d3-shape`, `d3-selection`                                  |
| `NameBubbles`      | Circle-pack name cloud with jittered spiral layout, chord-fit fonts, and vertically-centred label + count block.                                                                                                                               | `d3-hierarchy`, `d3-selection`                                          |
| `MonthRadial`      | 12-segment radial dial with centre-value text vertically centred via `dominant-baseline`.                                                                                                                                                      | `d3-shape`, `d3-selection`                                              |
| `MirrorHistogram`  | Two-sided histogram (top vs bottom) with nested g-groups and a shared axis strip.                                                                                                                                                              | `d3-scale`, `d3-selection`                                              |
| `GaugeArc`         | Stroked semicircle gauge with value lifted to 56 px (no label inside the arc).                                                                                                                                                                 | `d3-shape`, `d3-selection`                                              |
| `AreaDensity`      | Continuous-area density plot.                                                                                                                                                                                                                  | `d3-scale`, `d3-shape`, `d3-selection`                                  |
| `BoxPlot`          | Box-and-whisker plot for distributional summaries.                                                                                                                                                                                             | `d3-scale`, `d3-selection`                                              |
| `EventTimeline`    | Year-keyed dot timeline: magnitude-scaled dots on a linear year axis with the count printed inside each dot and round-year ticks below. Built for a sparse set of events across a wide span; per-dot year captions are omitted so close years never collide. | `d3-array`, `d3-axis`, `d3-scale`, `d3-selection`                      |
| `Heatmap`          | Rows × columns grid of count cells, each tinted by its value within a single `accent` hue against one shared value scale (peak cell across the whole matrix), so intensity is comparable everywhere. Fully generic `rows` / `cols` label arrays + `values[row][col]`; zero cells keep a faint baseline tint and print their count. | `d3-array`, `d3-ease`, `d3-scale`, `d3-selection`                      |
| `Treemap`          | Squarified treemap of weighted items — each leaf's area is proportional to its weight, with an optional aggregated "rest" tile for the long tail.                                                                                                              | `d3-hierarchy`, `d3-selection`                                         |
| `NameTimeline`     | Plain-HTML categorical timeline — one labelled row per item, each a stem running from the axis start to a dot placed on a shared horizontal value axis. HTML rather than SVG, so labels wrap natively and the layout stays responsive without a redraw. Supports `maxItems` and a `formatter`. | none                                                                   |
| `NetworkGraph`     | Force-directed relationship graph with a deterministic seeded layout (identical input always lays out identically, so renders are stable and snapshotable). Optional pan/zoom, hub and highlight-path emphasis, and a cap badge when the node set is truncated. | `d3-selection`, `d3-zoom`                                              |
| `SequenceChain`    | Plain-HTML horizontal sequence strip — a row of "bead" items joined by a small connector glyph, scrolling sideways on overflow. A DOM/CSS widget (the only SVG is the inline ring glyph), so the consumer's stylesheet owns all colour and shape.               | none                                                                   |

Shared option set across all widgets:

| Option         | Default | Effect                                                                                       |
|----------------|---------|----------------------------------------------------------------------------------------------|
| `width`        | from container, then 250 / 640 / fallback default per widget | Pin the rendered width regardless of container size. Non-finite or non-positive values fall through to the container or default. |
| `height`       | from container, then 250 / 320 / fallback default per widget | Same as `width` for the vertical axis.                                                       |
| `emptyMessage` | `"No data available"` | Text rendered into the `.chart-empty-state` placeholder for empty / null / all-zero data.    |

Widget-specific options live in each widget's JSDoc / source comments; see the per-widget Jest spec under `tests/chart/widgets/*.test.js` for the canonical option contract.

## Usage example

```javascript
import { ChartZoom, ChartOverlay, ChartExportFactory, Storage } from "@magicsunday/webtrees-chart-lib";

// Persist the configuration form to localStorage
const storage = new Storage("my-chart-settings");
storage.register("generations");
storage.register("layout");

// Set up zoom + overlay on the SVG visual group
const overlay = new ChartOverlay(svgVisual);
const zoom = new ChartZoom(svgRoot, overlay);
zoom.attach();

// Wire the export button
exportButton.addEventListener("click", () => {
    const exporter = ChartExportFactory.create(format);
    exporter.export(svgRoot, "my-chart");
});
```

### Coloring an ancestor chart

```javascript
import { hexToHsl, familyCenterHsl, familyBranchHsl } from "@magicsunday/webtrees-chart-lib";

const paternalHsl = hexToHsl("#70a9cf");
const maternalHsl = hexToHsl("#d06f94");

// Proband center box
rootBox.style.fill = familyCenterHsl(paternalHsl);

// Each ancestor box: pick paternal vs maternal base by side, then ask
// for the depth-aware branch color.
for (const node of ancestors) {
    const baseHsl = node.isPaternal ? paternalHsl : maternalHsl;
    node.box.style.fill = familyBranchHsl(baseHsl, node.depth, node.halfPosition);
}
```

See the consumer modules (fan/pedigree/descendants chart) for full integrations.

## Development

See [AGENTS.md](AGENTS.md) for the full development workflow including local linking with consumer modules, the rollup build, the test suite, and the release flow.

Quick reference:

```shell
npm install
npm run ci:test             # full gate: biome ci + typecheck + cpd + jest
npm test                    # jest only
npm run lint                # biome lint
npm run typecheck           # tsc --noEmit -p jsconfig.json
npm run format:check        # biome format check
npm run cpd                 # jscpd duplicate detection
npm run build               # rollup → dist/ (+ .d.ts via tsconfig.dts.json)
```

## Changelog

See [Releases](https://github.com/magicsunday/webtrees-chart-lib/releases) for per-version notes.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
