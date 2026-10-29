[![Latest version](https://img.shields.io/github/v/release/magicsunday/webtrees-chart-lib?sort=semver)](https://github.com/magicsunday/webtrees-chart-lib/releases/latest)
[![License](https://img.shields.io/badge/license-GPL--3.0--or--later-blue.svg)](https://github.com/magicsunday/webtrees-chart-lib/blob/main/LICENSE)
[![CI](https://github.com/magicsunday/webtrees-chart-lib/actions/workflows/ci.yml/badge.svg)](https://github.com/magicsunday/webtrees-chart-lib/actions/workflows/ci.yml)

# @magicsunday/webtrees-chart-lib

Shared D3-based JavaScript chart library for the [magicsunday](https://github.com/magicsunday) family of [webtrees](https://www.webtrees.net) chart modules. Centralises the shared tree-chart infrastructure (SVG export, zoom, overlay, link geometry, text measurement, colour helpers, localStorage form persistence) and a data-agnostic chart widget set, so each chart module does not have to reimplement them.

This package ships no UI of its own. It is consumed as an npm dependency by:

- [webtrees-fan-chart](https://github.com/magicsunday/webtrees-fan-chart), SVG ancestor fan chart
- [webtrees-pedigree-chart](https://github.com/magicsunday/webtrees-pedigree-chart), SVG pedigree chart
- [webtrees-descendants-chart](https://github.com/magicsunday/webtrees-descendants-chart), SVG descendants chart
- [webtrees-statistics](https://github.com/magicsunday/webtrees-statistics), multi-tab statistics dashboard that consumes the full chart widget set (see Chart widgets below)

## Installation

The package is distributed as a Git-URL npm dependency (not on the public npm registry). Pin to a bare-semver release tag in your `package.json` (no `v` prefix, as in the chart-module and statistics release pipelines). Replace `X.Y.Z` with the [latest release](https://github.com/magicsunday/webtrees-chart-lib/releases/latest):

```json
"dependencies": {
    "@magicsunday/webtrees-chart-lib": "github:magicsunday/webtrees-chart-lib#X.Y.Z"
}
```

The published `dist/` folder is built on install via the `prepare` script, so consumers do not need to run rollup themselves.

### Peer dependencies

The consuming module supplies the modular d3 packages the library imports (so it controls the exact D3 version and the lib does not contribute to bundle duplication). The authoritative list, with version ranges, lives in `package.json` `peerDependencies`. The build keeps it in lockstep with the actual `src/` imports via `tests/build-config.test.js`. The Chart widgets section below lists per row the packages that the widget's own module imports, so the d3 packages imported by shared helpers and by `BaseWidget` are not repeated there.

## Public API

The package has no bare entrypoint. Import from one of its subpaths: `/infra` for the tree-chart infrastructure, `/linked-tree` for the render layer of the linked tree charts, `/widgets` for the chart widget toolkit and `/chart-core` for the page bootstrap helpers.

### `chart-core` subpath entrypoint

For page bootstrap code shared by pedigree/fan/descendants modules, use the dedicated subpath:

```javascript
import {
    DetailPanel,
    PanelSelection,
    Storage,
    buildChartAjaxUrl,
    syncCollapseToggle,
    setChartAjaxUrl,
    setChartOptionsGlobal,
} from "@magicsunday/webtrees-chart-lib/chart-core";
```

This entrypoint centralises URL/query assembly, collapse-state persistence, and
chart-options namespace publishing so module page-init scripts can share one implementation.

`DetailPanel` is the panel beside a chart that shows the facts and the image of the selected person. It is a
Bootstrap offcanvas without a backdrop, so the chart stays usable. It uses the `window.bootstrap.Offcanvas` of the
page and falls back to adding the class `show` to its element when the page has no Bootstrap. Without Bootstrap the
panel is a plain block that neither Escape nor a click beside it closes, and only `dismiss()` takes it away, which
hides it only if the page styles the element as hidden without the class `show`. The events
`show.bs.offcanvas` and `hide.bs.offcanvas` of the element must not be cancelled, because the panel counts on every
show and hide that it asks for. The panel mirrors the state of the offcanvas from the `hide`, `hidden` and `shown`
events, so a page listener that cancels `hide`, stops the propagation of these events before the panel sees them or
selects a person from within a `hide` listener brings the two out of step. That is a limit of the panel and not
supported. The page provides its markup, a root element with the parts `title`, `image`, `hint`,
`facts`, `empty`, `actions`, `individual` and `center` marked by `data-panel`, so all fixed texts are translated on the
server. The panel is built with `new DetailPanel(element, callbacks)` and the callbacks `onIndividual(url)`,
`onCenter(url)`, `onClose()` and `onHidden()`. `enable()` makes the element part of the page, `select(person, focus)`
shows a person and opens the panel, and `dismiss()` closes it without handing the focus back to the chart, for a page that has put the focus
somewhere else. That includes a close that is already running, which then loses its focus return. A person is an
object with `name`, `url`, `updateUrl`, `generation`, `thumbnail`, `silhouette` and `facts`, a list with the birth in
the first slot, the death in the second and every further fact after them, each an object with `label`, `date`,
`place`, `placeFull`, `value`, `partner` and `sortDay`, a number that is zero or absent when the date has no usable
day. The panel puts the facts in the order of time, with the birth first and the death
last, and a fact without a usable `sortDay` keeps its place. All text of a person is written with `textContent`.

The panel brings the shared part of its CSS with it, scoped to the class `webtrees-detail-panel`, which the markup of the panel carries besides the class of the module. That covers the round image, the facts list, the place text, the focus of the title and the shadow of the offcanvas including the right-to-left variant. The first panel that is built adds the rules to the head of the document as one `style` element with the attribute `data-webtrees-detail-panel-style`, no further panel adds another, and a document without a head is left alone. A module keeps only the rules that are specific to it.

`PanelSelection` keeps track of the person that the panel shows, for every chart that draws its persons as `g.person`
elements whose datum is a hierarchy node. It is built with `new PanelSelection(() => svg.visual)`, the function returns the
selection that holds the person elements or nothing before the first draw. `select(datum)` marks a person, `clear()`
removes the mark, `apply()` marks again after every draw, `restoreFocus()` hands the focus back to the selected person
and `makeOperable(element, person, activate)` makes a person element a focusable button that Enter and Space activate. The button is named with the text the element shows (the tspans of each `text` element make one line, a `title` does not count) and with the bare name only when those tspans hold no text, so call it after the text is drawn.
`apply()` marks the person by its xref, while `restoreFocus()` first looks for the element whose hierarchy node carries the
datum object that was handed to `select()`, which is the `data` of the node and not the node itself. That chooses the
right element when a person appears twice, provided each occurrence has a datum object of its own, because occurrences
that share one match the first element. When no element carries that object any more, as after a chart update that binds
new hierarchy nodes, the first element with the same xref takes the focus.

### `infra`, `linked-tree` and `widgets` subpath entrypoints

The package serves distinct consumer worlds. The tree-chart modules use the infrastructure (scaffolding, orientation, link geometry, text, colour and storage), the statistics module uses the widget toolkit. Each world has its own subpath, so a consumer imports only its half.

```javascript
import {
    ChartOverlay,
    ChartZoom,
    LINE_END_TRIM_PX,
    MARRIAGE_STAGGER_PX,
    Orientation,
    PngChartExport,
    Storage,
    SvgChartExport,
    SvgDefs,
    createChartExport,
    depthHsl,
    elbowsPath,
    familyBranchHsl,
    familyCenterHsl,
    hexToHsl,
    initHelpPopover,
    marriagePath,
    measureText,
    syncHelpMode,
    truncateNames,
    truncateToFit,
} from "@magicsunday/webtrees-chart-lib/infra";
```

The pedigree and descendants chart share one render layer. It holds the SVG host with zoom, defs, export and overlay events, the layout constants with the four orientations, the person image and text boxes, and the text and date renderers. The fan chart and the statistics module do not import it.

```javascript
import {
    DateRenderer,
    ImageBox,
    LAYOUT_BOTTOMTOP,
    LAYOUT_HORIZONTAL_NODE_HEIGHT,
    LAYOUT_HORIZONTAL_NODE_WIDTH,
    LAYOUT_LEFTRIGHT,
    LAYOUT_RIGHTLEFT,
    LAYOUT_TOPBOTTOM,
    LAYOUT_VERTICAL_NODE_HEIGHT,
    LAYOUT_VERTICAL_NODE_HEIGHT_OFFSET,
    LAYOUT_VERTICAL_NODE_WIDTH,
    LinkedTreeSvg,
    OrientationCollection,
    TextBox,
    TextRenderer,
} from "@magicsunday/webtrees-chart-lib/linked-tree";
```

```javascript
import {
    AreaDensity,
    BarChart,
    BoxPlot,
    ChordDiagram,
    DivergingBarChart,
    DonutChart,
    EventTimeline,
    GaugeArc,
    Heatmap,
    LineChart,
    MirrorHistogram,
    MonthRadial,
    NameBubbles,
    NameTimeline,
    NetworkGraph,
    SankeyFlow,
    SequenceChain,
    StackedBar,
    StreamGraph,
    Treemap,
    WorldMap,
} from "@magicsunday/webtrees-chart-lib/widgets";
```

### Chart scaffolding

| Export | Purpose |
|---|---|
| `ChartOverlay` | Fading hint message placed over the chart container (for example "hold Ctrl and scroll to zoom"), shown and hidden with `show()` and `hide()`. |
| `ChartZoom` | Configures a D3 zoom behaviour for the chart's visual group. Zooms with Ctrl+wheel or a two-finger pinch and pans by dragging, so normal page scrolling is preserved. The zoom range is bounded. |
| `initHelpPopover` | Wires the toolbar help button (`.btn-help`, pointing to its popover with `aria-controls`) to the popover. A click toggles it and mirrors the state in `aria-expanded`. Escape closes an open popover first, stops the event for the listeners that run after it, such as the detail panel, and returns the focus to the button. A click outside popover and button closes it without moving the focus. A second call replaces the listeners of the first, and the returned function removes them. It also adds the rules of the popover to the page once, scoped to the class `.help-popover` that the markup carries. The rules set a minimum width of 400 pixels, a maximum width and the stacking order, with both widths bound by the viewport. A page without a help button is left alone and gets no rules. |
| `syncHelpMode` | `syncHelpMode(inactiveMode)` shows the popover rows whose `data-help-mode` is `panel` while the checkbox `showDetailPanel` is checked, otherwise the rows named `inactiveMode`, and hides the others. Without the checkbox the markup stays as rendered. |
| `Orientation` | Layout shape and direction of a `d3.tree()` layout. `new Orientation(boxWidth, boxHeight, { vertical, flip })`: `vertical` is true for top-bottom and bottom-top, false for left-right and right-left, `flip` is true for bottom-top and right-left. The horizontal layouts follow the document direction. |
| `createChartExport` | Function that creates the export implementation for a file format (`png` / `svg`). |
| `PngChartExport` | Renders the live SVG into a PNG via canvas, at least A3 at 300 DPI. |
| `SvgChartExport` | Serialises the live SVG to a standalone `.svg` file (with the computed styles inlined, fonts are not embedded). |
| `SvgDefs` | Helper to attach `<defs>` elements (gradients, clipPaths, arrowhead markers) to a chart's root SVG. |

### Text & storage

| Export | Purpose |
|---|---|
| `measureText(text, fontFamily, fontSize, fontWeight)` | Returns the rendered pixel width of a text string for the given font, with an optional weight, using a lazily-created off-screen canvas. Reuses the canvas across calls. |
| `Storage` | Persists configuration form values to localStorage. Each field is registered by its element ID and restored on page load. |

### Color helpers

Hue/saturation/lightness primitives for coloring ancestor charts by family branch and generational depth. All functions work on HSL tuples (`[hue, saturation, lightness]`); use `hexToHsl()` to convert a user-picked hex color into the input form.

| Export | Purpose |
|---|---|
| `hexToHsl(hex)` | Converts a 6-digit hex string (e.g. `"#3b82b0"`, leading `#` optional) to an `[h, s, l]` tuple. Hue 0..360, S/L 0..100. Falls back to neutral grey `[0, 0, 50]` on invalid input. |
| `depthHsl(hue, baseHsl, depth, maxGenerations)` | Returns a CSS `hsl(...)` string for a given depth. The colour runs from a pale tint at the first generation toward the base colour at `maxGenerations`, the hue is taken from the caller (for example shifted by branch). `maxGenerations` (optional) controls how many steps the gradient spans. |
| `familyCenterHsl(baseHsl)` | Returns a CSS `hsl(...)` string for the proband's center box, one step beyond the most pastel depth-1 value so the root reads as the family root rather than a peer of generation 1. |
| `familyBranchHsl(baseHsl, depth, half, maxGenerations)` | Returns a CSS `hsl(...)` string for a branch box. `half` is the branch position in `0..1` within its paternal/maternal half. `0.5` is the half's center, `0` and `1` are its outer edges. Internally calls `depthHsl()` with a hue shifted by the branch position. |

### Chart widgets

Data-agnostic chart primitives consumed via `new Widget(target, options).draw(data)`. Widgets render the same `.chart-empty-state` placeholder when `draw([])` is called, so consumers do not need to guard against empty datasets. A widget whose default `emptyMessage` is empty (see its source) renders the placeholder without text. The exception is `WorldMap`, whose geometry is the primary signal: it keeps the map and paints every country in `emptyFill` instead. Redraw is idempotent in both directions (data → empty → data → empty).

| Export             | Purpose                                                                                                                                                                                                                                       | d3 modules imported by the widget module                                                       |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| `DonutChart`       | D3 donut with optional centre value + label. One `<path>` per slice, caller-controlled CSS class + inline fill. Sanitises non-finite / negative values; all-zero datasets fall through to empty-state.                                        | `d3-interpolate`, `d3-selection`, `d3-shape`, `d3-transition` |
| `WorldMap`         | D3-geo choropleth. Geojson is consumer-owned. Case-insensitive ISO-3166-1 alpha-2 country lookup; `accent` option tints rows per-view; renders geometry even when data is empty.                                                               | `d3-array`, `d3-geo`, `d3-interpolate`, `d3-scale`, `d3-scale-chromatic`, `d3-selection` |
| `BarChart`         | Vertical bar chart with 2-px minimum-height clamp on non-zero bars so a single low value stays clickable, plus a 1-px rounded stub on the baseline for zero-value bars.                                                                                | `d3-array`, `d3-axis`, `d3-brush`, `d3-interpolate`, `d3-path`, `d3-scale`, `d3-selection`, `d3-transition` |
| `LineChart`        | Single-/multi-series line chart, y-axis rendered as gridlines, colour delegated to CSS when themed (`.line-1`, `.line-2`, …).                                                                                                                  | `d3-array`, `d3-axis`, `d3-scale`, `d3-scale-chromatic`, `d3-selection`, `d3-shape`, `d3-transition` |
| `StackedBar`       | Multi-segment vertical bars with wrap-aware legend that reserves vertical band before overflow.                                                                                                                                                | `d3-array`, `d3-axis`, `d3-scale`, `d3-scale-chromatic`, `d3-selection`, `d3-shape`, `d3-transition` |
| `DivergingBarChart`| Diverging (two-sided) bar chart with `left`/`right` series across shared row categories with rounded outer-corner bars, an entrance animation, and an optional group picker (omitted for single-group data).                                       | `d3-array`, `d3-ease`, `d3-scale`, `d3-selection` |
| `ChordDiagram`     | Circular chord with caller-supplied tooltip value label.                                                                                                                                                                                       | `d3-chord`, `d3-scale`, `d3-scale-chromatic`, `d3-selection`, `d3-shape` |
| `SankeyFlow`       | Sankey flow diagram.                                                                                                                                                                                                                           | `d3-sankey`, `d3-scale`, `d3-scale-chromatic`, `d3-selection`, `d3-transition` |
| `StreamGraph`      | Stacked-area stream graph for trend visualisation over time.                                                                                                                                                                                   | `d3-array`, `d3-axis`, `d3-scale`, `d3-scale-chromatic`, `d3-selection`, `d3-shape`, `d3-transition` |
| `NameBubbles`      | Circle-pack name cloud with jittered spiral layout, chord-fit fonts, and vertically-centred label + count block.                                                                                                                               | `d3-ease`, `d3-selection`, `d3-transition` |
| `MonthRadial`      | 12-segment radial dial with centre-value text vertically centred via `dominant-baseline`.                                                                                                                                                      | `d3-path`, `d3-selection`, `d3-shape` |
| `MirrorHistogram`  | Two-sided histogram (top vs bottom) with nested g-groups and a shared axis strip.                                                                                                                                                              | `d3-array`, `d3-interpolate`, `d3-scale`, `d3-selection`, `d3-transition` |
| `GaugeArc`         | Stroked semicircle gauge.                                                                                                                                                                 | `d3-path`, `d3-selection` |
| `AreaDensity`      | Continuous-area density plot.                                                                                                                                                                                                                  | `d3-array`, `d3-axis`, `d3-scale`, `d3-selection`, `d3-shape`, `d3-transition` |
| `BoxPlot`          | Box-and-whisker plot for distributional summaries.                                                                                                                                                                                             | `d3-array`, `d3-axis`, `d3-scale`, `d3-selection` |
| `EventTimeline`    | Year-keyed dot timeline: magnitude-scaled dots on a linear year axis with the count printed inside each dot and round-year ticks below. Built for a sparse set of events across a wide span; per-dot year captions are omitted so close years never collide. | `d3-array`, `d3-axis`, `d3-scale`, `d3-selection`, `d3-transition` |
| `Heatmap`          | Rows × columns grid of count cells, each tinted by its value within a single `accent` hue against one shared value scale (peak cell across the whole matrix), so intensity is comparable everywhere. Fully generic `rows` / `cols` label arrays + `values[row][col]`. Zero cells keep a faint baseline tint and print no count. | `d3-array`, `d3-ease`, `d3-scale`, `d3-selection`                      |
| `Treemap`          | Squarified treemap of weighted items. Each leaf's area is proportional to its weight, with an optional aggregated "rest" tile for the long tail.                                                                                                              | `d3-hierarchy`, `d3-selection`                                         |
| `NameTimeline`     | Plain-HTML categorical timeline. One labelled row per item, each a stem running from the axis start to a dot placed on a shared horizontal value axis. HTML rather than SVG, so labels wrap natively and the layout stays responsive without a redraw. | none                                                                   |
| `NetworkGraph`     | Force-directed relationship graph with a deterministic seeded layout (identical input always lays out identically, so renders are stable and snapshotable). Hub and highlight-path emphasis, and a cap badge when the node set is truncated. | `d3-selection`                                                         |
| `SequenceChain`    | Plain-HTML horizontal sequence strip. A row of "bead" items joined by a small connector glyph, scrolling sideways on overflow. A DOM/CSS widget (the only SVG is the inline ring glyph), so the consumer's stylesheet owns all colour and shape.               | none                                                                   |

Shared options, exposed by every widget. A widget whose layout is fixed or derived from its content ignores `width` and `height`, see its source:

| Option         | Default | Effect                                                                                       |
|----------------|---------|----------------------------------------------------------------------------------------------|
| `width`        | from container, then the widget's default | An explicit width takes precedence over the container width, but a widget with a minimum width raises it to that minimum. Non-finite or non-positive values fall through to the container or default. |
| `height`       | from container, then the widget's default | An explicit height takes precedence over the container height. A widget may add space for its own parts, such as a legend. |
| `emptyMessage` | `"No data available"`, empty for some widgets | Text rendered into the `.chart-empty-state` placeholder for empty / null data and for data the widget treats as empty. |

Widget-specific options live in each widget's JSDoc / source comments; see the per-widget Jest spec under `tests/chart/widgets/*.test.js` for the canonical option contract.

## Usage example

```javascript
import { ChartZoom, ChartOverlay, createChartExport, Storage } from "@magicsunday/webtrees-chart-lib/infra";

// Persist the configuration form to localStorage
const storage = new Storage("my-chart-settings");
storage.register("generations");
storage.register("layout");

// Zoom the SVG visual group, and show a hint over the chart container
const zoom = new ChartZoom(svgVisual);
svgRoot.call(zoom.get());

const overlay = new ChartOverlay(container);
overlay.show("Hold Ctrl and scroll to zoom", 500);
overlay.hide(3000, 500);

// Wire the export button. A PNG is at least A3 at 300 DPI, so even a small chart
// is print quality.
exportButton.addEventListener("click", () => {
    const exporter = createChartExport(format);
    exporter.svgToImage(svgRoot, `my-chart.${format}`);
});
```

### Coloring an ancestor chart

```javascript
import { hexToHsl, familyCenterHsl, familyBranchHsl } from "@magicsunday/webtrees-chart-lib/infra";

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

See [AGENTS.md](AGENTS.md) for the development workflow: the gate, the public API rules, local linking with consumer modules, and the release flow.

Quick reference:

```shell
npm install
npm run ci:test             # full gate: config lockstep + biome ci + typecheck + jest, then cpd
npm run ci:test:js:config   # biome.json still extends the shared magicsunday/coding-standard base
npm test                    # jest only
npm run lint                # biome lint
npm run typecheck           # tsc --noEmit -p tsconfig.json (strict shared base)
npm run format:check        # biome format check
npm run cpd                 # jscpd duplicate detection
npm run build               # clears dist/, then rollup → dist/ (+ .d.ts via tsconfig.dts.json)
```

The Biome rules and the strict TypeScript base are not maintained here. `biome.json` and `tsconfig.json` extend the shared `magicsunday/coding-standard` base, and `npm run ci:test:js:config` fails when either stops extending or weakens it. The Node version is the one the CI workflow uses.

## Changelog

See [Releases](https://github.com/magicsunday/webtrees-chart-lib/releases) for per-version notes.

## License

GPL-3.0-or-later, see [LICENSE](LICENSE).
