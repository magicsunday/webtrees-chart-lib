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

describe("LineChart — multiSeriesArea opt-in", () => {
    test("multiSeriesArea:true renders one path.area per series in multi-series mode", () => {
        // Opt-in adds a layered area fill underneath each line; without
        // the flag the multi-series branch suppresses areas so adjacent
        // lines stay readable.
        makeTarget();
        new LineChart("#l", { multiSeriesArea: true }).draw(MULTI_SAMPLE);
        expect(document.querySelectorAll("#l svg path.area")).toHaveLength(2);
    });

    test("single-series area-fill leaves style.fill empty so CSS owns the colour", () => {
        // resolveSeriesColour branch 1: !isMultiSeries → null. The
        // refactor routes single-series area-fill through the same
        // helper now, so the inline-style contract must stay
        // unchanged for the default single-series path.
        makeTarget();
        new LineChart("#l", {}).draw(SINGLE_SAMPLE);
        const area = document.querySelector("#l svg g.series path.area");
        expect(area).not.toBeNull();
        expect(area?.style.fill).toBe("");
    });

    test("showArea:false overrides multiSeriesArea:true", () => {
        // The global kill-switch wins — a consumer that wants a
        // line-only multi-series chart can pass showArea:false
        // even after enabling multiSeriesArea, and no area paths
        // render.
        makeTarget();
        new LineChart("#l", { showArea: false, multiSeriesArea: true }).draw(MULTI_SAMPLE);
        expect(document.querySelector("#l svg path.area")).toBeNull();
    });

    test("multi-series area-fill colour pins inline for unclassed series so it matches the line", () => {
        // Unclassed multi-series payload — area + line should
        // share the d3 ordinal scale colour so the fill matches
        // its line instead of falling through to the global
        // `.area` CSS rule.
        makeTarget();
        new LineChart("#l", { multiSeriesArea: true }).draw(MULTI_SAMPLE);
        const areas = document.querySelectorAll("#l svg g.series path.area");
        const lines = document.querySelectorAll("#l svg g.series path.line");
        expect(areas).toHaveLength(2);
        expect(lines).toHaveLength(2);
        // Inline style colour pinned and equal between matching series.
        expect(areas[0].style.fill).not.toBe("");
        expect(lines[0].style.stroke).not.toBe("");
        expect(areas[0].style.fill).toBe(lines[0].style.stroke);
    });

    test("multi-series with per-series class returns no inline fill so CSS owns the colour", () => {
        // Class-themed series let host CSS pin the colour — the
        // widget must NOT publish an inline style override that
        // would beat the stylesheet's `.series.male .area` rule.
        makeTarget();
        new LineChart("#l", { multiSeriesArea: true }).draw({
            categories: ["1900s"],
            series: [
                { name: "M", class: "male", values: [10] },
                { name: "F", class: "female", values: [20] },
            ],
        });
        const areas = document.querySelectorAll("#l svg g.series path.area");
        const lines = document.querySelectorAll("#l svg g.series path.line");
        // resolveSeriesColour returns null for both area + line on
        // class-themed series. Locking both sides keeps the shared
        // helper's contract end-to-end (area-fill AND line-stroke).
        expect(areas[0].style.fill).toBe("");
        expect(areas[1].style.fill).toBe("");
        expect(lines[0].style.stroke).toBe("");
        expect(lines[1].style.stroke).toBe("");
    });
});

describe("LineChart — yUnit tooltip suffix", () => {
    test("multi-series tooltip honours tooltips[index] override when supplied", () => {
        // Per-series tooltips[index] beats every fallback. yUnit is
        // not appended on the overridden row — the override is a
        // full-cell replacement, not a numeric value.
        makeTarget();
        new LineChart("#l", {}).draw({
            categories: ["1900s"],
            series: [
                { name: "M", values: [10], tooltips: ["custom-row-override"] },
                { name: "F", values: [20] },
            ],
        });
        const point = document.querySelector("#l svg circle.point");
        // Synthesise the mouseover so the tooltip DOM appears.
        point?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const tooltipText = document.querySelector(".wt-chart-tooltip")?.textContent ?? "";
        expect(tooltipText).toContain("M: custom-row-override");
        // Series without an override falls through to value + (default empty) yUnit.
        expect(tooltipText).toContain("F: 20");
    });

    test("multi-series tooltip appends yUnit suffix when no tooltips override is given", () => {
        // No per-series tooltips array → fallback formats each row as
        // `name: value + yUnit`. Locks the percentage/unit suffix on
        // the multi-series branch.
        makeTarget();
        new LineChart("#l", { yUnit: " %" }).draw({
            categories: ["1900s"],
            series: [
                { name: "M", values: [10] },
                { name: "F", values: [20] },
            ],
        });
        const point = document.querySelector("#l svg circle.point");
        point?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const tooltipText = document.querySelector(".wt-chart-tooltip")?.textContent ?? "";
        expect(tooltipText).toContain("M: 10 %");
        expect(tooltipText).toContain("F: 20 %");
    });

    test("empty tooltips[index] string still falls through to value + yUnit (caller-disabled cell)", () => {
        // The "" check intentionally treats empty as no-override so
        // a caller can clear a single row without dropping the
        // array.
        makeTarget();
        new LineChart("#l", { yUnit: " %" }).draw({
            categories: ["1900s"],
            series: [
                { name: "M", values: [10], tooltips: [""] },
                { name: "F", values: [20] },
            ],
        });
        const point = document.querySelector("#l svg circle.point");
        point?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const tooltipText = document.querySelector(".wt-chart-tooltip")?.textContent ?? "";
        expect(tooltipText).toContain("M: 10 %");
    });

    test("single-series tooltip also appends yUnit when no per-point override is supplied", () => {
        // Symmetric with the multi-series branch — a single
        // percentage chart that ships values without per-point
        // tooltip overrides reads as "23.5 %" not a bare number.
        makeTarget();
        new LineChart("#l", { yUnit: " %" }).draw(SINGLE_SAMPLE);
        const point = document.querySelector("#l svg circle.point");
        point?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const tooltipText = document.querySelector(".wt-chart-tooltip")?.textContent ?? "";
        // First single-series sample value is 12 — must read "12 %".
        expect(tooltipText).toContain("12 %");
    });
});

