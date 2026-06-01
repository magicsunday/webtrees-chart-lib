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
        expect(document.querySelector("#b svg.msc-box-plot")).toBeNull();
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
    test("renders one g.msc-box-plot-cohort per category", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#b svg.msc-box-plot g.msc-box-plot-cohort")).toHaveLength(
            SAMPLE.length,
        );
    });

    test("each cohort renders box, whisker, median and caps", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw(SAMPLE);
        for (const cohort of document.querySelectorAll("#b svg g.msc-box-plot-cohort")) {
            expect(cohort.querySelector("rect.msc-box-plot-box")).not.toBeNull();
            expect(cohort.querySelector("line.msc-box-plot-whisker")).not.toBeNull();
            expect(cohort.querySelector("line.msc-box-plot-median")).not.toBeNull();
            expect(cohort.querySelectorAll("line.msc-box-plot-whisker-cap")).toHaveLength(2);
        }
    });

    test("per-cohort class lands on the g.msc-box-plot-cohort", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw([
            { category: "M", values: [1, 2, 3, 4, 5], class: "male" },
            { category: "F", values: [10, 20, 30, 40, 50], class: "female" },
        ]);
        const groups = document.querySelectorAll("#b svg g.msc-box-plot-cohort");
        expect(groups[0].getAttribute("class")).toContain("male");
        expect(groups[1].getAttribute("class")).toContain("female");
    });

    test("outlier samples render as circle.msc-box-plot-outlier dots", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw([
            { category: "with-outlier", values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100] },
        ]);
        expect(document.querySelectorAll("#b svg circle.msc-box-plot-outlier")).toHaveLength(1);
    });

    test("ariaLabel option lands on the host <svg>", () => {
        makeTarget();
        new BoxPlot("#b", { ariaLabel: "Lifespan by century" }).draw(SAMPLE);
        expect(document.querySelector("#b svg.msc-box-plot").getAttribute("aria-label")).toBe(
            "Lifespan by century",
        );
    });

    test("horizontal orientation still renders the cohort count", () => {
        makeTarget();
        new BoxPlot("#b", { orientation: "horizontal" }).draw(SAMPLE);
        expect(document.querySelectorAll("#b svg g.msc-box-plot-cohort")).toHaveLength(
            SAMPLE.length,
        );
    });

    test("redraw replaces prior svg rather than stacking", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        chart.draw(SAMPLE);
        chart.draw([{ category: "only", values: [1, 2, 3, 4, 5] }]);
        expect(document.querySelectorAll("#b svg.msc-box-plot")).toHaveLength(1);
        expect(document.querySelectorAll("#b svg g.msc-box-plot-cohort")).toHaveLength(1);
    });

    test("vertical cohort renders P25 and P75 hover guides", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw(SAMPLE);
        for (const cohort of document.querySelectorAll("#b svg g.msc-box-plot-cohort")) {
            expect(cohort.querySelector("line.msc-box-plot-box-guide--p25")).not.toBeNull();
            expect(cohort.querySelector("line.msc-box-plot-box-guide--p75")).not.toBeNull();
        }
    });

    test("each category tick carries an n=N sample-size sibling", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw(SAMPLE);
        const labels = document.querySelectorAll(
            "#b svg .msc-box-plot-x-axis .tick text.msc-box-plot-sample-size",
        );
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
        const hover = document.querySelector("#b svg rect.msc-box-plot-hover-target");
        expect(hover.getAttribute("aria-label")).toContain("18th Century");
        expect(hover.getAttribute("aria-label")).not.toMatch(/^18th:/);
    });

    test("tooltipLabel falls back to category when omitted", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw([
            { category: "1900s", values: [40, 50, 55, 60, 65, 70, 75, 80, 85] },
        ]);
        const hover = document.querySelector("#b svg rect.msc-box-plot-hover-target");
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
        for (const cohort of document.querySelectorAll("#b svg g.msc-box-plot-cohort")) {
            expect(cohort.querySelector("line.msc-box-plot-median--left")).toBeNull();
            expect(cohort.querySelector("line.msc-box-plot-median--right")).toBeNull();
            expect(cohort.querySelector("line.msc-box-plot-median")).not.toBeNull();
        }
    });
});

