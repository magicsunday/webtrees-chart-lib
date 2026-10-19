/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "@jest/globals";
import * as chartCore from "src/chart-core.js";
import * as infra from "src/infra.js";
import * as widgets from "src/widgets.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Collects the type names a module publishes as `export type` in its emitted
 * declarations. Both `@typedef` and `@callback` are emitted that way, and the
 * type expression is optional because the brace-less `@typedef Name` +
 * `@property` spelling is published just the same.
 *
 * The scan reads column-0 docblocks. What TypeScript actually emits is "not
 * declared inside a function body" — a typedef in a function body is scope-local
 * and produces nothing (a live pattern in several widgets), which the column-0
 * rule excludes correctly. Two residual limits follow from the approximation and
 * both require pinning by hand if they ever arise:
 *   - a typedef in an INDENTED docblock on a class member is published too, so
 *     the pinned modules must stay class-free;
 *   - a type re-exported from another module (`export { SomeType } from "./x.js"`)
 *     is published but invisible to a scan of this file.
 *
 * @param {string} source The module source.
 * @returns {string[]} The published type names.
 */
function publishedTypedefs(source) {
    const blocks = source.match(/^\/\*\*[\s\S]*?\*\//gm) ?? [];

    return blocks.flatMap((block) =>
        [...block.matchAll(/@(?:typedef|callback)\s+(?:\{[\s\S]*?\}\s+)?(\w+)/g)].map(
            (match) => match[1],
        ),
    );
}

/**
 * `./infra` is the tree-chart infrastructure and a stability promise: every name
 * here is API a consumer may import, and the emitted `infra.d.ts` re-exports each
 * one as a type too. Changing this list is a deliberate public-API change, internal
 * machinery must not leak into the entrypoint, and a consumed export must not
 * silently disappear (a consumer's JSDoc `@import` type counts as consumed, so
 * dropping it breaks that consumer's `tsc --checkJs`). The list is verified
 * against the four consumer modules before anything is removed.
 */
const INFRA_SURFACE = [
    "ChartOverlay",
    "ChartZoom",
    "LINE_END_TRIM_PX",
    "MARRIAGE_STAGGER_PX",
    "Orientation",
    "PngChartExport",
    "Storage",
    "SvgChartExport",
    "SvgDefs",
    "createChartExport",
    "depthHsl",
    "elbowsPath",
    "familyBranchHsl",
    "familyCenterHsl",
    "hexToHsl",
    "marriagePath",
    "measureText",
    "truncateNames",
    "truncateToFit",
];

/**
 * `./chart-core` is one of the package's subpath entrypoints (`package.json`
 * `exports`, its own rollup input and `.d.ts`), imported directly by the
 * tree-chart modules' page-init code — so its surface is a stability promise
 * too. Pinning it matters most for the page-bootstrap helpers that only this
 * subpath exports: for those, this list is their only public guarantee, and
 * without it a removal would leave CI green.
 *
 * This list covers the VALUE exports only — `Object.keys()` on a module
 * namespace cannot see type-only exports. Unlike `infra.js` and `widgets.js`,
 * `chart-core.js` also publishes JSDoc typedefs into its `.d.ts`, so those are
 * pinned separately below.
 */
const CHART_CORE_SURFACE = [
    "Storage",
    "applyQueryEntry",
    "buildChartAjaxUrl",
    "setChartAjaxUrl",
    "setChartOptionsGlobal",
    "syncCollapseToggle",
];

/**
 * `./widgets` is the widget toolkit: every class that extends `BaseWidget`.
 * One consumer imports it and the tree-chart modules import none of it, so the
 * split into this list and `INFRA_SURFACE` above is what keeps the two
 * consumer worlds apart.
 */
const WIDGETS_SURFACE = [
    "AreaDensity",
    "BarChart",
    "BoxPlot",
    "ChordDiagram",
    "DivergingBarChart",
    "DonutChart",
    "EventTimeline",
    "GaugeArc",
    "Heatmap",
    "LineChart",
    "MirrorHistogram",
    "MonthRadial",
    "NameBubbles",
    "NameTimeline",
    "NetworkGraph",
    "SankeyFlow",
    "SequenceChain",
    "StackedBar",
    "StreamGraph",
    "Treemap",
    "WorldMap",
];

/**
 * The JSDoc typedefs `chart-core.js` publishes as `export type` in its emitted
 * `.d.ts`. Renaming or dropping one changes a published type surface that a
 * consumer can `@import`, which no runtime assertion can observe. `infra.js` and
 * `widgets.js` carry no such list because they declare no typedefs of their own —
 * which is itself asserted below rather than merely assumed.
 */
const CHART_CORE_TYPE_SURFACE = ["QueryEntry", "QueryMode"];

describe("public surface", () => {
    test("the chart-core subpath exports exactly its intended public API", () => {
        expect(Object.keys(chartCore).sort()).toEqual([...CHART_CORE_SURFACE].sort());
    });

    test("the chart-core subpath publishes exactly its intended type surface", () => {
        const typedefs = publishedTypedefs(readFileSync(join(ROOT, "src/chart-core.js"), "utf8"));

        expect(typedefs.sort()).toEqual([...CHART_CORE_TYPE_SURFACE].sort());
    });

    test("the infra and widgets subpaths export exactly their intended public API", () => {
        expect(Object.keys(infra).sort()).toEqual([...INFRA_SURFACE].sort());
        expect(Object.keys(widgets).sort()).toEqual([...WIDGETS_SURFACE].sort());
    });

    test("the infra and widgets subpaths publish no type surface of their own", () => {
        for (const file of ["src/infra.js", "src/widgets.js"]) {
            expect(publishedTypedefs(readFileSync(join(ROOT, file), "utf8"))).toEqual([]);
        }
    });
});
