/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "@jest/globals";
import * as chartCore from "src/chart-core.js";
import * as barrel from "src/index.js";
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
 * Extracts the identifiers listed in a README `import { … } from "<specifier>"`
 * block. AGENTS.md tells contributors that block is the complete public list and
 * is kept set-equal to the pinned surface — parsing it here makes that a gate
 * rather than a convention held up by review alone.
 *
 * @param {string} specifier The package specifier the block imports from.
 * @returns {string[]} The identifiers the block lists.
 */
function readmeImportBlock(specifier) {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    const blocks = [...readme.matchAll(/import \{\n([\s\S]*?)\n\} from "([^"]+)";/g)];
    const block = blocks.find((match) => match[2] === specifier);

    if (block === undefined) {
        throw new Error(`README has no import block for "${specifier}"`);
    }

    return block[1]
        .split("\n")
        .map((line) => line.trim().replace(/,$/, ""))
        .filter((line) => line !== "" && !line.startsWith("//"));
}

/**
 * The package entry point is a stability promise: every name here is API a
 * consumer may import, and the emitted `index.d.ts` re-exports each one as a
 * type too. Changing this list is a deliberate public-API change — internal
 * machinery must not leak back into the barrel, and a consumed export must not
 * silently disappear (a consumer's JSDoc `@import` type counts as consumed, so
 * dropping it breaks that consumer's `tsc --checkJs`). The list is verified
 * against the four consumer modules before anything is removed.
 */
const PUBLIC_SURFACE = [
    "AreaDensity",
    "BarChart",
    "BoxPlot",
    "ChartOverlay",
    "ChartZoom",
    "ChordDiagram",
    "DivergingBarChart",
    "DonutChart",
    "EventTimeline",
    "GaugeArc",
    "Heatmap",
    "LINE_END_TRIM_PX",
    "LineChart",
    "MARRIAGE_STAGGER_PX",
    "MirrorHistogram",
    "MonthRadial",
    "NameBubbles",
    "NameTimeline",
    "NetworkGraph",
    "Orientation",
    "OrientationBottomTop",
    "OrientationLeftRight",
    "OrientationRightLeft",
    "OrientationTopBottom",
    "PngChartExport",
    "SankeyFlow",
    "SequenceChain",
    "StackedBar",
    "Storage",
    "StreamGraph",
    "SvgChartExport",
    "SvgDefs",
    "Treemap",
    "WorldMap",
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
 * too. Pinning it matters most for the page-bootstrap helpers the main barrel
 * deliberately does not re-export: for those, this list is their only public
 * guarantee, and without it a removal would leave CI green and the README wrong.
 *
 * This list covers the VALUE exports only — `Object.keys()` on a module
 * namespace cannot see type-only exports. Unlike `index.js`, `chart-core.js`
 * also publishes JSDoc typedefs into its `.d.ts`, so those are pinned separately
 * below.
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
 * split into this list and `INFRA_SURFACE` below is what keeps the two
 * consumer worlds apart. The barrel is the union of both.
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

/** `./infra` is the tree-chart infrastructure: everything of the barrel that is not a widget. */
const INFRA_SURFACE = PUBLIC_SURFACE.filter((name) => !WIDGETS_SURFACE.includes(name));

/**
 * The JSDoc typedefs `chart-core.js` publishes as `export type` in its emitted
 * `.d.ts`. Renaming or dropping one changes a published type surface that a
 * consumer can `@import`, which no runtime assertion can observe. The barrel
 * carries no such list because `index.js` declares no typedefs of its own —
 * which is itself asserted below rather than merely assumed.
 */
const CHART_CORE_TYPE_SURFACE = ["QueryEntry", "QueryMode"];

describe("public barrel surface", () => {
    test("exports exactly the intended public API", () => {
        expect(Object.keys(barrel).sort()).toEqual([...PUBLIC_SURFACE].sort());
    });

    test("the chart-core subpath exports exactly its intended public API", () => {
        expect(Object.keys(chartCore).sort()).toEqual([...CHART_CORE_SURFACE].sort());
    });

    test("the chart-core subpath publishes exactly its intended type surface", () => {
        const typedefs = publishedTypedefs(readFileSync(join(ROOT, "src/chart-core.js"), "utf8"));

        expect(typedefs.sort()).toEqual([...CHART_CORE_TYPE_SURFACE].sort());
    });

    test("the infra and widgets subpaths export exactly their halves of the barrel", () => {
        expect(Object.keys(infra).sort()).toEqual([...INFRA_SURFACE].sort());
        expect(Object.keys(widgets).sort()).toEqual([...WIDGETS_SURFACE].sort());
        expect(WIDGETS_SURFACE.every((name) => PUBLIC_SURFACE.includes(name))).toBe(true);
    });

    test("the widgets subpath re-exports every widget module and the infra subpath none", () => {
        // Every module under src/chart/widgets except the base class is a widget.
        // The lists above would pass if a widget were added to the wrong half and
        // both lists were edited alike, so the halves are also checked by path.
        const widgetModules = readdirSync(join(ROOT, "src/chart/widgets"))
            .filter((file) => file.endsWith(".js") && file !== "base-widget.js")
            .map((file) => `./chart/widgets/${file}`)
            .sort();
        const reexported = (file) =>
            [
                ...readFileSync(join(ROOT, file), "utf8").matchAll(
                    /from "(\.\/chart\/widgets\/[^"]+)"/g,
                ),
            ]
                .map((match) => match[1])
                .sort();

        expect(reexported("src/widgets.js")).toEqual(widgetModules);
        expect(reexported("src/infra.js")).toEqual([]);
    });

    test("the infra and widgets subpaths publish no type surface of their own", () => {
        for (const file of ["src/infra.js", "src/widgets.js"]) {
            expect(publishedTypedefs(readFileSync(join(ROOT, file), "utf8"))).toEqual([]);
        }
    });

    test("the barrel publishes no type surface of its own", () => {
        // The reason `PUBLIC_SURFACE` needs no type counterpart: index.js is pure
        // re-exports. A single module-level typedef added here would become an
        // `export type` in index.d.ts that a consumer can `@import`, unpinned.
        expect(publishedTypedefs(readFileSync(join(ROOT, "src/index.js"), "utf8"))).toEqual([]);
    });

    test("the README import blocks list exactly the pinned surfaces", () => {
        expect(readmeImportBlock("@magicsunday/webtrees-chart-lib").sort()).toEqual(
            [...PUBLIC_SURFACE].sort(),
        );
        expect(readmeImportBlock("@magicsunday/webtrees-chart-lib/chart-core").sort()).toEqual(
            [...CHART_CORE_SURFACE].sort(),
        );
        expect(readmeImportBlock("@magicsunday/webtrees-chart-lib/infra").sort()).toEqual(
            [...INFRA_SURFACE].sort(),
        );
        expect(readmeImportBlock("@magicsunday/webtrees-chart-lib/widgets").sort()).toEqual(
            [...WIDGETS_SURFACE].sort(),
        );
    });
});
