import { afterEach, describe, expect, test } from "@jest/globals";

import AreaDensity from "src/chart/widgets/area-density.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = [
    { x: 1, y: 5 },
    { x: 2, y: 45 },
    { x: 3, y: 38 },
    { x: 4, y: 22 },
    { x: 5, y: 8 },
];

const makeTarget = (id = "a") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("AreaDensity — empty states", () => {
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw([]);
        expect(document.querySelector("#a > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#a svg.wt-area-density")).toBeNull();
    });

    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw(null);
        expect(document.querySelector("#a > .chart-empty-state")).not.toBeNull();
    });

    test("single-row payload yields empty-state (need >= 2 for a curve)", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw([{ x: 1, y: 10 }]);
        expect(document.querySelector("#a > .chart-empty-state")).not.toBeNull();
    });

    test("all-zero y values fall through to empty-state", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw([
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            { x: 3, y: 0 },
        ]);
        expect(document.querySelector("#a > .chart-empty-state")).not.toBeNull();
    });

    test("non-numeric x values are filtered out, remaining < 2 → empty-state", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw([
            { x: "not a number", y: 5 },
            { x: 1, y: 5 },
        ]);
        expect(document.querySelector("#a > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new AreaDensity("#a", { emptyMessage: "keine Verteilung" }).draw([]);
        expect(document.querySelector("#a > .chart-empty-state").textContent).toBe(
            "keine Verteilung",
        );
    });
});

describe("AreaDensity — rendering", () => {
    test("renders one filled area path", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#a svg path.area")).toHaveLength(1);
    });

    test("default showLine:true also renders the line overlay", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw(SAMPLE);
        expect(document.querySelector("#a svg path.line")).not.toBeNull();
    });

    test("showLine:false drops the line overlay", () => {
        makeTarget();
        new AreaDensity("#a", { showLine: false }).draw(SAMPLE);
        expect(document.querySelector("#a svg path.line")).toBeNull();
        expect(document.querySelector("#a svg path.area")).not.toBeNull();
    });

    test("renders one hit-target circle per row for tooltips", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#a svg circle.point")).toHaveLength(SAMPLE.length);
    });

    test("aria-label encodes x and y per hit-target", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw(SAMPLE);
        const first = document.querySelector("#a svg circle.point");
        expect(first?.getAttribute("aria-label")).toBe("1: 5");
    });

    test("ariaLabel option lands on the host <svg>", () => {
        makeTarget();
        new AreaDensity("#a", { ariaLabel: "Sibling age gap density" }).draw(SAMPLE);
        expect(document.querySelector("#a svg.wt-area-density").getAttribute("aria-label")).toBe(
            "Sibling age gap density",
        );
    });

    test("xLabel option renders an x-axis label element", () => {
        makeTarget();
        new AreaDensity("#a", { xLabel: "years" }).draw(SAMPLE);
        expect(document.querySelector("#a svg .axis-label.x-label")?.textContent).toBe("years");
    });

    test("yLabel option renders a rotated y-axis label element", () => {
        makeTarget();
        new AreaDensity("#a", { yLabel: "count" }).draw(SAMPLE);
        expect(document.querySelector("#a svg .axis-label.y-label")?.textContent).toBe("count");
    });

    test("rows arrive sorted by x even if the caller passes unsorted data", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw([
            { x: 5, y: 8 },
            { x: 1, y: 5 },
            { x: 3, y: 38 },
        ]);
        const labels = Array.from(document.querySelectorAll("#a svg circle.point")).map((c) =>
            c.getAttribute("aria-label"),
        );
        expect(labels[0]).toBe("1: 5");
        expect(labels[1]).toBe("3: 38");
        expect(labels[2]).toBe("5: 8");
    });

    test("redraw replaces the prior svg rather than stacking", () => {
        makeTarget();
        const chart = new AreaDensity("#a", {});
        chart.draw(SAMPLE);
        chart.draw([
            { x: 1, y: 1 },
            { x: 2, y: 2 },
        ]);
        expect(document.querySelectorAll("#a svg.wt-area-density")).toHaveLength(1);
        expect(document.querySelectorAll("#a svg circle.point")).toHaveLength(2);
    });
});
