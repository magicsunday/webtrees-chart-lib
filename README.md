[![Latest version](https://img.shields.io/github/v/release/magicsunday/webtrees-chart-lib?sort=semver)](https://github.com/magicsunday/webtrees-chart-lib/releases/latest)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](https://github.com/magicsunday/webtrees-chart-lib/blob/main/LICENSE)
[![CI](https://github.com/magicsunday/webtrees-chart-lib/actions/workflows/ci.yml/badge.svg)](https://github.com/magicsunday/webtrees-chart-lib/actions/workflows/ci.yml)

# @magicsunday/webtrees-chart-lib

Shared D3-based JavaScript chart library for the [magicsunday](https://github.com/magicsunday) family of [webtrees](https://www.webtrees.net) chart modules. Centralises SVG export, zoom behaviour, overlay rendering, text measurement, and localStorage form persistence so each chart module does not have to reimplement them.

This package ships no UI of its own — it is consumed as an npm dependency by:

- [webtrees-fan-chart](https://github.com/magicsunday/webtrees-fan-chart) — SVG ancestor fan chart
- [webtrees-pedigree-chart](https://github.com/magicsunday/webtrees-pedigree-chart) — SVG pedigree chart
- [webtrees-descendants-chart](https://github.com/magicsunday/webtrees-descendants-chart) — SVG descendants chart
- [webtrees-statistics](https://github.com/magicsunday/webtrees-statistics) — six-tab statistics dashboard (donut / line / bar / stacked / diverging / chord / sankey / stream / name-bubbles / month-radial / mirror-histogram / gauge / world-map widgets)

## Installation

The package is distributed as a Git-URL npm dependency (not on the public npm registry). Pin to a bare-semver tag in your `package.json` (no `v` prefix — matches the chart-module / Statistics release-pipeline convention):

```json
"dependencies": {
    "@magicsunday/webtrees-chart-lib": "github:magicsunday/webtrees-chart-lib#1.6.0"
}
```

The published `dist/` folder is built on install via the `prepare` script, so consumers do not need to run rollup themselves.

### Peer dependencies

```
d3-array ^3.0
d3-geo ^3.0
d3-scale ^4.0
d3-scale-chromatic ^3.0
d3-selection ^3.0
d3-shape ^3.0
d3-transition ^3.0
d3-zoom ^3.0
```

These are kept as peer dependencies so the consuming module controls the exact D3 version and the lib does not contribute to bundle duplication. Chart widgets (`DonutChart`, `WorldMap`, `ProgressList`, `BarChart`, `LineChart`, `StackedBar`, `DivergingBar`, `DivergingBarChart`, `ChordDiagram`, `SankeyFlow`, `StreamGraph`, `NameBubbles`, `MonthRadial`, `MirrorHistogram`, `GaugeArc`, `AreaDensity`, `BoxPlot`) pull additional modular d3 packages — see the Widgets section for which widget needs which package.

## Public API

```javascript
import {
    // Chart scaffolding
    ChartOverlay,
    ChartExport,
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
    ABBREV_GIVEN,
    ABBREV_SURNAME,
    // Storage
    Storage,
    // Color helpers (ancestor charts)
    hexToHsl,
    depthBounds,
    depthHsl,
    familyCenterHsl,
    familyBranchHsl,
    BRANCH_HUE_SPREAD,
    SATURATION_STEP,
    LIGHTNESS_STEP,
    MAX_GENERATIONS_REF,
    // Chart widgets
    BaseWidget,
    DonutChart,
    WorldMap,
    ProgressList,
    BarChart,
    LineChart,
    StackedBar,
    DivergingBar,
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
} from "@magicsunday/webtrees-chart-lib";
```

### `chart-core` subpath entrypoint

For page bootstrap code shared by pedigree/fan/descendants modules, use the dedicated subpath:

```javascript
import {
    Storage,
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
| `ChartExport` | Base class for export implementations — handles the shared logic for serialising the live SVG and offering it as a download. |
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
| `depthBounds(baseHsl)` | Returns `{minSaturation, maxLightness}` describing how far the depth gradient is allowed to fade from the base color. |
| `depthHsl(hue, baseHsl, depth, maxGenerations = 10)` | Returns a CSS `hsl(...)` string for a given depth — saturation drops by `SATURATION_STEP`/gen, lightness rises by `LIGHTNESS_STEP`/gen, hue is taken from the caller (e.g. shifted by branch). `maxGenerations` controls how many steps the gradient spans. |
| `familyCenterHsl(baseHsl)` | Returns a CSS `hsl(...)` string for the proband's center box — one step beyond the most pastel depth-1 value so the root reads as the family root rather than a peer of generation 1. |
| `familyBranchHsl(baseHsl, depth, half, maxGenerations = 10)` | Returns a CSS `hsl(...)` string for a branch box. `half` is the branch position in `0..1` within its paternal/maternal half — `0.5` is the half's center, `0` and `1` are its outer edges. Internally calls `depthHsl()` with a hue shifted by `(half - 0.5) * BRANCH_HUE_SPREAD`. |
| `BRANCH_HUE_SPREAD` (60) | Hue range (degrees) a branch can shift around its base hue across `half ∈ [0, 1]`. |
| `SATURATION_STEP` (3.5) | Saturation decrease per generation (percentage points). |
| `LIGHTNESS_STEP` (3) | Lightness increase per generation (percentage points). |
| `MAX_GENERATIONS_REF` (10) | Default `maxGenerations` so colors at a given depth stay identical regardless of how many generations the chart actually shows. |

### Chart widgets

Data-agnostic chart primitives consumed via `new Widget(target, options).draw(data)`. Every widget renders the same `.chart-empty-state` placeholder when `draw([])` is called, so consumers do not need to guard against empty datasets. Redraw is idempotent in both directions (data → empty → data → empty).

| Export             | Purpose                                                                                                                                                                                                                                       | d3 modules pulled                                                       |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| `BaseWidget`       | Common base — target resolution (id string or `HTMLElement`), dimension precedence (option > container > default), shared empty-state renderer that replaces prior placeholders rather than stacking them.                                    | none                                                                    |
| `DonutChart`       | D3 donut with optional centre value + label. One `<path>` per slice, caller-controlled CSS class + inline fill. Sanitises non-finite / negative values; all-zero datasets fall through to empty-state.                                        | `d3-shape`, `d3-selection`                                              |
| `WorldMap`         | D3-geo choropleth. Geojson is consumer-owned. Case-insensitive ISO-3166-1 alpha-2 country lookup; `accent` option tints rows per-view; renders geometry even when data is empty.                                                               | `d3-geo`, `d3-scale`, `d3-scale-chromatic`, `d3-array`, `d3-selection`  |
| `ProgressList`     | Plain-HTML labelled bar list. Bar width = `value / total-or-dataset-max`, clamped at 100 %. `textContent` rendering — caller-provided labels stay safe.                                                                                       | none                                                                    |
| `BarChart`         | Vertical bar chart with 2-px minimum-height clamp on non-zero bars so a single low value stays clickable, plus a 1-px stub on the baseline for zero-value bars.                                                                                | `d3-scale`, `d3-selection`                                              |
| `LineChart`        | Single-/multi-series line chart, y-axis rendered as gridlines, colour delegated to CSS when themed (`.line-1`, `.line-2`, …).                                                                                                                  | `d3-scale`, `d3-shape`, `d3-selection`                                  |
| `StackedBar`       | Multi-segment vertical bars with wrap-aware legend that reserves vertical band before overflow.                                                                                                                                                | `d3-scale`, `d3-shape`, `d3-selection`                                  |
| `DivergingBar`     | Per-row 3-column grid (left value, centre label, right value) for paired distributions (e.g. men vs. women).                                                                                                                                   | `d3-scale`, `d3-selection`                                              |
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
npm test                    # jest
npm run lint                # biome lint
npm run format:check        # biome format check
npm run cpd                 # jscpd duplicate detection
npm run build               # rollup → dist/
```

## Changelog

See [Releases](https://github.com/magicsunday/webtrees-chart-lib/releases) for per-version notes.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
