import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import AreaDensity from "src/chart/widgets/area-density.js";
import BarChart from "src/chart/widgets/bar-chart.js";
import BoxPlot from "src/chart/widgets/box-plot.js";
import ChordDiagram from "src/chart/widgets/chord-diagram.js";
import DivergingBarChart from "src/chart/widgets/diverging-bar-chart.js";
import DonutChart from "src/chart/widgets/donut-chart.js";
import EventTimeline from "src/chart/widgets/event-timeline.js";
import Heatmap from "src/chart/widgets/heatmap.js";
import LineChart from "src/chart/widgets/line-chart.js";
import MirrorHistogram from "src/chart/widgets/mirror-histogram.js";
import MonthRadial from "src/chart/widgets/month-radial.js";
import NetworkGraph from "src/chart/widgets/network-graph.js";
import SankeyFlow from "src/chart/widgets/sankey-flow.js";
import SequenceChain from "src/chart/widgets/sequence-chain.js";
import StackedBar from "src/chart/widgets/stacked-bar.js";
import StreamGraph from "src/chart/widgets/stream-graph.js";
import Treemap from "src/chart/widgets/treemap.js";
import WorldMap from "src/chart/widgets/world-map.js";

// The tooltip is the only innerHTML sink of the library. Every tooltip-bearing
// widget builds its markup through the escaping helpers, and this table feeds
// each of them hostile text in every field that can reach a tooltip, opens the
// tooltips the marks produce and asserts that the text arrives as plain text
// and creates no element of its own. A new widget with a tooltip adds a row.

const HOSTILE = "<img src=x onerror=alert(1)>";

// A second marker for tooltip text that takes its own escaping path.
const HOSTILE_SAMPLE = "<script>alert(2)</script>";

// The only elements the tooltip helpers emit. Anything else in a tooltip came
// from unescaped input.
const HELPER_TAGS = new Set(["STRONG", "SPAN", "BR"]);

const GEOJSON = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { iso_a2: "DE", name: HOSTILE },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [0, 0],
                        [1, 0],
                        [1, 1],
                        [0, 0],
                    ],
                ],
            },
        },
    ],
};

const ROWS = [
    {
        name: "AreaDensity",
        Widget: AreaDensity,
        payload: [
            { x: 1, y: 5, tooltipLabel: HOSTILE, tooltip: HOSTILE },
            { x: 2, y: 9 },
        ],
    },
    {
        name: "BarChart",
        Widget: BarChart,
        payload: [
            { label: HOSTILE, value: 4, tooltipLabel: HOSTILE, tooltip: HOSTILE },
            { label: "B", value: 8 },
        ],
    },
    {
        name: "BoxPlot",
        Widget: BoxPlot,
        payload: [{ category: HOSTILE, values: [45, 62, 67, 70, 75, 78], tooltipLabel: HOSTILE }],
    },
    {
        name: "ChordDiagram",
        Widget: ChordDiagram,
        payload: {
            labels: [HOSTILE, "Beta", "Gamma"],
            matrix: [
                [0, 5, 1],
                [5, 0, 2],
                [1, 2, 0],
            ],
        },
    },
    {
        name: "DivergingBarChart",
        Widget: DivergingBarChart,
        payload: {
            groups: [HOSTILE],
            bands: [HOSTILE, "B"],
            data: [
                [
                    { left: 10, right: 8 },
                    { left: 4, right: 3 },
                ],
            ],
        },
    },
    {
        name: "DonutChart",
        Widget: DonutChart,
        payload: [
            { label: HOSTILE, value: 3, tooltipLabel: HOSTILE, tooltipBody: HOSTILE },
            { label: "B", value: 5 },
        ],
    },
    {
        name: "EventTimeline",
        Widget: EventTimeline,
        payload: [
            { year: 1900, value: 3, tooltipLabel: HOSTILE, tooltip: HOSTILE },
            { year: 1910, value: 5 },
        ],
    },
    {
        name: "Heatmap",
        Widget: Heatmap,
        payload: { rows: [HOSTILE], cols: [HOSTILE, "C2"], values: [[4, 7]] },
    },
    {
        name: "LineChart",
        Widget: LineChart,
        payload: {
            categories: [HOSTILE, "B"],
            tooltipLabels: [HOSTILE, HOSTILE],
            series: [
                { name: HOSTILE, values: [12, 18], tooltips: [HOSTILE, HOSTILE] },
                { name: "S2", values: [4, 9] },
            ],
        },
    },
    {
        name: "MirrorHistogram",
        Widget: MirrorHistogram,
        payload: {
            top: [{ label: HOSTILE, value: 10 }],
            bottom: [{ label: HOSTILE, value: 6 }],
        },
    },
    {
        name: "MonthRadial",
        Widget: MonthRadial,
        payload: [
            { label: HOSTILE, value: 3, sub: HOSTILE, tooltipValue: HOSTILE },
            { label: "S2", value: 5 },
        ],
    },
    {
        name: "NetworkGraph",
        Widget: NetworkGraph,
        payload: {
            nodes: [
                { id: "a", label: HOSTILE, title: HOSTILE, group: "g1", href: "#/a" },
                { id: "b", label: HOSTILE, group: "g1", href: "#/b" },
            ],
            links: [{ source: "a", target: "b" }],
            highlightPath: [],
            hubId: "a",
            totalCount: 2,
            shownCount: 2,
        },
    },
    {
        name: "SankeyFlow",
        Widget: SankeyFlow,
        // The sample names of a link render in their own meta div and escape
        // through a path of their own, so they carry a marker of their own.
        extraTags: ["DIV"],
        markers: [HOSTILE, HOSTILE_SAMPLE],
        payload: {
            nodes: [{ name: HOSTILE }, { name: HOSTILE }, { name: "C" }],
            links: [
                { source: 0, target: 1, value: 8, samples: [{ name: HOSTILE_SAMPLE }] },
                { source: 1, target: 2, value: 3 },
            ],
        },
    },
    {
        name: "SequenceChain",
        Widget: SequenceChain,
        payload: {
            items: [{ id: "x", label: HOSTILE, sublabel: HOSTILE, href: "#/x", title: HOSTILE }],
        },
    },
    {
        name: "StackedBar",
        Widget: StackedBar,
        payload: {
            categories: [HOSTILE, "B"],
            tooltipLabels: [HOSTILE, HOSTILE],
            series: [
                { name: HOSTILE, data: [4, 5] },
                { name: "S2", data: [12, 14] },
            ],
        },
    },
    {
        name: "StreamGraph",
        Widget: StreamGraph,
        payload: {
            steps: [1900, 1910, 1920],
            names: [HOSTILE, "Beta"],
            series: {
                [HOSTILE]: { 1900: 5, 1910: 8, 1920: 6 },
                Beta: { 1900: 3, 1910: 4, 1920: 9 },
            },
        },
    },
    {
        name: "Treemap",
        Widget: Treemap,
        payload: {
            items: [
                { rank: 1, members: 100, label: HOSTILE },
                { rank: 2, members: 30, label: "Beta" },
            ],
            restMembers: 5,
        },
    },
    {
        name: "WorldMap",
        Widget: WorldMap,
        options: { geojson: GEOJSON },
        payload: [{ code: "DE", count: 3, label: HOSTILE }],
    },
];