describe("LineChart — perPointTooltip opt-in", () => {
    test("perPointTooltip:true shows only the hovered series in multi-series mode", () => {
        // Cohort-style charts (e.g. survival curve) want the
        // cross-series comparison to happen visually via the line
        // shapes, not by listing every series in the tooltip.
        // Hovering one point surfaces only that point's series.
        makeTarget();
        new LineChart("#l", { perPointTooltip: true }).draw({
            categories: ["1900s"],
            series: [
                { name: "M", values: [10] },
                { name: "F", values: [20] },
            ],
        });
        const point = document.querySelector("#l svg circle.point");
        point?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const tooltipText = document.querySelector(".wt-chart-tooltip")?.textContent ?? "";
        // First series M is rendered first → its point is the one we hover.
        expect(tooltipText).toContain("M");
        expect(tooltipText).toContain("10");
        // The F series must NOT appear in the per-point tooltip.
        expect(tooltipText).not.toContain("F: 20");
    });

    test("perPointTooltip:false preserves the aggregated multi-row tooltip", () => {
        // Default behaviour: hovering any point still lists every
        // series at that x-category. Locks the default against an
        // accidental flip of the opt-in flag.
        makeTarget();
        new LineChart("#l", {}).draw({
            categories: ["1900s"],
            series: [
                { name: "M", values: [10] },
                { name: "F", values: [20] },
            ],
        });
        const point = document.querySelector("#l svg circle.point");
        point?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const tooltipText = document.querySelector(".wt-chart-tooltip")?.textContent ?? "";
        expect(tooltipText).toContain("M: 10");
        expect(tooltipText).toContain("F: 20");
    });
});

describe("LineChart — axis captions", () => {
    test("xLabel option renders a centred caption below the x-axis", () => {
        // The caption sits in its own band below the tick labels —
        // mirrors the area-density widget's convention and the
        // statistics-chart design mockup's `gs-axis-text` layout.
        makeTarget();
        new LineChart("#l", { xLabel: "Age" }).draw(SINGLE_SAMPLE);
        const label = document.querySelector("#l svg .axis-label.x-label");
        expect(label).not.toBeNull();
        expect(label?.textContent).toBe("Age");
        expect(label?.getAttribute("text-anchor")).toBe("middle");
    });

    test("yLabel option renders a rotated caption beside the y-axis", () => {
        makeTarget();
        new LineChart("#l", { yLabel: "Years" }).draw(SINGLE_SAMPLE);
        const label = document.querySelector("#l svg .axis-label.y-label");
        expect(label).not.toBeNull();
        expect(label?.textContent).toBe("Years");
        // The rotation transform anchors the caption against the y-axis edge.
        expect(label?.getAttribute("transform")).toContain("rotate(-90)");
    });

    test("empty xLabel / yLabel options leave the slots un-rendered", () => {
        // Default behaviour: no caption element appears in the DOM.
        // Locks that legacy call sites which never set the options
        // don't suddenly grow an empty <text> node.
        makeTarget();
        new LineChart("#l", {}).draw(SINGLE_SAMPLE);
        expect(document.querySelector("#l svg .axis-label")).toBeNull();
    });

    test("xLabel + multi-series legend reserve enough vertical space to avoid overlap", () => {
        // Regression-lock the band-stacking math: the legend lives
        // in the bottom of the svg and the caption sits above it.
        // If margin.bottom growth gets dropped, the two would land
        // on the same y-coordinate and read as overlapping glyphs.
        makeTarget();
        new LineChart("#l", { xLabel: "Age" }).draw({
            categories: ["1900s"],
            series: [
                { name: "M", values: [10] },
                { name: "F", values: [20] },
            ],
        });
        const label = document.querySelector("#l svg .axis-label.x-label");
        const legendFirstItem = document.querySelector("#l svg .line-legend > g");
        const labelY = Number(label?.getAttribute("y") ?? 0);
        const legendTransform = legendFirstItem?.getAttribute("transform") ?? "";
        const legendYMatch = legendTransform.match(/translate\([^,]+,\s*([\d.]+)\)/);
        const legendY = Number(legendYMatch?.[1] ?? 0);
        // The caption sits above the legend — pin the ordering so a
        // future swap of the two render bands fails the test.
        expect(labelY).toBeLessThan(legendY);
        // And at least one line-height (~14px) of breathing room.
        expect(legendY - labelY).toBeGreaterThanOrEqual(14);
    });
});
