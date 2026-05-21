import { afterEach, describe, expect, test } from "@jest/globals";

import StackedBar from "src/chart/widgets/stacked-bar.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = {
    categories: ["1900s", "1910s", "1920s"],
    series: [
        { name: "20-29", data: [4, 5, 7] },
        { name: "30-39", data: [12, 14, 18] },
        { name: "40+", data: [3, 2, 9] },
    ],
};

const makeTarget = (id = "s") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("StackedBar — empty states", () => {
    test("draw(null) renders empty-state", () => {
        makeTarget();
        new StackedBar("#s", {}).draw(null);
        expect(document.querySelector("#s > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#s svg.wt-stacked-bar")).toBeNull();
    });

    test("missing categories yields empty-state", () => {
        makeTarget();
        new StackedBar("#s", {}).draw({ series: [{ name: "x", data: [1] }] });
        expect(document.querySelector("#s > .chart-empty-state")).not.toBeNull();
    });

    test("missing series yields empty-state", () => {
        makeTarget();
        new StackedBar("#s", {}).draw({ categories: ["a"] });
        expect(document.querySelector("#s > .chart-empty-state")).not.toBeNull();
    });

    test("all-zero data falls through to empty-state", () => {
        makeTarget();
        new StackedBar("#s", {}).draw({
            categories: ["a", "b"],
            series: [{ name: "x", data: [0, 0] }],
        });
        expect(document.querySelector("#s > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new StackedBar("#s", { emptyMessage: "kein Stack" }).draw(null);
        expect(document.querySelector("#s > .chart-empty-state").textContent).toBe("kein Stack");
    });
});

describe("StackedBar — rendering", () => {
    test("renders one segment per category × series", () => {
        makeTarget();
        new StackedBar("#s", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#s svg.wt-stacked-bar rect.segment")).toHaveLength(
            SAMPLE.categories.length * SAMPLE.series.length,
        );
    });

    test("groups carry one g.series per series in input order", () => {
        makeTarget();
        new StackedBar("#s", {}).draw(SAMPLE);
        const groups = document.querySelectorAll("#s svg g.series");
        expect(groups).toHaveLength(SAMPLE.series.length);
        expect(groups[0].getAttribute("data-series-name")).toBe("20-29");
        expect(groups[2].getAttribute("data-series-name")).toBe("40+");
    });

    test("per-series class lands on the g.series element", () => {
        makeTarget();
        new StackedBar("#s", {}).draw({
            categories: ["1900s"],
            series: [
                { name: "M", data: [4], class: "male" },
                { name: "F", data: [3], class: "female" },
            ],
        });
        const groups = document.querySelectorAll("#s svg g.series");
        expect(groups[0].getAttribute("class")).toContain("male");
        expect(groups[1].getAttribute("class")).toContain("female");
    });

    test("aria-label includes category + series + value", () => {
        makeTarget();
        new StackedBar("#s", {}).draw(SAMPLE);
        const first = document.querySelector("#s svg rect.segment");
        expect(first?.getAttribute("aria-label")).toBe("1900s / 20-29: 4");
    });

    test("ariaLabel option lands on the host <svg>", () => {
        makeTarget();
        new StackedBar("#s", { ariaLabel: "Divorces by age band" }).draw(SAMPLE);
        expect(document.querySelector("#s svg.wt-stacked-bar").getAttribute("aria-label")).toBe(
            "Divorces by age band",
        );
    });

    test("legend renders one swatch + label per series by default", () => {
        makeTarget();
        new StackedBar("#s", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#s svg .stack-legend rect.legend-swatch")).toHaveLength(
            SAMPLE.series.length,
        );
    });

    test("legend:false omits the legend group", () => {
        makeTarget();
        new StackedBar("#s", { legend: false }).draw(SAMPLE);
        expect(document.querySelector("#s svg .stack-legend")).toBeNull();
    });

    test("redraw replaces the prior svg rather than stacking", () => {
        makeTarget();
        const chart = new StackedBar("#s", {});
        chart.draw(SAMPLE);
        chart.draw({
            categories: ["only"],
            series: [{ name: "x", data: [1] }],
        });
        expect(document.querySelectorAll("#s svg.wt-stacked-bar")).toHaveLength(1);
        expect(document.querySelectorAll("#s svg rect.segment")).toHaveLength(1);
    });
});
