import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import AreaDensity from "src/chart/widgets/area-density.js";
import BarChart from "src/chart/widgets/bar-chart.js";
import BoxPlot from "src/chart/widgets/box-plot.js";
import ChordDiagram from "src/chart/widgets/chord-diagram.js";
import EventTimeline from "src/chart/widgets/event-timeline.js";
import LineChart from "src/chart/widgets/line-chart.js";
import SankeyFlow from "src/chart/widgets/sankey-flow.js";
import StackedBar from "src/chart/widgets/stacked-bar.js";
import StreamGraph from "src/chart/widgets/stream-graph.js";

// Reduced motion makes every entry animation jump to its final keyframe, so the
// marks exist synchronously under jsdom.
beforeEach(() => {
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

const WIDGETS = [
    [
        "AreaDensity",
        AreaDensity,
        [
            { x: 1, y: 5 },
            { x: 2, y: 45 },
            { x: 3, y: 38 },
        ],
    ],
    [
        "BarChart",
        BarChart,
        [
            { label: "0-9", value: 4 },
            { label: "10-19", value: 8 },
        ],
    ],
    [
        "BoxPlot",
        BoxPlot,
        [
            { category: "1900s", values: [45, 62, 67, 70, 75, 78, 82, 85, 90] },
            { category: "1950s", values: [55, 65, 68, 72, 76, 80, 84, 88, 92] },
        ],
    ],
    [
        "ChordDiagram",
        ChordDiagram,
        {
            labels: ["Alpha", "Beta", "Gamma"],
            matrix: [
                [0, 5, 1],
                [5, 0, 2],
                [1, 2, 0],
            ],
        },
    ],
    [
        "EventTimeline",
        EventTimeline,
        [
            { year: 1814, value: 3 },
            { year: 1828, value: 8 },
        ],
    ],
    [
        "LineChart",
        LineChart,
        {
            categories: ["1900s", "1910s", "1920s"],
            series: [{ name: "births", values: [12, 18, 22] }],
        },
    ],
    [
        "SankeyFlow",
        SankeyFlow,
        {
            nodes: [{ name: "Farmer" }, { name: "Smith" }, { name: "Clerk" }],
            links: [
                { source: 0, target: 1, value: 8 },
                { source: 0, target: 2, value: 3 },
                { source: 1, target: 2, value: 2 },
            ],
        },
    ],
    [
        "StackedBar",
        StackedBar,
        {
            categories: ["1900s", "1910s", "1920s"],
            series: [
                { name: "20-29", data: [4, 5, 7] },
                { name: "30-39", data: [12, 14, 18] },
            ],
        },
    ],
    [
        "StreamGraph",
        StreamGraph,
        {
            steps: [1900, 1910, 1920],
            names: ["Alpha", "Beta"],
            series: {
                Alpha: { 1900: 5, 1910: 8, 1920: 6 },
                Beta: { 1900: 3, 1910: 4, 1920: 9 },
            },
        },
    ],
];

describe("Widgets: focusable marks", () => {
    // ARIA allows aria-label only on an element that has a role, so a mark that
    // takes focus and announces a label needs one (the SVG root carries "img").
    test.each(WIDGETS)("%s gives every labelled focusable mark a role", (_name, Widget, data) => {
        document.body.innerHTML = '<div id="w" style="width: 600px; height: 300px;"></div>';
        new Widget("#w", {}).draw(data);

        const marks = [...document.querySelectorAll('#w svg [tabindex="0"][aria-label]')];

        expect(marks.length).toBeGreaterThan(0);
        expect(marks.filter((mark) => mark.getAttribute("role") === null)).toEqual([]);
    });
});
