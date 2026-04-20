[![Latest version](https://img.shields.io/github/v/release/magicsunday/webtrees-chart-lib?sort=semver)](https://github.com/magicsunday/webtrees-chart-lib/releases/latest)
[![License](https://img.shields.io/github/license/magicsunday/webtrees-chart-lib)](https://github.com/magicsunday/webtrees-chart-lib/blob/main/LICENSE)
[![CI](https://github.com/magicsunday/webtrees-chart-lib/actions/workflows/ci.yml/badge.svg)](https://github.com/magicsunday/webtrees-chart-lib/actions/workflows/ci.yml)

# @magicsunday/webtrees-chart-lib

Shared D3-based JavaScript chart library for the [magicsunday](https://github.com/magicsunday) family of [webtrees](https://www.webtrees.net) chart modules. Centralises SVG export, zoom behaviour, overlay rendering, text measurement, and localStorage form persistence so each chart module does not have to reimplement them.

This package ships no UI of its own — it is consumed as an npm dependency by:

- [webtrees-fan-chart](https://github.com/magicsunday/webtrees-fan-chart) — SVG ancestor fan chart
- [webtrees-pedigree-chart](https://github.com/magicsunday/webtrees-pedigree-chart) — SVG pedigree chart
- [webtrees-descendants-chart](https://github.com/magicsunday/webtrees-descendants-chart) — SVG descendants chart

## Installation

The package is distributed as a Git-URL npm dependency (not on the public npm registry). Pin to a tag in your `package.json`:

```json
"dependencies": {
    "@magicsunday/webtrees-chart-lib": "github:magicsunday/webtrees-chart-lib#v1.0.1"
}
```

The published `dist/` folder is built on install via the `prepare` script, so consumers do not need to run rollup themselves.

### Peer dependencies

```
d3-selection ^3.0
d3-transition ^3.0
d3-zoom ^3.0
```

These are kept as peer dependencies so the consuming module controls the exact D3 version and the lib does not contribute to bundle duplication.

## Public API

```javascript
import {
    ChartOverlay,
    ChartExport,
    ChartExportFactory,
    ChartZoom,
    PngChartExport,
    SvgChartExport,
    SvgDefs,
    measureText,
    Storage,
} from "@magicsunday/webtrees-chart-lib";
```

| Export | Purpose |
|---|---|
| `ChartOverlay` | SVG group helper — centres the chart inside its viewport, accepts pan/transform updates from `ChartZoom`. |
| `ChartZoom` | Configures a D3 zoom behaviour for the chart's visual group. Restricted to Ctrl+wheel + pinch (so normal page scrolling is preserved); zoom range 0.1× – 20×. |
| `ChartExport` | Base class for export implementations — handles the shared logic for serialising the live SVG and offering it as a download. |
| `ChartExportFactory` | Picks the right export implementation by file format (`png` / `svg`). |
| `PngChartExport` | Renders the live SVG into a PNG via canvas. |
| `SvgChartExport` | Serialises the live SVG to a standalone `.svg` file (with embedded styles + fonts). |
| `SvgDefs` | Helper to attach `<defs>` elements (gradients, clipPaths, arrowhead markers) to a chart's root SVG. |
| `measureText(text, font)` | Returns the rendered pixel width of a text string using a lazily-created off-screen canvas. Reuses the canvas across calls. |
| `Storage` | Persists configuration form values to localStorage. Each field is registered by its element ID and restored on page load. |

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

See the consumer modules (fan/pedigree/descendants chart) for full integrations.

## Development

See [AGENTS.md](AGENTS.md) for the full development workflow including local linking with consumer modules, the rollup build, the test suite, and the release flow.

Quick reference:

```shell
npm install
npm test                    # jest
npm run lint                # biome
npm run build               # rollup → dist/
```

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
