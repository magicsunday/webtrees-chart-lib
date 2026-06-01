import { afterEach, describe, expect, test } from "@jest/globals";

import StackedBar from "src/chart/widgets/stacked-bar.js";

afterEach(() => {
    document.body.innerHTML = "";
    // Drop any reduced-motion override so it can't leak into other tests.
    window.matchMedia = undefined;
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

describe("StackedBar — percentage mode", () => {
    test("y-axis tick labels span 0% to 100%", () => {
        makeTarget();
        new StackedBar("#s", { percentage: true }).draw(SAMPLE);
        const tickLabels = Array.from(
            document.querySelectorAll("#s svg g.y-axis .tick text"),
            (n) => n.textContent,
        );
        // Every tick carries the % suffix and the axis spans the
        // full 0..100 percent range — a regression that emitted a
        // single misformatted tick would slip past a length-only
        // gate.
        expect(tickLabels).toContain("0%");
        expect(tickLabels).toContain("100%");
        for (const label of tickLabels) {
            expect(label).toMatch(/%$/);
        }
    });

    test("each category's segments sum to 100 in the bound stack tuples", () => {
        makeTarget();
        // Asymmetric per-category totals — 1900s sums to 19, 1910s
        // to 21, 1920s to 34. In percent mode each bar must
        // re-normalise to 100. d3 binds the post-stack `[y0, y1]`
        // tuple synchronously on `node.__data__`, so the rescale
        // can be verified without waiting for the d3-transition
        // (which jsdom does not animate during the synchronous
        // test body).
        new StackedBar("#s", { percentage: true }).draw(SAMPLE);
        const totals = new Map();
        for (const node of document.querySelectorAll("#s svg g.series rect.segment")) {
            const datum = node.__data__;
            const label = datum?.data?.label;
            const span = (datum?.[1] ?? 0) - (datum?.[0] ?? 0);
            if (typeof label === "string") {
                totals.set(label, (totals.get(label) ?? 0) + span);
            }
        }
        expect(totals.size).toBe(SAMPLE.categories.length);
        for (const [, total] of totals) {
            expect(total).toBeCloseTo(100, 5);
        }
    });

    test("aria-label reports the raw count, not the percentage value", () => {
        makeTarget();
        new StackedBar("#s", { percentage: true }).draw(SAMPLE);
        // Scope to the specific segment the assertion is about —
        // taking the first DOM rect would couple the test to the
        // widget's stack-direction internals.
        const cell = document.querySelector("#s svg rect.segment[aria-label^='1900s / 20-29']");
        expect(cell?.getAttribute("aria-label")).toBe("1900s / 20-29: 4");
    });

    test("single-series category exposes the raw count, not the percent share", () => {
        makeTarget();
        // Only one series present — the rescale must keep the
        // aria-label on the raw count (7) rather than emitting the
        // 100% share, otherwise screen readers lose the real
        // magnitude. Position checks would have to wait for the
        // d3-transition (jsdom does not animate); checking the
        // accessibility output is the better invariant.
        new StackedBar("#s", { percentage: true }).draw({
            categories: ["only"],
            series: [{ name: "solo", data: [7] }],
        });
        const segment = document.querySelector("#s svg rect.segment[aria-label^='only / solo']");
        expect(segment?.getAttribute("aria-label")).toBe("only / solo: 7");
    });

    test("zero-total category emits zero-span stack tuples instead of dividing by zero", () => {
        makeTarget();
        // Verify the contract through the bound stack tuple on each
        // rect (`node.__data__[1] - node.__data__[0]`), which d3
        // sets synchronously. Asserting the rendered `height` would
        // be vacuous in jsdom — the widget starts every rect at
        // height=0 and only animates to the final value inside a
        // d3-transition jsdom does not run.
        new StackedBar("#s", { percentage: true }).draw({
            categories: ["a", "b"],
            series: [
                { name: "x", data: [0, 5] },
                { name: "y", data: [0, 3] },
            ],
        });
        const spansByCategory = new Map();
        for (const node of document.querySelectorAll("#s svg rect.segment")) {
            const datum = node.__data__;
            const label = datum?.data?.label;
            const span = (datum?.[1] ?? 0) - (datum?.[0] ?? 0);
            const list = spansByCategory.get(label) ?? [];
            list.push(span);
            spansByCategory.set(label, list);
        }
        const aSpans = spansByCategory.get("a") ?? [];
        const bSpans = spansByCategory.get("b") ?? [];
        // 'a' bar: total = 0 → both segments collapse to span 0
        // rather than NaN-out on a division by zero.
        // (2 series in the fixture above → 2 rects → 2 spans.)
        expect(aSpans).toHaveLength(2);
        for (const span of aSpans) {
            expect(span).toBe(0);
        }
        // 'b' bar: total = 8 → segments split into 62.5% + 37.5%
        // = 100%, proving the rescale is per-category and the
        // non-zero bar still normalises correctly alongside the
        // zero one.
        expect(bSpans.reduce((sum, span) => sum + span, 0)).toBeCloseTo(100, 5);
    });

    test("absolute mode still renders integer tick labels", () => {
        makeTarget();
        // Symmetric contract: with percentage off the tick
        // formatter must NOT append "%", otherwise the absolute
        // axis would read as a percent axis and mislead the user.
        new StackedBar("#s", {}).draw(SAMPLE);
        const tickLabels = Array.from(
            document.querySelectorAll("#s svg g.y-axis .tick text"),
            (n) => n.textContent,
        );
        for (const label of tickLabels) {
            expect(label).not.toMatch(/%$/);
        }
    });
});

describe("StackedBar — native get/set accessors", () => {
    test("getters read back the constructor option values", () => {
        makeTarget();
        const chart = new StackedBar("#s", {
            height: 360,
            width: 720,
            margin: { top: 4, right: 8, bottom: 16, left: 20 },
            barPadding: 0.4,
            legend: false,
            percentage: true,
            emptyMessage: "no rows",
            ariaLabel: "Age bands",
            i18n: { totalInCategoryPattern: "{count} all up" },
        });
        expect(chart.height).toBe(360);
        expect(chart.width).toBe(720);
        expect(chart.margin).toEqual({ top: 4, right: 8, bottom: 16, left: 20 });
        expect(chart.barPadding).toBe(0.4);
        expect(chart.legend).toBe(false);
        expect(chart.percentage).toBe(true);
        expect(chart.emptyMessage).toBe("no rows");
        expect(chart.ariaLabel).toBe("Age bands");
        expect(chart.i18n).toEqual({ totalInCategoryPattern: "{count} all up" });
    });

    test("getters expose the defaults when options are omitted", () => {
        makeTarget();
        const chart = new StackedBar("#s", {});
        expect(chart.height).toBeUndefined();
        expect(chart.width).toBeUndefined();
        expect(chart.margin).toEqual({ top: 12, right: 24, bottom: 32, left: 48 });
        expect(chart.barPadding).toBe(0.2);
        expect(chart.legend).toBe(true);
        expect(chart.percentage).toBe(false);
        expect(chart.emptyMessage).toBe("No data available");
        expect(chart.ariaLabel).toBe("Stacked bar chart");
        expect(chart.i18n).toEqual({});
    });

    test("margin setter partial-merges over the defaults", () => {
        makeTarget();
        const chart = new StackedBar("#s", {});
        chart.margin = { left: 64 };
        expect(chart.margin).toEqual({ top: 12, right: 24, bottom: 32, left: 64 });
    });

    test("boolean-flag setters reject non-boolean input and keep the default", () => {
        makeTarget();
        const chart = new StackedBar("#s", {});
        /** @type {any} */ (chart).legend = "yes";
        /** @type {any} */ (chart).percentage = 1;
        expect(chart.legend).toBe(true);
        expect(chart.percentage).toBe(false);
    });

    test("numeric setters fall back on invalid input", () => {
        makeTarget();
        const chart = new StackedBar("#s", { height: 360, width: 720, barPadding: 0.4 });
        /** @type {any} */ (chart).height = -5;
        /** @type {any} */ (chart).width = "wide";
        /** @type {any} */ (chart).barPadding = Number.NaN;
        expect(chart.height).toBeUndefined();
        expect(chart.width).toBeUndefined();
        expect(chart.barPadding).toBe(0.2);
    });

    test("barPadding setter clamps out-of-range fractions to the bounds", () => {
        makeTarget();
        const chart = new StackedBar("#s", {});
        chart.barPadding = -1;
        expect(chart.barPadding).toBe(0);
        chart.barPadding = 5;
        expect(chart.barPadding).toBe(0.95);
    });

    test("string setters fall back on non-string input", () => {
        makeTarget();
        const chart = new StackedBar("#s", { emptyMessage: "x", ariaLabel: "y" });
        /** @type {any} */ (chart).emptyMessage = 42;
        /** @type {any} */ (chart).ariaLabel = "";
        expect(chart.emptyMessage).toBe("No data available");
        expect(chart.ariaLabel).toBe("Stacked bar chart");
    });

    test("i18n setter resets to an empty pack on non-object input", () => {
        makeTarget();
        const chart = new StackedBar("#s", { i18n: { totalInCategoryPattern: "{count} all" } });
        /** @type {any} */ (chart).i18n = null;
        expect(chart.i18n).toEqual({});
    });

    test("dispatcher-style bulk assignment lands on the backing fields", () => {
        makeTarget();
        const chart = new StackedBar("#s", {});
        const config = {
            height: 320,
            legend: false,
            percentage: true,
            emptyMessage: "empty",
            ariaLabel: "bands",
        };
        for (const [key, value] of Object.entries(config)) {
            /** @type {any} */ (chart)[key] = value;
        }
        expect(chart.height).toBe(320);
        expect(chart.legend).toBe(false);
        expect(chart.percentage).toBe(true);
        expect(chart.emptyMessage).toBe("empty");
        expect(chart.ariaLabel).toBe("bands");
    });

    test("setters drive the rendered output (ariaLabel + emptyMessage)", () => {
        makeTarget();
        const chart = new StackedBar("#s", {});
        chart.ariaLabel = "Set after construction";
        chart.draw(SAMPLE);
        expect(document.querySelector("#s svg.wt-stacked-bar").getAttribute("aria-label")).toBe(
            "Set after construction",
        );

        makeTarget();
        const empty = new StackedBar("#s", {});
        empty.emptyMessage = "nothing here";
        empty.draw(null);
        expect(document.querySelector("#s > .chart-empty-state").textContent).toBe("nothing here");
    });
});

describe("StackedBar — reduced-motion entrance parity", () => {
    test("renders segments at full height (not collapsed at the baseline)", () => {
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new StackedBar("#s", { animateOnReveal: true }).draw(SAMPLE);

        // entry(false) sets the final y/height directly; the held keyframe would
        // leave every segment at the baseline with height 0.
        const heights = [...document.querySelectorAll("#s rect.segment")].map((r) =>
            Number(r.getAttribute("height")),
        );
        expect(heights.length).toBeGreaterThan(0);
        expect(heights.every((h) => h > 0)).toBe(true);
    });
});
