import { afterEach, describe, expect, test } from "@jest/globals";

import CohortHeatmap from "src/chart/widgets/cohort-heatmap.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = [
    { label: "1900s", value: 0.0, weight: 60 },
    { label: "1910s", value: 0.05, weight: 80 },
    { label: "1920s", value: 0.0, weight: 90 },
    { label: "1930s", value: 0.18, weight: 70 },
];

const makeTarget = (id = "t", { width = 600, height = 96 } = {}) => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    const el = document.getElementById(id);
    Object.defineProperty(el, "clientWidth", { value: width });
    Object.defineProperty(el, "clientHeight", { value: height });
    return el;
};

describe("CohortHeatmap — empty + error states", () => {
    test("draw([]) renders empty-state, no svg", () => {
        makeTarget();
        new CohortHeatmap("#t", {}).draw([]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("draw(null) renders empty-state", () => {
        makeTarget();
        new CohortHeatmap("#t", {}).draw(null);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("draw(undefined) renders empty-state", () => {
        makeTarget();
        new CohortHeatmap("#t", {}).draw(undefined);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("data with only invalid rows renders empty-state", () => {
        makeTarget();
        new CohortHeatmap("#t", {}).draw([
            { label: "", value: 0.5 },
            null,
            42,
        ]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new CohortHeatmap("#t", { emptyMessage: "No cohorts" }).draw([]);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe("No cohorts");
    });
});

describe("CohortHeatmap — cell rendering", () => {
    test("creates one cell group per row", () => {
        makeTarget();
        new CohortHeatmap("#t", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#t svg g.cell").length).toBe(SAMPLE.length);
        expect(document.querySelectorAll("#t svg rect.cell-rect").length).toBe(SAMPLE.length);
    });

    test("each cell carries a text label with the cohort name", () => {
        makeTarget();
        new CohortHeatmap("#t", {}).draw(SAMPLE);
        const labels = Array.from(document.querySelectorAll("#t svg text.cell-label")).map(
            (n) => n.textContent,
        );
        expect(labels).toEqual(["1900s", "1910s", "1920s", "1930s"]);
    });

    test("aria-label on each cell encodes label + percent + sample count", () => {
        makeTarget();
        new CohortHeatmap("#t", {}).draw(SAMPLE);
        const ariaLabels = Array.from(document.querySelectorAll("#t svg rect.cell-rect")).map(
            (n) => n.getAttribute("aria-label"),
        );
        expect(ariaLabels).toEqual([
            "1900s: 0% (60 samples)",
            "1910s: 5% (80 samples)",
            "1920s: 0% (90 samples)",
            "1930s: 18% (70 samples)",
        ]);
    });
});

describe("CohortHeatmap — value normalisation", () => {
    test("negative value clamps to 0", () => {
        makeTarget();
        new CohortHeatmap("#t", {}).draw([{ label: "X", value: -0.5, weight: 10 }]);
        const aria = document.querySelector("#t svg rect.cell-rect").getAttribute("aria-label");
        expect(aria).toBe("X: 0% (10 samples)");
    });

    test("value > 1 clamps to 1", () => {
        makeTarget();
        new CohortHeatmap("#t", {}).draw([{ label: "X", value: 5, weight: 10 }]);
        const aria = document.querySelector("#t svg rect.cell-rect").getAttribute("aria-label");
        expect(aria).toBe("X: 100% (10 samples)");
    });

    test("missing weight defaults to 0 samples", () => {
        makeTarget();
        new CohortHeatmap("#t", {}).draw([{ label: "X", value: 0.42 }]);
        const aria = document.querySelector("#t svg rect.cell-rect").getAttribute("aria-label");
        expect(aria).toBe("X: 42% (0 samples)");
    });
});

describe("CohortHeatmap — idempotent redraw", () => {
    test("redraw replaces the previous svg, no stacking", () => {
        makeTarget();
        const widget = new CohortHeatmap("#t", {});
        widget.draw(SAMPLE);
        widget.draw(SAMPLE.slice(0, 2));
        expect(document.querySelectorAll("#t svg.wt-cohort-heatmap").length).toBe(1);
        expect(document.querySelectorAll("#t svg g.cell").length).toBe(2);
    });

    test("redraw from empty to data replaces the empty-state placeholder", () => {
        makeTarget();
        const widget = new CohortHeatmap("#t", {});
        widget.draw([]);
        widget.draw(SAMPLE);
        expect(document.querySelector("#t > .chart-empty-state")).toBeNull();
        expect(document.querySelector("#t svg.wt-cohort-heatmap")).not.toBeNull();
    });
});
