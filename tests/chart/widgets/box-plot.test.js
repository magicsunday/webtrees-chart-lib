import { afterEach, describe, expect, test } from "@jest/globals";

import BoxPlot from "src/chart/widgets/box-plot.js";
import { targetMaker } from "../../support/make-target.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = [
    { category: "1900s", values: [45, 62, 67, 70, 75, 78, 82, 85, 90] },
    { category: "1950s", values: [55, 65, 68, 72, 76, 80, 84, 88, 92] },
    { category: "2000s", values: [60, 68, 72, 76, 80, 84, 88, 92, 96] },
];

const makeTarget = targetMaker("b");

describe("BoxPlot — empty states", () => {
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw([]);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#b svg.msc-box-plot")).toBeNull();
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
});

// Every cohort is drawn through draw() and read back from the rendered chart, in
// the unit of the data. The value axis ticks give two anchors between a pixel
// row and a value, which maps every drawn element (box edges, median, whisker
// caps, outlier dots) back to a value without knowing the scale of the widget.
// The axis draws its ticks half a pixel off the exact row, so a value read back
// is compared with a tolerance of one pixel row.
const readCohort = () => {
    const ticks = [...document.querySelectorAll("#b g.msc-box-plot-y-axis--grid g.tick")].map(
        (tick) => ({
            value: Number(tick.querySelector("text")?.textContent?.replaceAll(",", "")),
            y: Number(
                /translate\([^,]+,\s*(-?[\d.]+)\)/.exec(tick.getAttribute("transform") ?? "")?.[1],
            ),
        }),
    );
    const [first, last] = [ticks[0], ticks[ticks.length - 1]];
    const valueAt = (y) =>
        first.value + ((y - first.y) * (last.value - first.value)) / (last.y - first.y);
    const attribute = (selector, name) =>
        Number(document.querySelector(selector)?.getAttribute(name));
    const boxTop = attribute("#b rect.msc-box-plot-box", "y");
    const boxHeight = attribute("#b rect.msc-box-plot-box", "height");

    return {
        pixel: Math.abs((last.value - first.value) / (last.y - first.y)),
        q1: valueAt(boxTop + boxHeight),
        q3: valueAt(boxTop),
        median: valueAt(
            Number(document.querySelector("#b text.msc-box-plot-median-value")?.getAttribute("y")),
        ),
        medianLabel: document.querySelector("#b text.msc-box-plot-median-value")?.textContent,
        whiskerLow: valueAt(attribute("#b line.msc-box-plot-whisker-cap--low", "y1")),
        whiskerHigh: valueAt(attribute("#b line.msc-box-plot-whisker-cap--high", "y1")),
        outliers: [...document.querySelectorAll("#b circle.msc-box-plot-outlier")]
            .map((dot) => valueAt(Number(dot.getAttribute("cy"))))
            .sort((a, b) => a - b),
    };
};

// The 1.5 times IQR rule makes a sample beyond a fence an outlier. A sample on or
// inside the fence ends a whisker. Cohorts with an end sample just inside and just
// beyond each fence, and one with samples exactly on both fences.
const COHORTS = [
    {
        name: "the textbook cohort 1 to 9",
        values: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        expected: { q1: 3, median: 5, q3: 7, whiskerLow: 1, whiskerHigh: 9, outliers: [] },
    },
    {
        name: "a far upper sample is an outlier",
        values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 100],
        expected: { whiskerLow: 1, whiskerHigh: 9, outliers: [100] },
    },
    {
        name: "samples inside the fence give no outlier",
        values: [10, 11, 12, 13, 14, 15],
        expected: { whiskerLow: 10, whiskerHigh: 15, outliers: [] },
    },
    {
        name: "a sample just inside the upper fence ends the whisker",
        values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 14.4],
        expected: { whiskerHigh: 14.4, outliers: [] },
    },
    {
        name: "a sample just inside the lower fence ends the whisker",
        values: [-4.4, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        expected: { whiskerLow: -4.4, outliers: [] },
    },
    {
        name: "a sample just beyond the lower fence is an outlier",
        values: [-4.6, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        expected: { whiskerLow: 1, outliers: [-4.6] },
    },
    {
        name: "a sample just beyond the upper fence is an outlier",
        values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 14.6],
        expected: { whiskerHigh: 9, outliers: [14.6] },
    },
    {
        name: "samples exactly on both fences end the whiskers",
        values: [-5, 10, 10, 10, 10, 20, 20, 20, 20, 35],
        expected: { q1: 10, q3: 20, whiskerLow: -5, whiskerHigh: 35, outliers: [] },
    },
];

describe("BoxPlot quartiles, whiskers and outliers as drawn", () => {
    test.each(COHORTS)("$name", ({ values, expected }) => {
        makeTarget();
        new BoxPlot("#b", { width: 600, height: 400 }).draw([{ category: "cohort", values }]);

        const drawn = readCohort();

        for (const [key, value] of Object.entries(expected)) {
            if (Array.isArray(value)) {
                expect(drawn[key]).toHaveLength(value.length);
                value.forEach((entry, index) => {
                    expect(Math.abs(drawn[key][index] - entry)).toBeLessThanOrEqual(drawn.pixel);
                });
            } else {
                expect(Math.abs(drawn[key] - value)).toBeLessThanOrEqual(drawn.pixel);
            }
        }
    });
});

describe("BoxPlot — fixed layout constants", () => {
    test("the boxes keep the fixed padding between the cohort bands", () => {
        makeTarget();
        new BoxPlot("#b", { width: 600, height: 300 }).draw(SAMPLE);

        const offsets = [...document.querySelectorAll("#b g.msc-box-plot-cohort")].map((cohort) =>
            Number(/translate\((-?[\d.]+)/.exec(cohort.getAttribute("transform") ?? "")?.[1]),
        );
        const boxWidth = Number(
            document.querySelector("#b rect.msc-box-plot-box")?.getAttribute("width"),
        );
        const [first, second] = /** @type {[number, number]} */ (offsets);

        // The box fills its band, so the band width over the step is 1 - padding.
        expect(offsets.length).toBeGreaterThan(1);
        expect(boxWidth / (second - first)).toBeCloseTo(1 - 0.3, 3);
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
});

describe("BoxPlot — tooltip composition (union: Median stat + P25/P75/n sub)", () => {
    test("the tooltip carries a Median __stat and a `P25 · P75 · n=` __sub", () => {
        makeTarget();
        new BoxPlot("#b", {}).draw(SAMPLE);
        document
            .querySelector("#b rect.msc-box-plot-hover-target")
            ?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const tip = document.querySelector(".msc-chart-tooltip");
        expect(tip.querySelector(".msc-chart-tooltip__stat").textContent).toContain("Median");
        const sub = tip.querySelector(".msc-chart-tooltip__sub").textContent;
        expect(sub).toContain("P25");
        expect(sub).toContain("P75");
        expect(sub).toContain("n=9");
    });
});

describe("BoxPlot — axis chrome", () => {
    test("both axes drop the baseline and keep their tick stubs", () => {
        // The value axis' tick lines ARE its gridlines (tickSize spans the
        // plot), and the category axis keeps its cohort stubs deliberately.
        makeTarget();
        new BoxPlot("#b", {}).draw(SAMPLE);

        for (const cls of ["msc-box-plot-x-axis", "msc-box-plot-y-axis"]) {
            const axis = document.querySelector(`#b svg g.${cls}`);
            expect(axis.querySelector("path.domain")).toBeNull();
            expect(axis.querySelectorAll(".tick line").length).toBeGreaterThan(0);
        }
    });
});
