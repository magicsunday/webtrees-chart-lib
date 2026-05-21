import { afterEach, describe, expect, test } from "@jest/globals";

import LineChart from "src/chart/widgets/line-chart.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SINGLE_SAMPLE = {
    categories: ["1900s", "1910s", "1920s"],
    series: [{ name: "births", values: [12, 18, 22] }],
};

const MULTI_SAMPLE = {
    categories: ["1900s", "1910s", "1920s"],
    series: [
        { name: "Male", values: [65, 68, 71] },
        { name: "Female", values: [70, 73, 75] },
    ],
};

const makeTarget = (id = "l") => {
    document.body.innerHTML = `<div id="${id}" style="width: 600px; height: 240px;"></div>`;
    return document.getElementById(id);
};

describe("LineChart — empty states", () => {
    test("draw(null) renders empty-state", () => {
        makeTarget();
        new LineChart("#l", {}).draw(null);
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#l svg.wt-line-chart")).toBeNull();
    });

    test("missing categories yields empty-state", () => {
        makeTarget();
        new LineChart("#l", {}).draw({ series: [{ name: "x", values: [1] }] });
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
    });

    test("missing series yields empty-state", () => {
        makeTarget();
        new LineChart("#l", {}).draw({ categories: ["a"] });
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
    });

    test("all-zero values fall through to empty-state", () => {
        makeTarget();
        new LineChart("#l", {}).draw({
            categories: ["a", "b"],
            series: [{ name: "x", values: [0, 0] }],
        });
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new LineChart("#l", { emptyMessage: "kein Trend" }).draw(null);
        expect(document.querySelector("#l > .chart-empty-state").textContent).toBe("kein Trend");
    });
});

describe("LineChart — single-series rendering", () => {
    test("renders one line path + one g.series for the single series", () => {
        makeTarget();
        new LineChart("#l", {}).draw(SINGLE_SAMPLE);
        expect(document.querySelectorAll("#l svg path.line")).toHaveLength(1);
        expect(document.querySelectorAll("#l svg g.series")).toHaveLength(1);
    });

    test("renders one circle.point per category", () => {
        makeTarget();
        new LineChart("#l", {}).draw(SINGLE_SAMPLE);
        expect(document.querySelectorAll("#l svg circle.point")).toHaveLength(
            SINGLE_SAMPLE.categories.length,
        );
    });

    test("single-series gets the area fill by default", () => {
        makeTarget();
        new LineChart("#l", {}).draw(SINGLE_SAMPLE);
        expect(document.querySelector("#l svg path.area")).not.toBeNull();
    });

    test("showArea:false suppresses the area fill", () => {
        makeTarget();
        new LineChart("#l", { showArea: false }).draw(SINGLE_SAMPLE);
        expect(document.querySelector("#l svg path.area")).toBeNull();
    });

    test("single-series does NOT carry the multi-series modifier class", () => {
        makeTarget();
        new LineChart("#l", {}).draw(SINGLE_SAMPLE);
        const cls = document.querySelector("#l svg.wt-line-chart")?.getAttribute("class") ?? "";
        expect(cls).not.toContain("wt-line-chart--multi");
    });

    test("single-series does NOT render a legend strip", () => {
        makeTarget();
        new LineChart("#l", {}).draw(SINGLE_SAMPLE);
        expect(document.querySelector("#l svg .line-legend")).toBeNull();
    });
});

describe("LineChart — multi-series rendering", () => {
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

    test("multi-series suppresses the area fill", () => {
        makeTarget();
        new LineChart("#l", {}).draw(MULTI_SAMPLE);
        expect(document.querySelector("#l svg path.area")).toBeNull();
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
        new LineChart("#l", {}).draw({
            categories: ["1900s"],
            series: [
                { name: "M", class: "male", values: [1] },
                { name: "F", class: "female", values: [2] },
            ],
        });
        const groups = document.querySelectorAll("#l svg g.series");
        expect(groups[0].getAttribute("class")).toContain("male");
        expect(groups[1].getAttribute("class")).toContain("female");
    });

    test("aria-label per point encodes category + value", () => {
        makeTarget();
        new LineChart("#l", {}).draw(MULTI_SAMPLE);
        const first = document.querySelector("#l svg circle.point");
        expect(first?.getAttribute("aria-label")).toBe("1900s: 65");
    });

    test("multi-series renders a legend with one swatch+label per series", () => {
        makeTarget();
        new LineChart("#l", {}).draw(MULTI_SAMPLE);
        expect(document.querySelectorAll("#l svg .line-legend rect.legend-swatch")).toHaveLength(2);
        const labels = Array.from(
            document.querySelectorAll("#l svg .line-legend text.legend-label"),
        ).map((t) => t.textContent);
        expect(labels).toEqual(["Male", "Female"]);
    });
});

describe("LineChart — redraw + edge cases", () => {
    test("redraw between single + multi modes replaces the prior svg", () => {
        makeTarget();
        const chart = new LineChart("#l", {});
        chart.draw(MULTI_SAMPLE);
        chart.draw(SINGLE_SAMPLE);
        expect(document.querySelectorAll("#l svg.wt-line-chart")).toHaveLength(1);
        expect(document.querySelector("#l svg.wt-line-chart--multi")).toBeNull();
    });

    test("empty-name series are filtered out before render", () => {
        makeTarget();
        new LineChart("#l", {}).draw({
            categories: ["a", "b"],
            series: [
                { name: "", values: [1, 2] },
                { name: "valid", values: [3, 4] },
            ],
        });
        expect(document.querySelectorAll("#l svg g.series")).toHaveLength(1);
        expect(document.querySelector("#l svg g.series")?.getAttribute("data-series-name")).toBe(
            "valid",
        );
    });

    test("missing trailing values default to zero", () => {
        makeTarget();
        new LineChart("#l", {}).draw({
            categories: ["a", "b", "c", "d"],
            series: [{ name: "short", values: [1, 2] }],
        });
        const points = Array.from(document.querySelectorAll("#l svg circle.point")).map((c) =>
            c.getAttribute("aria-label"),
        );
        expect(points).toEqual(["a: 1", "b: 2", "c: 0", "d: 0"]);
    });
});
