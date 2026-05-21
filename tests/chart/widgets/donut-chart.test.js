import { afterEach, describe, expect, test } from "@jest/globals";

import DonutChart from "src/chart/widgets/donut-chart.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = [
    { label: "Male", value: 120, class: "male" },
    { label: "Female", value: 105, class: "female" },
    { label: "Unknown", value: 5, class: "unknown" },
];

const makeTarget = (id = "t", { width = 250, height = 250 } = {}) => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    const el = document.getElementById(id);
    Object.defineProperty(el, "clientWidth", { value: width });
    Object.defineProperty(el, "clientHeight", { value: height });
    return el;
};

describe("DonutChart — empty + error states", () => {
    test("draw([]) renders empty-state, no svg", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new DonutChart("#t", {}).draw(null);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("draw(undefined) renders empty-state instead of crashing", () => {
        makeTarget();
        new DonutChart("#t", {}).draw(undefined);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("draw with all-zero values renders empty-state", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: 0 },
            { label: "B", value: 0 },
        ]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage option surfaces in placeholder text", () => {
        makeTarget();
        new DonutChart("#t", { emptyMessage: "No data yet" }).draw([]);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe("No data yet");
    });
});

describe("DonutChart — slice rendering", () => {
    test("creates one path per slice", () => {
        makeTarget();
        new DonutChart("#t", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(3);
    });

    test("each slice carries the provided class prefix and class", () => {
        makeTarget();
        new DonutChart("#t", {}).draw(SAMPLE);
        const classes = Array.from(document.querySelectorAll("#t svg path")).map((p) =>
            p.getAttribute("class"),
        );
        expect(classes).toEqual(["slice male", "slice female", "slice unknown"]);
    });

    test("slice without explicit class falls back to bare 'slice'", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([{ label: "X", value: 5 }]);
        expect(document.querySelector("#t svg path").getAttribute("class")).toBe("slice");
    });

    test("no native <title> child on slice paths (tooltip handled by chart-lib overlay)", () => {
        makeTarget();
        new DonutChart("#t", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#t svg path title")).toHaveLength(0);
    });

    test("inline fill style set when option fill present, omitted otherwise", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: 5 },
            { label: "B", value: 5, fill: "#ff0" },
        ]);
        const paths = document.querySelectorAll("#t svg path");
        expect(paths[0].style.fill).toBe("");
        expect(paths[1].style.fill).toBe("#ff0");
    });

    test("redraw replaces previous svg, does not stack", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        w.draw(SAMPLE);
        w.draw([{ label: "A", value: 1 }]);
        expect(document.querySelectorAll("#t svg")).toHaveLength(1);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(1);
    });

    test("redraw from data → empty replaces svg with empty-state", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        w.draw(SAMPLE);
        w.draw([]);
        expect(document.querySelector("#t svg")).toBeNull();
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("redraw from empty → data replaces empty-state with svg", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        w.draw([]);
        w.draw(SAMPLE);
        expect(document.querySelectorAll("#t > .chart-empty-state")).toHaveLength(0);
        expect(document.querySelectorAll("#t svg")).toHaveLength(1);
    });
});

describe("DonutChart — value sanitization", () => {
    test("rows with null/undefined entries are skipped, not crashing", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([null, undefined, { label: "A", value: 5 }]);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(1);
    });

    test("rows with non-finite values are coerced to 0 and dropped", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: 5 },
            { label: "NaN", value: Number.NaN },
            { label: "Infinity", value: Number.POSITIVE_INFINITY },
            { label: "null", value: null },
            { label: "string", value: "5" },
        ]);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(1);
    });

    test("negative values are dropped, do not poison angles", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: 100 },
            { label: "B", value: -30 },
        ]);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(1);
    });

    test("entirely-non-finite dataset falls through to empty-state", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: Number.NaN },
            { label: "B", value: -1 },
        ]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("missing label is coerced to empty string, no crash", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([{ value: 5 }]);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(1);
    });
});

describe("DonutChart — fill", () => {
    test("fill is set as inline style (not attribute) so it beats CSS", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([{ label: "X", value: 5, fill: "#ff0" }]);
        const path = document.querySelector("#t svg path");
        expect(path.style.fill).toBe("#ff0");
        expect(path.hasAttribute("fill")).toBe(false);
    });
});

describe("DonutChart — sizing + options", () => {
    test("svg viewBox is square with side = min(width, height)", () => {
        const el = makeTarget("t", { width: 400, height: 200 });
        new DonutChart(el, {}).draw(SAMPLE);
        const svg = document.querySelector("#t svg");
        expect(svg.getAttribute("viewBox")).toBe("-100 -100 200 200");
        expect(svg.getAttribute("width")).toBe("200");
        expect(svg.getAttribute("height")).toBe("200");
    });

    test("holeSize option overrides default inner radius", () => {
        const el = makeTarget("t", { width: 200, height: 200 });
        const w = new DonutChart(el, { holeSize: 10 });
        w.draw(SAMPLE);
        expect(w._holeSize).toBe(10);
    });

    test("holeSize = 0 produces a pie (not donut) — explicit 0 honored", () => {
        const el = makeTarget("t", { width: 200, height: 200 });
        const w = new DonutChart(el, { holeSize: 0 });
        expect(w._holeSize).toBe(0);
    });

    test("margin option shrinks effective radius", () => {
        const el = makeTarget("t", { width: 200, height: 200 });
        const w = new DonutChart(el, { margin: 10 });
        expect(w._radius).toBe(90);
    });
});
