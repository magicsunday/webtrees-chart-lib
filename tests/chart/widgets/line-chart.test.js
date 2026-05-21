import { afterEach, describe, expect, test } from "@jest/globals";

import LineChart from "src/chart/widgets/line-chart.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SINGLE_SAMPLE = [
    { label: "1900s", value: 12 },
    { label: "1910s", value: 18 },
    { label: "1920s", value: 22 },
];

const MULTI_SAMPLE = [
    {
        name: "Male",
        data: [
            { x: 1900, y: 65 },
            { x: 1910, y: 68 },
            { x: 1920, y: 71 },
        ],
    },
    {
        name: "Female",
        data: [
            { x: 1900, y: 70 },
            { x: 1910, y: 73 },
            { x: 1920, y: 75 },
        ],
    },
];

const makeTarget = (id = "l") => {
    document.body.innerHTML = `<div id="${id}" style="width: 600px; height: 240px;"></div>`;
    return document.getElementById(id);
};

describe("LineChart — single-series mode (existing contract)", () => {
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new LineChart("#l", {}).draw([]);
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#l svg.wt-line-chart")).toBeNull();
    });

    test("categorical rows render one path.line + one circle.point per row", () => {
        makeTarget();
        new LineChart("#l", {}).draw(SINGLE_SAMPLE);
        expect(document.querySelector("#l svg path.line")).not.toBeNull();
        expect(document.querySelectorAll("#l svg circle.point")).toHaveLength(SINGLE_SAMPLE.length);
    });

    test("svg does NOT carry the multi-series modifier class", () => {
        makeTarget();
        new LineChart("#l", {}).draw(SINGLE_SAMPLE);
        const cls = document.querySelector("#l svg.wt-line-chart")?.getAttribute("class") ?? "";
        expect(cls).not.toContain("wt-line-chart--multi");
    });
});

describe("LineChart — multi-series mode", () => {
    test("multi-series payload renders one path.line per series", () => {
        makeTarget();
        new LineChart("#l", {}).draw(MULTI_SAMPLE);
        expect(document.querySelectorAll("#l svg.wt-line-chart--multi path.line")).toHaveLength(2);
    });

    test("multi-series svg carries the modifier class", () => {
        makeTarget();
        new LineChart("#l", {}).draw(MULTI_SAMPLE);
        expect(document.querySelector("#l svg.wt-line-chart--multi")).not.toBeNull();
    });

    test("each series group is tagged with data-series-name", () => {
        makeTarget();
        new LineChart("#l", {}).draw(MULTI_SAMPLE);
        const names = Array.from(document.querySelectorAll("#l svg g.series")).map((g) =>
            g.getAttribute("data-series-name"),
        );
        expect(names).toEqual(["Male", "Female"]);
    });

    test("per-series class lands on the g.series group", () => {
        makeTarget();
        new LineChart("#l", {}).draw([
            { name: "M", class: "male", data: [{ x: 1, y: 1 }] },
            { name: "F", class: "female", data: [{ x: 1, y: 2 }] },
        ]);
        const groups = document.querySelectorAll("#l svg g.series");
        expect(groups[0].getAttribute("class")).toContain("male");
        expect(groups[1].getAttribute("class")).toContain("female");
    });

    test("aria-label per point encodes series name + x + y", () => {
        makeTarget();
        new LineChart("#l", {}).draw(MULTI_SAMPLE);
        const first = document.querySelector("#l svg circle.point");
        expect(first?.getAttribute("aria-label")).toBe("Male 1,900: 65");
    });

    test("renders a legend with one swatch+label per series", () => {
        makeTarget();
        new LineChart("#l", {}).draw(MULTI_SAMPLE);
        expect(document.querySelectorAll("#l svg .line-legend rect.legend-swatch")).toHaveLength(2);
        const labels = Array.from(
            document.querySelectorAll("#l svg .line-legend text.legend-label"),
        ).map((t) => t.textContent);
        expect(labels).toEqual(["Male", "Female"]);
    });

    test("redraw between single + multi modes replaces the prior svg", () => {
        makeTarget();
        const chart = new LineChart("#l", {});
        chart.draw(MULTI_SAMPLE);
        chart.draw(SINGLE_SAMPLE);
        expect(document.querySelectorAll("#l svg.wt-line-chart")).toHaveLength(1);
        expect(document.querySelector("#l svg.wt-line-chart--multi")).toBeNull();
    });

    test("empty multi-series payload (after filtering) falls through to empty-state", () => {
        makeTarget();
        new LineChart("#l", {}).draw([
            { name: "", data: [{ x: 1, y: 1 }] },
            { name: "valid", data: [] },
        ]);
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
    });

    test("multi-series payload sorts x values per series even if caller ships them unsorted", () => {
        makeTarget();
        new LineChart("#l", {}).draw([
            {
                name: "A",
                data: [
                    { x: 3, y: 30 },
                    { x: 1, y: 10 },
                    { x: 2, y: 20 },
                ],
            },
        ]);
        const points = Array.from(document.querySelectorAll("#l svg circle.point")).map((c) =>
            c.getAttribute("aria-label"),
        );
        expect(points[0]).toBe("A 1: 10");
        expect(points[1]).toBe("A 2: 20");
        expect(points[2]).toBe("A 3: 30");
    });
});
