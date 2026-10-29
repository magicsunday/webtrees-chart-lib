/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import AreaDensity from "src/chart/widgets/area-density.js";
import BarChart from "src/chart/widgets/bar-chart.js";
import BoxPlot from "src/chart/widgets/box-plot.js";
import ChordDiagram from "src/chart/widgets/chord-diagram.js";
import DivergingBarChart from "src/chart/widgets/diverging-bar-chart.js";
import DonutChart from "src/chart/widgets/donut-chart.js";
import EventTimeline from "src/chart/widgets/event-timeline.js";
import GaugeArc from "src/chart/widgets/gauge-arc.js";
import Heatmap from "src/chart/widgets/heatmap.js";
import LineChart from "src/chart/widgets/line-chart.js";
import MirrorHistogram from "src/chart/widgets/mirror-histogram.js";
import NameBubbles from "src/chart/widgets/name-bubbles.js";
import NameTimeline from "src/chart/widgets/name-timeline.js";
import NetworkGraph from "src/chart/widgets/network-graph.js";
import SankeyFlow from "src/chart/widgets/sankey-flow.js";
import StackedBar from "src/chart/widgets/stacked-bar.js";
import StreamGraph from "src/chart/widgets/stream-graph.js";
import Treemap from "src/chart/widgets/treemap.js";

// Behaviour that BaseWidget owns and that base-widget.test.js pins on its own
// subclass. What only a real widget can show is that it calls the shared seam
// with its own constants: the fallback size, the minimum width, and the selector
// that clears its previous root on a redraw. Those constants are the table data
// below, one row per widget, so a new widget adds a row instead of a copy of
// each case.

const AREA_DENSITY_PAYLOAD = [
    { x: 1, y: 5 },
    { x: 2, y: 45 },
    { x: 3, y: 38 },
    { x: 4, y: 22 },
    { x: 5, y: 8 },
];

const BAR_CHART_PAYLOAD = [
    { label: "0-9", value: 4 },
    { label: "10-19", value: 8 },
    { label: "20-29", value: 12 },
    { label: "30-39", value: 7 },
];

const BOX_PLOT_PAYLOAD = [
    { category: "1900s", values: [45, 62, 67, 70, 75, 78, 82, 85, 90] },
    { category: "1950s", values: [55, 65, 68, 72, 76, 80, 84, 88, 92] },
    { category: "2000s", values: [60, 68, 72, 76, 80, 84, 88, 92, 96] },
];

const CHORD_DIAGRAM_PAYLOAD = {
    labels: ["Alpha", "Beta", "Gamma"],
    matrix: [
        [0, 5, 1],
        [5, 0, 2],
        [1, 2, 0],
    ],
};

const DIVERGING_BAR_CHART_PAYLOAD = {
    groups: ["19.", "20."],
    bands: ["0–9", "10–19", "20–29"],
    data: [
        // 19.
        [
            { left: 10, right: 8 },
            { left: 4, right: 3 },
            { left: 6, right: 9 },
        ],
        // 20.
        [
            { left: 20, right: 18 },
            { left: 2, right: 1 },
            { left: 5, right: 7 },
        ],
    ],
};

const EVENT_TIMELINE_PAYLOAD = [
    { year: 1828, value: 8 },
    { year: 1814, value: 3 },
    { year: 1816, value: 7 },
    { year: 1934, value: 8 },
];

const HEATMAP_PAYLOAD = {
    rows: ["R1", "R2"],
    cols: ["C1", "C2", "C3"],
    values: [
        [4, 0, 7],
        [2, 9, 1],
    ],
};

const LINE_CHART_PAYLOAD = {
    categories: ["1900s", "1910s", "1920s"],
    series: [{ name: "births", values: [12, 18, 22] }],
};

const MIRROR_HISTOGRAM_PAYLOAD = {
    top: [
        { label: "A", value: 10 },
        { label: "B", value: 4 },
        { label: "C", value: 0 },
    ],
    bottom: [
        { label: "A", value: 6 },
        { label: "B", value: 9 },
    ],
};