const makeTarget = () => {
    document.body.innerHTML = '<div id="t"></div>';
    const el = document.getElementById("t");

    Object.defineProperty(el, "clientWidth", { value: 600, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });

    return el;
};

// jsdom never lays out SVG text, and a reduced-motion host makes the entry
// animation jump to its final state instead of starting a d3 transition.
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

/**
 * Opens the tooltip of every element in the widget, one at a time, and returns
 * the markup each of them produced. The widgets listen for mouseover or, for
 * the focusable beads and nodes, mouseenter, so both are dispatched.
 *
 * @param {Element} root
 *
 * @returns {string[]}
 */
const collectTooltips = (root) => {
    const tooltip = document.body.querySelector(".msc-chart-tooltip");
    const shown = new Set();

    for (const node of root.querySelectorAll("*")) {
        for (const type of ["mouseover", "mouseenter"]) {
            tooltip.classList.remove("is-visible");
            tooltip.innerHTML = "";
            node.dispatchEvent(new MouseEvent(type, { clientX: 20, clientY: 20 }));

            if (tooltip.classList.contains("is-visible") && tooltip.innerHTML !== "") {
                shown.add(tooltip.innerHTML);
            }
        }
    }

    return [...shown];
};

describe.each(ROWS)("$name hostile tooltip content", (row) => {
    test("every tooltip renders the hostile text as plain text and adds no element", () => {
        const el = makeTarget();
        new row.Widget(el, row.options ?? {}).draw(row.payload);

        const markups = collectTooltips(el);

        expect(markups.length).toBeGreaterThan(0);

        const allowedTags = new Set([...HELPER_TAGS, ...(row.extraTags ?? [])]);
        const texts = [];

        for (const markup of markups) {
            const holder = document.createElement("div");
            holder.innerHTML = markup;

            const foreign = [...holder.querySelectorAll("*")].filter(
                (node) => !allowedTags.has(node.tagName),
            );

            expect(foreign).toEqual([]);

            texts.push(holder.textContent);
        }

        // Every marker the row feeds in must arrive as text in some tooltip.
        for (const marker of row.markers ?? [HOSTILE]) {
            expect(texts.some((text) => text.includes(marker))).toBe(true);
        }
    });
});
