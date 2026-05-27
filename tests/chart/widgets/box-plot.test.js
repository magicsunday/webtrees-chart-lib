import { afterEach, describe, expect, test } from "@jest/globals";

import BoxPlot from "src/chart/widgets/box-plot.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = [
    { category: "1900s", values: [45, 62, 67, 70, 75, 78, 82, 85, 90] },
    { category: "1950s", values: [55, 65, 68, 72, 76, 80, 84, 88, 92] },
    { category: "2000s", values: [60, 68, 72, 76, 80, 84, 88, 92, 96] },
];

const makeTarget = (id = "b") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("BoxPlot — empty states", () => {
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw([]);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#b svg.wt-box-plot")).toBeNull();
    });

    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw(null);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
    });

    test("missing-values rows fall through to empty-state", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw([{ category: "x" }]);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
    });

    test("empty-string category falls through to empty-state", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw([{ category: "", values: [1, 2, 3] }]);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new BoxPlot("#b", { emptyMessage: "keine Verteilung" }).draw([]);
        expect(document.querySelector("#b > .chart-empty-state").textContent).toBe(
            "keine Verteilung",
        );
    });
});

describe("BoxPlot — quartile computation", () => {
    test("median of [1..9] is 5 (textbook check)", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        const stats = chart._computeStats([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect(stats.median).toBe(5);
        expect(stats.q1).toBe(3);
        expect(stats.q3).toBe(7);
    });

    test("outlier classification — 100 is an outlier in [1..9, 100]", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        const stats = chart._computeStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
        expect(stats.outliers).toContain(100);
    });

    test("no outliers when all samples sit inside the 1.5×IQR fence", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        const stats = chart._computeStats([10, 11, 12, 13, 14, 15]);
        expect(stats.outliers).toHaveLength(0);
    });

    test("whisker low / high are the extreme in-fence samples", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        const stats = chart._computeStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
        expect(stats.whiskerLow).toBe(1);
        expect(stats.whiskerHigh).toBe(9);
    });
});

describe("BoxPlot — rendering", () => {
    test("renders one g.cohort per category", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#b svg.wt-box-plot g.cohort")).toHaveLength(
            SAMPLE.length,
        );
    });

    test("each cohort renders box, whisker, median and caps", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw(SAMPLE);
        for (const cohort of document.querySelectorAll("#b svg g.cohort")) {
            expect(cohort.querySelector("rect.box")).not.toBeNull();
            expect(cohort.querySelector("line.whisker")).not.toBeNull();
            expect(cohort.querySelector("line.median")).not.toBeNull();
            expect(cohort.querySelectorAll("line.whisker-cap")).toHaveLength(2);
        }
    });

    test("per-cohort class lands on the g.cohort", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw([
            { category: "M", values: [1, 2, 3, 4, 5], class: "male" },
            { category: "F", values: [10, 20, 30, 40, 50], class: "female" },
        ]);
        const groups = document.querySelectorAll("#b svg g.cohort");
        expect(groups[0].getAttribute("class")).toContain("male");
        expect(groups[1].getAttribute("class")).toContain("female");
    });

    test("outlier samples render as circle.outlier dots", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw([
            { category: "with-outlier", values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100] },
        ]);
        expect(document.querySelectorAll("#b svg circle.outlier")).toHaveLength(1);
    });

    test("ariaLabel option lands on the host <svg>", () => {
        makeTarget();
        new BoxPlot("#b", { ariaLabel: "Lifespan by century" }).draw(SAMPLE);
        expect(document.querySelector("#b svg.wt-box-plot").getAttribute("aria-label")).toBe(
            "Lifespan by century",
        );
    });

    test("horizontal orientation still renders the cohort count", () => {
        makeTarget();
        new BoxPlot("#b", { orientation: "horizontal" }).draw(SAMPLE);
        expect(document.querySelectorAll("#b svg g.cohort")).toHaveLength(SAMPLE.length);
    });

    test("redraw replaces prior svg rather than stacking", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        chart.draw(SAMPLE);
        chart.draw([{ category: "only", values: [1, 2, 3, 4, 5] }]);
        expect(document.querySelectorAll("#b svg.wt-box-plot")).toHaveLength(1);
        expect(document.querySelectorAll("#b svg g.cohort")).toHaveLength(1);
    });

    test("vertical cohort renders P25 and P75 hover guides", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw(SAMPLE);
        for (const cohort of document.querySelectorAll("#b svg g.cohort")) {
            expect(cohort.querySelector("line.box-guide--p25")).not.toBeNull();
            expect(cohort.querySelector("line.box-guide--p75")).not.toBeNull();
        }
    });

    test("each category tick carries an n=N sample-size sibling", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw(SAMPLE);
        const labels = document.querySelectorAll("#b svg .x-axis .tick text.sample-size");
        expect(labels).toHaveLength(SAMPLE.length);
        for (const label of labels) {
            expect(label.textContent).toMatch(/^n=\d+$/);
        }
    });

    test("tooltipLabel lands on the cohort aria-label when supplied", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw([
            {
                category: "18th",
                tooltipLabel: "18th Century",
                values: [40, 50, 55, 60, 65, 70, 75, 80, 85],
            },
        ]);
        const hover = document.querySelector("#b svg rect.hover-target");
        expect(hover.getAttribute("aria-label")).toContain("18th Century");
        expect(hover.getAttribute("aria-label")).not.toMatch(/^18th:/);
    });

    test("tooltipLabel falls back to category when omitted", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw([
            { category: "1900s", values: [40, 50, 55, 60, 65, 70, 75, 80, 85] },
        ]);
        const hover = document.querySelector("#b svg rect.hover-target");
        expect(hover.getAttribute("aria-label")).toContain("1900s");
    });

    test("median label wider than band collapses split into a single full line", () => {
        // Force the rendered glyph-fallback (~6 px per digit) to
        // exceed the per-cohort bandwidth: tiny chart width + many
        // cohorts + a 10-digit median push both cuts to clamp,
        // and the widget must fall back to one full-width line.
        makeTarget();
        const tightCohorts = Array.from({ length: 6 }, (_, i) => ({
            category: `c${i}`,
            values: [1_000_000_000, 1_000_000_000, 1_000_000_000],
        }));
        new BoxPlot("#b", { width: 240 }).draw(tightCohorts);
        for (const cohort of document.querySelectorAll("#b svg g.cohort")) {
            expect(cohort.querySelector("line.median--left")).toBeNull();
            expect(cohort.querySelector("line.median--right")).toBeNull();
            expect(cohort.querySelector("line.median")).not.toBeNull();
        }
    });
});