const NETWORK_GRAPH_PAYLOAD = {
    nodes: [
        { id: "a", label: "Alpha", group: "g1", href: "#/a" },
        { id: "b", label: "Beta", group: "g1", emphasis: true, href: "#/b" },
        { id: "c", label: "Gamma", group: "g2", href: "#/c" },
        { id: "d", label: "Delta", group: "g2", href: "#/d" },
        { id: "e", label: "Epsilon", group: "g3", href: "#/e" },
    ],
    links: [
        { source: "a", target: "b", highlighted: true },
        { source: "b", target: "c", highlighted: true },
        { source: "c", target: "d" },
        { source: "d", target: "e" },
    ],
    highlightPath: ["a", "b", "c"],
    hubId: "b",
    totalCount: 5,
    shownCount: 5,
};

const SANKEY_FLOW_PAYLOAD = {
    nodes: [{ name: "Farmer" }, { name: "Smith" }, { name: "Clerk" }],
    links: [
        { source: 0, target: 1, value: 8 },
        { source: 0, target: 2, value: 3 },
        { source: 1, target: 2, value: 2 },
    ],
};

const STACKED_BAR_PAYLOAD = {
    categories: ["1900s", "1910s", "1920s"],
    series: [
        { name: "20-29", data: [4, 5, 7] },
        { name: "30-39", data: [12, 14, 18] },
        { name: "40+", data: [3, 2, 9] },
    ],
};

const STREAM_GRAPH_PAYLOAD = {
    steps: [1900, 1910, 1920],
    names: ["Alpha", "Beta"],
    series: {
        Alpha: { 1900: 5, 1910: 8, 1920: 6 },
        Beta: { 1900: 3, 1910: 4, 1920: 9 },
    },
};

const TREEMAP_PAYLOAD = {
    items: [
        { rank: 1, members: 100, label: "Alpha" },
        { rank: 2, members: 30, label: "Beta" },
        { rank: 3, members: 10, label: "Gamma" },
    ],
    restMembers: 5,
};