describe("BoxPlot — native get/set accessors", () => {
    test("getters read back constructor-supplied options", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {
            height: 400,
            width: 720,
            margin: { left: 60 },
            orientation: "horizontal",
            boxPadding: 0.5,
            whiskerMultiplier: 2,
            ariaLabel: "Lifespan distribution",
            emptyMessage: "no data here",
        });
        expect(chart.height).toBe(400);
        expect(chart.width).toBe(720);
        expect(chart.margin.left).toBe(60);
        expect(chart.orientation).toBe("horizontal");
        expect(chart.boxPadding).toBe(0.5);
        expect(chart.whiskerMultiplier).toBe(2);
        expect(chart.ariaLabel).toBe("Lifespan distribution");
        expect(chart.emptyMessage).toBe("no data here");
    });

    test("getters fall back to defaults when options are omitted", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        expect(chart.height).toBeUndefined();
        expect(chart.width).toBeUndefined();
        expect(chart.margin).toEqual({ top: 12, right: 24, bottom: 32, left: 48 });
        expect(chart.orientation).toBe("vertical");
        expect(chart.boxPadding).toBe(0.3);
        expect(chart.whiskerMultiplier).toBe(1.5);
        expect(chart.ariaLabel).toBe("Box plot chart");
        expect(chart.emptyMessage).toBe("No data available");
    });

    test("margin setter merges a partial object over the defaults", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        chart.margin = { right: 99 };
        expect(chart.margin).toEqual({ top: 12, right: 99, bottom: 32, left: 48 });
    });

    test("orientation enum setter defaults on an invalid value", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        chart.orientation = /** @type {any} */ ("diagonal");
        expect(chart.orientation).toBe("vertical");
        chart.orientation = "horizontal";
        expect(chart.orientation).toBe("horizontal");
    });

    test("tolerant setters reset invalid values to their defaults", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        chart.height = /** @type {any} */ ("tall");
        expect(chart.height).toBeUndefined();
        chart.height = /** @type {any} */ (-10);
        expect(chart.height).toBeUndefined();
        chart.width = /** @type {any} */ (-5);
        expect(chart.width).toBeUndefined();
        chart.boxPadding = /** @type {any} */ ("wide");
        expect(chart.boxPadding).toBe(0.3);
        chart.whiskerMultiplier = /** @type {any} */ (0);
        expect(chart.whiskerMultiplier).toBe(1.5);
        chart.ariaLabel = /** @type {any} */ (42);
        expect(chart.ariaLabel).toBe("Box plot chart");
        chart.emptyMessage = /** @type {any} */ (null);
        expect(chart.emptyMessage).toBe("No data available");
    });

    test("boxPadding setter clamps out-of-range fractions", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        chart.boxPadding = 5;
        expect(chart.boxPadding).toBe(0.95);
        chart.boxPadding = -1;
        expect(chart.boxPadding).toBe(0);
    });

    test("setters drive draw output — orientation switch via accessor", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        chart.orientation = "horizontal";
        chart.draw(SAMPLE);
        expect(document.querySelector("#b svg .msc-box-plot-y-axis")).not.toBeNull();
        expect(document.querySelectorAll("#b svg g.msc-box-plot-cohort")).toHaveLength(
            SAMPLE.length,
        );
    });

    test("emptyMessage accessor surfaces in the placeholder", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        chart.emptyMessage = "keine Verteilung";
        chart.draw([]);
        expect(document.querySelector("#b > .chart-empty-state").textContent).toBe(
            "keine Verteilung",
        );
    });

    test("dispatcher Object.entries → widget[k]=v applies a config bundle", () => {
        makeTarget();
        const chart = new BoxPlot("#b", {});
        const config = {
            height: 360,
            orientation: "horizontal",
            boxPadding: 0.4,
            whiskerMultiplier: 3,
            ariaLabel: "Dispatched chart",
        };
        for (const [key, value] of Object.entries(config)) {
            /** @type {any} */ (chart)[key] = value;
        }
        expect(chart.height).toBe(360);
        expect(chart.orientation).toBe("horizontal");
        expect(chart.boxPadding).toBe(0.4);
        expect(chart.whiskerMultiplier).toBe(3);
        expect(chart.ariaLabel).toBe("Dispatched chart");
    });
});