const ROWS = [
    {
        name: "AreaDensity",
        Widget: AreaDensity,
        payload: AREA_DENSITY_PAYLOAD,
        fallbackViewBox: "0 0 600 200",
        svg: "svg.msc-area-density",
        floorWidth: 240,
        fallbackWidth: 600,
        emptyInputs: [null],
        rejectedInput: [{ x: 1, y: 5 }],
    },
    {
        name: "BarChart",
        Widget: BarChart,
        payload: BAR_CHART_PAYLOAD,
        fallbackViewBox: "0 0 600 240",
        svg: "svg.msc-bar-chart",
        floorWidth: 240,
        fallbackWidth: 600,
        emptyInputs: [null],
        rejectedInput: [{ label: "0-9", value: -1 }, null],
    },
    {
        name: "BoxPlot",
        Widget: BoxPlot,
        payload: BOX_PLOT_PAYLOAD,
        fallbackViewBox: "0 0 600 280",
        svg: "svg.msc-box-plot",
        floorWidth: 240,
        fallbackWidth: 600,
        emptyInputs: [null],
        rejectedInput: [{ category: "1900s", values: [] }],
    },
    {
        name: "ChordDiagram",
        Widget: ChordDiagram,
        payload: CHORD_DIAGRAM_PAYLOAD,
        fallbackViewBox: "0 0 600 600",
        svg: "svg.msc-chord-diagram",
        floorWidth: 240,
    },
    {
        name: "DivergingBarChart",
        Widget: DivergingBarChart,
        payload: DIVERGING_BAR_CHART_PAYLOAD,
        clearsRoot: "div.msc-diverging-bar-chart",
        redrawRoot: "div.msc-diverging-bar-chart",
        emptyInputs: [null],
        defaultEmptyMessage: "",
    },
    {
        name: "DonutChart",
        Widget: DonutChart,
        payload: undefined,
        emptyInputs: [null, undefined],
    },
    {
        name: "EventTimeline",
        Widget: EventTimeline,
        payload: EVENT_TIMELINE_PAYLOAD,
        fallbackViewBox: "0 0 600 130",
        svg: "svg.msc-event-timeline",
        floorWidth: 240,
        fallbackWidth: 600,
        emptyInputs: [undefined],
        rejectedInput: [{ year: 1900, value: 0 }],
    },
    {
        name: "GaugeArc",
        Widget: GaugeArc,
        payload: 0.5,
        clearsRoot: "svg.msc-gauge-arc",
        emptyInputs: [undefined],
        defaultEmptyMessage: "",
    },
    {
        name: "Heatmap",
        Widget: Heatmap,
        payload: HEATMAP_PAYLOAD,
        clearsRoot: "div.msc-heatmap",
        redrawRoot: "div.msc-heatmap",
    },
    {
        name: "LineChart",
        Widget: LineChart,
        payload: LINE_CHART_PAYLOAD,
        fallbackViewBox: "0 0 600 240",
        svg: "svg.msc-line-chart",
        floorWidth: 240,
        fallbackWidth: 600,
    },
    {
        name: "MirrorHistogram",
        Widget: MirrorHistogram,
        payload: MIRROR_HISTOGRAM_PAYLOAD,
        fallbackViewBox: "0 0 720 440",
        adoptsHostSize: true,
        clearsRoot: "svg.msc-mirror-histogram",
        redrawRoot: "svg.msc-mirror-histogram",
    },
    {
        name: "NameBubbles",
        Widget: NameBubbles,
        payload: [{ label: "Alpha", value: 3 }],
        emptyInputs: [null],
        defaultEmptyMessage: "",
    },
    {
        name: "NameTimeline",
        Widget: NameTimeline,
        payload: undefined,
        emptyInputs: [null],
    },
    {
        name: "NetworkGraph",
        Widget: NetworkGraph,
        payload: NETWORK_GRAPH_PAYLOAD,
        clearsRoot: "div.msc-network-graph-wrapper",
        redrawRoot: "div.msc-network-graph-wrapper",
        emptyInputs: [undefined],
        defaultEmptyMessage: "",
    },
    {
        name: "SankeyFlow",
        Widget: SankeyFlow,
        payload: SANKEY_FLOW_PAYLOAD,
        fallbackViewBox: "0 0 900 320",
        svg: "svg.msc-sankey-flow",
        floorWidth: 360,
        fallbackWidth: 900,
        redrawRoot: "svg.msc-sankey-flow",
        emptyInputs: [null],
        rejectedInput: {
            nodes: [{ name: "A" }, { name: "B" }],
            links: [
                { source: 0, target: 1, value: 1 },
                { source: 1, target: 0, value: 1 },
            ],
        },
    },
    {
        name: "StackedBar",
        Widget: StackedBar,
        payload: STACKED_BAR_PAYLOAD,
        fallbackViewBox: "0 0 600 280",
        svg: "svg.msc-stacked-bar",
        floorWidth: 240,
        fallbackWidth: 600,
    },
    {
        name: "StreamGraph",
        Widget: StreamGraph,
        payload: STREAM_GRAPH_PAYLOAD,
        fallbackViewBox: "0 0 900 240",
        svg: "svg.msc-stream-graph",
        floorWidth: 360,
        fallbackWidth: 900,
        redrawRoot: "svg.msc-stream-graph",
    },
    {
        name: "Treemap",
        Widget: Treemap,
        payload: TREEMAP_PAYLOAD,
        fallbackViewBox: "0 0 720 360",
        adoptsHostSize: true,
        clearsRoot: "div.msc-treemap",
        redrawRoot: "div.msc-treemap",
    },
];

const makeTarget = () => {
    document.body.innerHTML = '<div id="t"></div>';

    return document.getElementById("t");
};

const stubHost = (el, size) => {
    for (const [property, value] of Object.entries(size)) {
        Object.defineProperty(el, property, { value, configurable: true });
    }
};

const viewBoxOf = (selector) => document.querySelector(`#t ${selector}`).getAttribute("viewBox");

const rowsWith = (key) => ROWS.filter((row) => row[key] !== undefined);

// jsdom never lays out SVG text, so the text-fitting widgets need a length, and
// a reduced-motion host makes the entry animation jump to its final state
// instead of starting a d3 transition, which jsdom cannot run.
beforeEach(() => {
    window.SVGElement.prototype.getComputedTextLength = () => 0;
    window.matchMedia = (query) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
    });
});

afterEach(() => {
    document.body.innerHTML = "";
    window.matchMedia = undefined;
});

describe.each(rowsWith("fallbackViewBox"))("$name — detached host fallback", (row) => {
    test("a host that measures zero renders at the widget's own default size", () => {
        const el = makeTarget();
        new row.Widget(el, {}).draw(row.payload);

        expect(el.querySelector("svg").getAttribute("viewBox")).toBe(row.fallbackViewBox);
    });
});

describe.each(rowsWith("floorWidth"))("$name — minimum width", (row) => {
    test("a host narrower than the minimum renders at the minimum, not the fallback", () => {
        const el = makeTarget();
        stubHost(el, { clientWidth: 100 });
        new row.Widget(el, {}).draw(row.payload);

        expect(viewBoxOf(row.svg).split(" ")[2]).toBe(String(row.floorWidth));
    });
});

describe.each(rowsWith("fallbackWidth"))("$name — responsive height", (row) => {
    test("an unset height adopts the host height and keeps the fallback width", () => {
        const el = makeTarget();
        stubHost(el, { clientHeight: 321 });
        new row.Widget(el, {}).draw(row.payload);

        const viewBox = viewBoxOf(row.svg).split(" ");
        expect(viewBox[2]).toBe(String(row.fallbackWidth));
        expect(viewBox[3]).toBe("321");
    });
});

describe.each(rowsWith("adoptsHostSize"))("$name — host measurement", (row) => {
    test("an unmeasured size adopts the host element's measurement", () => {
        const el = makeTarget();
        stubHost(el, { clientWidth: 333, clientHeight: 222 });
        new row.Widget(el, {}).draw(row.payload);

        const viewBox = viewBoxOf("svg").split(" ");
        expect(viewBox[2]).toBe("333");
        expect(viewBox[3]).toBe("222");
    });
});

describe.each(rowsWith("clearsRoot"))("$name — redraw after an empty draw", (row) => {
    test("clears the empty-state placeholder and renders exactly one root", () => {
        makeTarget();
        const widget = new row.Widget("#t", {});
        widget.draw(null);
        widget.draw(row.payload);

        expect(document.querySelectorAll("#t > .chart-empty-state")).toHaveLength(0);
        expect(document.querySelectorAll(`#t > ${row.clearsRoot}`)).toHaveLength(1);
    });
});

describe.each(rowsWith("redrawRoot"))("$name — redraw idempotence", (row) => {
    test("a second draw replaces the prior root rather than stacking", () => {
        // Pins the selector the widget hands to _clearRoot: a wrong selector would
        // leave the first root in place and stack a second on a data to data redraw.
        makeTarget();
        const widget = new row.Widget("#t", {});
        widget.draw(row.payload);
        widget.draw(row.payload);

        expect(document.querySelectorAll(`#t > ${row.redrawRoot}`)).toHaveLength(1);
    });
});

describe.each(ROWS.flatMap((row) => (row.emptyInputs ?? []).map((input) => [row, input])))(
    "empty input",
    (row, input) => {
        test(`${row.name} renders the empty state for ${JSON.stringify(input) ?? "undefined"}`, () => {
            makeTarget();
            new row.Widget("#t", {}).draw(input);

            expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        });
    },
);

describe.each(rowsWith("rejectedInput"))("$name — later empty-state call site", (row) => {
    test("input that passes the first guard but yields nothing to draw shows the custom message", () => {
        // The first guard only sees a missing or empty payload. The later call
        // site covers what the widget rejects after sanitising or laying it out,
        // and it has to hand the same message to the placeholder.
        makeTarget();
        new row.Widget("#t", { emptyMessage: "Nothing to show" }).draw(row.rejectedInput);

        const placeholder = document.querySelector("#t > .chart-empty-state");
        expect(placeholder).not.toBeNull();
        expect(placeholder.textContent).toBe("Nothing to show");
        expect(document.querySelector("#t svg")).toBeNull();
    });
});

describe.each(rowsWith("emptyInputs"))("$name — default empty message", (row) => {
    test("an empty draw without an emptyMessage option shows the widget's own default", () => {
        makeTarget();
        new row.Widget("#t", {}).draw(row.emptyInputs[0]);

        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe(
            row.defaultEmptyMessage ?? "No data available",
        );
    });
});

describe.each(ROWS.map((row) => [row.name, row]))("%s — size validation", (_name, row) => {
    test.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY, "640", null])(
        "width and height clear the override for %p and keep a positive number",
        (bad) => {
            // The guard lives in BaseWidget. A widget that overrides a setter
            // without it would let an invalid value reach the layout.
            const widget = new row.Widget(makeTarget(), {});

            widget.width = bad;
            widget.height = bad;
            expect(widget.width).toBeUndefined();
            expect(widget.height).toBeUndefined();

            widget.width = 480;
            widget.height = 360;
            expect(widget.width).toBe(480);
            expect(widget.height).toBe(360);
        },
    );
});
