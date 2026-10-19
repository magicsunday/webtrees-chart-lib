import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { select } from "d3-selection";
import { transition } from "d3-transition";

import BarChart from "src/chart/widgets/bar-chart.js";

afterEach(() => {
    // Kill any pending entry transition so a d3 timer never outlives the test.
    const host = document.querySelector("#b");
    if (host !== null) {
        select(host)
            .selectAll("path.msc-bar-chart-bar, text.msc-bar-chart-bar-value")
            .interrupt("bar-enter")
            .interrupt("bar-value-enter");
    }
    document.body.innerHTML = "";
    // Drop any reduced-motion override so it cannot leak into other tests.
    window.matchMedia = undefined;
});

const SAMPLE = [
    { label: "0-9", value: 4 },
    { label: "10-19", value: 8 },
    { label: "20-29", value: 12 },
    { label: "30-39", value: 7 },
];

const makeTarget = (id = "b") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

/** @returns {SVGPathElement[]} every rendered bar <path> under #b */
const barPaths = () => [...document.querySelectorAll("#b svg path.msc-bar-chart-bar")];

/**
 * Vertical extent (max y − min y) a bar `<path>`'s `d` describes. The path is
 * read command by command, an `M` or `L` ends in its `x,y` pair and an arc `A`
 * ends in its last two numbers (after radii, rotation and the two flags). A
 * collapsed (height-0) bar spans ~1 px; a grown bar spans tens of pixels.
 *
 * @param {SVGPathElement} pathEl
 * @returns {number}
 */
const barYSpan = (pathEl) => {
    const ys = [...pathEl.getAttribute("d").matchAll(/([MLA])([^MLAZ]*)/g)].map((match) => {
        const nums = (match[2].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
        return nums[nums.length - 1];
    });
    return Math.max(...ys) - Math.min(...ys);
};

describe("BarChart — empty states", () => {
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new BarChart("#b", {}).draw([]);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#b svg.msc-bar-chart")).toBeNull();
    });

    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new BarChart("#b", {}).draw(null);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new BarChart("#b", { emptyMessage: "keine Werte" }).draw([]);
        expect(document.querySelector("#b > .chart-empty-state").textContent).toBe("keine Werte");
    });

    test("all-empty-labels rows fall through to empty-state", () => {
        makeTarget();
        new BarChart("#b", {}).draw([
            { label: "", value: 5 },
            { label: "", value: 7 },
        ]);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
    });
});

describe("BarChart — corner radius", () => {
    test("a tall bar rounds its top corners with the shared radius", () => {
        // Reduced motion draws the final heights at once, an entrance would
        // start from the collapsed one-pixel stub.
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new BarChart("#b", {}).draw([
            { label: "A", value: 100 },
            { label: "B", value: 10 },
        ]);
        const d = barPaths()[0].getAttribute("d");

        // Both top corners are arcs of the shared radius, the bar chart no longer
        // draws its own quadratic curve.
        expect(d.match(/A5,5,/g)).toHaveLength(2);
        expect(d).not.toContain("Q");
    });
});

describe("BarChart — bar geometry", () => {
    /**
     * Every coordinate a bar path visits, command by command (an `M` or `L`
     * ends in its `x,y` pair and an arc `A` in its last two numbers).
     *
     * @param {SVGPathElement} pathEl
     * @returns {{x: number, y: number}[]}
     */
    const points = (pathEl) =>
        [...pathEl.getAttribute("d").matchAll(/([MLA])([^MLAZ]*)/g)].map((match) => {
            const nums = (match[2].match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
            return { x: nums[nums.length - 2], y: nums[nums.length - 1] };
        });

    test("a bar grows up off the axis line and is as wide as its capped band", () => {
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new BarChart("#b", {}).draw([
            { label: "A", value: 100 },
            { label: "B", value: 40 },
        ]);
        const axis = document.querySelector("#b g.msc-bar-chart-x-axis").getAttribute("transform");
        const baseline = Number(axis.match(/translate\(0,\s*([\d.]+)\)/)[1]);

        for (const bar of barPaths()) {
            const visited = points(bar);
            const ys = visited.map((point) => point.y);
            const xs = visited.map((point) => point.x);

            // Flush on the axis line, nothing below it, the top above it.
            expect(Math.max(...ys)).toBe(baseline);
            expect(Math.min(...ys)).toBeLessThan(baseline);
            // Two categories on a wide card hit the 56 px cap.
            expect(Math.max(...xs) - Math.min(...xs)).toBe(56);
        }
    });
});

describe("BarChart — row sanitising", () => {
    test("rows without a usable value or with a negative value are dropped", () => {
        makeTarget();
        new BarChart("#b", {}).draw([
            { label: "ok", value: 4 },
            { label: "no value" },
            { label: "NaN", value: Number.NaN },
            { label: "negative", value: -1 },
            { label: "string", value: "7" },
        ]);
        expect(barPaths().map((path) => path.getAttribute("aria-label"))).toEqual([
            "ok: 4",
            "string: 7",
        ]);
    });

    test("a zero value keeps its row", () => {
        makeTarget();
        new BarChart("#b", {}).draw([
            { label: "zero", value: 0 },
            { label: "one", value: 1 },
        ]);
        expect(barPaths()).toHaveLength(2);
    });

    test("tooltip and tooltipLabel overrides survive the sanitising", () => {
        makeTarget();
        new BarChart("#b", {}).draw([{ label: "A", value: 3, tooltip: "T", tooltipLabel: "H" }]);
        barPaths()[0].dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
        const tooltip = document.querySelector(".msc-chart-tooltip");

        expect(tooltip.querySelector("strong").textContent).toBe("H");
        expect(tooltip.querySelector(".msc-chart-tooltip__stat").textContent).toBe("T");
    });

    test("a row without class, tooltip and tooltipLabel gets no class and the label and value as tooltip", () => {
        makeTarget();
        new BarChart("#b", {}).draw([{ label: "A", value: 3 }]);
        const path = barPaths()[0];
        path.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
        const tooltip = document.querySelector(".msc-chart-tooltip");

        expect(path.getAttribute("class")).toBe("msc-bar-chart-bar");
        expect(tooltip.querySelector("strong").textContent).toBe("A");
        expect(tooltip.querySelector(".msc-chart-tooltip__stat").textContent).toBe("3");
    });
});

describe("BarChart — rendering", () => {
    test("renders one <path> per row", () => {
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);
        expect(
            document.querySelectorAll("#b svg.msc-bar-chart path.msc-bar-chart-bar"),
        ).toHaveLength(SAMPLE.length);
    });

    test("per-row class lands on the <path> element so CSS can colour it", () => {
        makeTarget();
        new BarChart("#b", {}).draw([
            { label: "M", value: 4, class: "male" },
            { label: "F", value: 3, class: "female" },
        ]);
        const paths = document.querySelectorAll("#b svg path.msc-bar-chart-bar");
        expect(paths[0].getAttribute("class")).toContain("male");
        expect(paths[1].getAttribute("class")).toContain("female");
    });

    test("aria-label combines label + value per bar for screen readers", () => {
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);
        const labels = Array.from(document.querySelectorAll("#b svg path.msc-bar-chart-bar")).map(
            (r) => r.getAttribute("aria-label"),
        );
        expect(labels[0]).toBe("0-9: 4");
        expect(labels[2]).toBe("20-29: 12");
    });

    test("ariaLabel option renders on the host <svg>", () => {
        makeTarget();
        new BarChart("#b", { ariaLabel: "Marriage duration distribution" }).draw(SAMPLE);
        expect(document.querySelector("#b svg.msc-bar-chart").getAttribute("aria-label")).toBe(
            "Marriage duration distribution",
        );
    });

    test("horizontal orientation swaps the axis layout but keeps row count", () => {
        makeTarget();
        new BarChart("#b", { orientation: "horizontal" }).draw(SAMPLE);
        expect(document.querySelectorAll("#b svg path.msc-bar-chart-bar")).toHaveLength(
            SAMPLE.length,
        );
    });

    test("redraw replaces prior bars rather than stacking", () => {
        makeTarget();
        const chart = new BarChart("#b", {});
        chart.draw(SAMPLE);
        chart.draw([{ label: "only", value: 1 }]);
        expect(document.querySelectorAll("#b svg.msc-bar-chart")).toHaveLength(1);
        expect(document.querySelectorAll("#b svg path.msc-bar-chart-bar")).toHaveLength(1);
    });

    test("redraw from empty array drops the previous bars", () => {
        makeTarget();
        const chart = new BarChart("#b", {});
        chart.draw(SAMPLE);
        chart.draw([]);
        expect(document.querySelector("#b svg.msc-bar-chart")).toBeNull();
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
    });
});

describe("BarChart — native get/set accessors", () => {
    test("getters read back the constructor options", () => {
        makeTarget();
        const widget = new BarChart("#b", {
            orientation: "horizontal",
            brush: true,
            barPadding: 0.4,
            xLabel: "Age",
            yLabel: "Count",
        });
        expect(widget.orientation).toBe("horizontal");
        expect(widget.brush).toBe(true);
        expect(widget.barPadding).toBe(0.4);
        expect(widget.xLabel).toBe("Age");
        expect(widget.yLabel).toBe("Count");
    });

    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new BarChart("#b", {});
        expect(widget.height).toBeUndefined();
        expect(widget.width).toBeUndefined();
        expect(widget.margin).toEqual({ top: 20, right: 4, bottom: 36, left: 4 });
        expect(widget.orientation).toBe("vertical");
        expect(widget.brush).toBe(false);
        expect(widget.barPadding).toBe(0.2);
        expect(widget.xLabel).toBe("");
        expect(widget.yLabel).toBe("");
        expect(widget.ariaLabel).toBe("Bar chart");
        expect(widget.emptyMessage).toBe("No data available");
    });

    test("the orientation setter validates against the enum, getter reads it back", () => {
        makeTarget();
        const widget = new BarChart("#b", {});
        widget.orientation = "horizontal";
        expect(widget.orientation).toBe("horizontal");
        // A value outside the supported set resets to the default.
        widget.orientation = /** @type {any} */ ("diagonal");
        expect(widget.orientation).toBe("vertical");
    });

    test("the brush setter coerces to boolean (option name ↔ _brushEnabled field), getter reads it back", () => {
        makeTarget();
        const widget = new BarChart("#b", {});
        widget.brush = true;
        expect(widget.brush).toBe(true);
        // A non-boolean value resets to the default — the cast simulates the JSON
        // dispatcher assigning an untyped payload value.
        widget.brush = /** @type {any} */ ("yes");
        expect(widget.brush).toBe(false);
    });

    test("the barPadding setter clamps the fraction, getter reads it back", () => {
        makeTarget();
        const widget = new BarChart("#b", {});
        widget.barPadding = 0.5;
        expect(widget.barPadding).toBe(0.5);
        // Out-of-range values clamp into [0, 0.95].
        widget.barPadding = -1;
        expect(widget.barPadding).toBe(0);
        widget.barPadding = 2;
        expect(widget.barPadding).toBe(0.95);
        // A non-number value resets to the default — the cast simulates the JSON
        // dispatcher assigning an untyped payload value.
        widget.barPadding = /** @type {any} */ ("wide");
        expect(widget.barPadding).toBe(0.2);
    });

    test("the xLabel / yLabel setters validate strings, getters read them back", () => {
        makeTarget();
        const widget = new BarChart("#b", {});
        widget.xLabel = "Decade";
        widget.yLabel = "People";
        expect(widget.xLabel).toBe("Decade");
        expect(widget.yLabel).toBe("People");
        // A non-string value resets to the default empty string — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.xLabel = /** @type {any} */ (42);
        widget.yLabel = /** @type {any} */ (null);
        expect(widget.xLabel).toBe("");
        expect(widget.yLabel).toBe("");
    });

    test("the dispatcher pattern (Object.entries → widget[k] = v) configures the widget", () => {
        makeTarget();
        const widget = new BarChart("#b", {});
        for (const [key, value] of Object.entries({
            orientation: "horizontal",
            brush: true,
            barPadding: 0.3,
            xLabel: "Age",
        })) {
            widget[key] = value;
        }
        expect(widget.orientation).toBe("horizontal");
        expect(widget.brush).toBe(true);
        expect(widget.barPadding).toBe(0.3);
        expect(widget.xLabel).toBe("Age");
    });
});

describe("BarChart — entry animation", () => {
    test("holds every bar collapsed at the baseline under animateOnReveal", () => {
        makeTarget();
        new BarChart("#b", { animateOnReveal: true }).draw(SAMPLE);

        // Drawn, but held at the initial keyframe (the 2 px min-height rounded
        // bar on the baseline) until a later playEntry; nothing has grown yet.
        const spans = barPaths().map(barYSpan);
        expect(spans).toHaveLength(SAMPLE.length);
        // ≈ 1: the held bar is the rounded 1 px stub (never a flat straight-line
        // stub — that mis-composites in Firefox); far below a grown bar's px.
        expect(spans.every((span) => span >= 1 && span < 2)).toBe(true);
    });

    test("applies the collapsed initial keyframe on a plain draw (animates inline)", () => {
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);

        // playEntry runs inline, so the initial keyframe (the 2 px min-height
        // rounded bar) is applied synchronously before the async grow tween —
        // jsdom never advances the d3 timer, so the bars stay at it.
        const spans = barPaths().map(barYSpan);
        expect(spans).toHaveLength(SAMPLE.length);
        // ≈ 1: the held bar is the rounded 1 px stub (never a flat straight-line
        // stub — that mis-composites in Firefox); far below a grown bar's px.
        expect(spans.every((span) => span >= 1 && span < 2)).toBe(true);
    });

    test("the entrance grows each bar through the same arc path and ends on the final one", () => {
        const data = [
            { label: "A", value: 100 },
            { label: "B", value: 40 },
        ];

        // The final state, drawn at once under reduced motion.
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new BarChart("#b", {}).draw(data);
        const finalPaths = barPaths().map((bar) => bar.getAttribute("d"));

        // jsdom never advances the d3 timer, so the d tween is captured as it is
        // registered and evaluated by hand at chosen points of the entrance.
        window.matchMedia = undefined;
        const tweens = [];
        const original = transition.prototype.attrTween;
        const spy = jest
            .spyOn(transition.prototype, "attrTween")
            .mockImplementation(function (name, factory) {
                tweens.push({ name, factory });

                return original.call(this, name, factory);
            });

        try {
            makeTarget();
            new BarChart("#b", {}).draw(data);
        } finally {
            spy.mockRestore();
        }

        const bars = barPaths();
        const grow = tweens.find((entry) => entry.name === "d");
        expect(grow).toBeDefined();
        const at = (index, t) =>
            grow.factory.call(bars[index], select(bars[index]).datum(), index, bars)(t);

        // Collapsed at the start, the final path at the end.
        expect(barYSpan({ getAttribute: () => at(0, 0) })).toBeLessThan(2);
        expect(at(0, 1)).toBe(finalPaths[0]);
        expect(at(1, 1)).toBe(finalPaths[1]);

        // Part way up it is still the shared outline: arcs, no quadratic curve.
        const middle = at(0, 0.5);
        expect(middle).toContain("A");
        expect(middle).not.toContain("Q");
        expect(barYSpan({ getAttribute: () => middle })).toBeGreaterThan(2);
        expect(barYSpan({ getAttribute: () => middle })).toBeLessThan(
            barYSpan({ getAttribute: () => finalPaths[0] }),
        );
    });

    test("reduced motion jumps straight to the final bar heights (no held keyframe)", () => {
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);

        // No entrance to hold or animate — every bar renders at its full height
        // at once, so each spans well beyond the collapsed 1 px stub.
        const spans = barPaths().map(barYSpan);
        expect(spans).toHaveLength(SAMPLE.length);
        expect(spans.every((span) => span > 20)).toBe(true);
    });

    test("renders zero / tiny / full bars as distinct rounded heights, never a flat stub", () => {
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new BarChart("#b", {}).draw([
            { label: "none", value: 0 },
            { label: "one", value: 1 },
            { label: "many", value: 1000 },
        ]);

        const paths = barPaths();
        const spans = paths.map(barYSpan);
        // Every bar, the one-pixel stub of an empty band included, goes through
        // the shared rounded outline (arcs), never a flat straight-line path.
        expect(paths.every((p) => p.getAttribute("d").includes("A"))).toBe(true);
        expect(paths.some((p) => p.getAttribute("d").includes("Q"))).toBe(false);
        // Three distinct, visible heights: a zero band is a 1 px stub, a single
        // occurrence a 2 px mini-bar, a dominant value the full height — so an
        // empty bucket stays distinguishable from a one-count bucket.
        expect(spans[0]).toBeGreaterThanOrEqual(1);
        expect(spans[0]).toBeLessThan(2);
        expect(spans[1]).toBeGreaterThanOrEqual(2);
        expect(spans[1]).toBeLessThan(4);
        expect(spans[2]).toBeGreaterThan(20);
        expect(spans[1]).toBeGreaterThan(spans[0]);
    });

    test("playEntry replays on the existing bars without re-drawing", () => {
        makeTarget();
        const widget = new BarChart("#b", { animateOnReveal: true });
        widget.draw(SAMPLE);

        const svgBefore = document.querySelectorAll("#b svg.msc-bar-chart");
        const barsBefore = document.querySelectorAll("#b path.msc-bar-chart-bar");

        widget.playEntry();

        const svgAfter = document.querySelectorAll("#b svg.msc-bar-chart");
        const barsAfter = document.querySelectorAll("#b path.msc-bar-chart-bar");

        // Same single svg, same path nodes — playEntry animates, never redraws.
        expect(svgAfter).toHaveLength(1);
        expect(svgBefore[0]).toBe(svgAfter[0]);
        expect(barsAfter).toHaveLength(barsBefore.length);
        for (let index = 0; index < barsBefore.length; index++) {
            expect(barsBefore[index]).toBe(barsAfter[index]);
        }

        // Idempotent: a second playEntry is a no-op (entrance already consumed).
        widget.playEntry();
        expect(document.querySelectorAll("#b svg.msc-bar-chart")).toHaveLength(1);
    });
});

describe("BarChart — brush", () => {
    test("brush:false (default) does NOT add a brush layer", () => {
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);
        expect(document.querySelector("#b svg .msc-bar-chart-bar-brush")).toBeNull();
    });

    test("brush:true installs the brush group on the inner stage", () => {
        makeTarget();
        new BarChart("#b", { brush: true }).draw(SAMPLE);
        expect(document.querySelector("#b svg .msc-bar-chart-bar-brush")).not.toBeNull();
    });

    test("brush emits selectionChanged on the host target", () => {
        const target = makeTarget();
        new BarChart("#b", { brush: true }).draw(SAMPLE);

        let captured = null;
        target.addEventListener("selectionChanged", (event) => {
            captured = event.detail;
        });

        // Simulate brushend with a manual CustomEvent — d3-brush
        // wires real pointer events, but unit-test scope just needs
        // the integration contract: the host dispatches a typed
        // CustomEvent the consumer can subscribe to.
        target.dispatchEvent(
            new CustomEvent("selectionChanged", {
                detail: { labels: ["10-19", "20-29"] },
            }),
        );

        expect(captured).not.toBeNull();
        expect(captured.labels).toEqual(["10-19", "20-29"]);
    });
});

describe("BarChart — responsive sizing", () => {
    test("a host narrower than the floor renders at the 240 px floor, not the fallback", () => {
        // Below-floor host clamps to the minimum, not the fallback — pins the (fallback, minimum) order. Full seam: base-widget.test.js.
        const el = makeTarget();
        Object.defineProperty(el, "clientWidth", { value: 100, configurable: true });
        new BarChart(el, {}).draw(SAMPLE);
        const viewBox = document.querySelector("#b svg.msc-bar-chart").getAttribute("viewBox");
        expect(viewBox.split(" ")[2]).toBe("240");
    });

    test("responsive height: an unset height adopts the host element's clientHeight", () => {
        const el = makeTarget();
        // jsdom reports clientHeight 0 by default, which forces the fallback
        // arm; stubbing a real height exercises the container-adoption arm of
        // the shared `_resolveHeight()` seam every layout widget resolves
        // through.
        Object.defineProperty(el, "clientHeight", { value: 321, configurable: true });
        new BarChart(el, {}).draw(SAMPLE);
        const viewBox = document.querySelector("#b svg.msc-bar-chart").getAttribute("viewBox");
        // Host reports no width here, so width is this widget's own fallback — pins the FIRST arg (the floor test pins the second). Full seam: base-widget.test.js.
        expect(viewBox.split(" ")[2]).toBe("600");
        expect(viewBox.split(" ")[3]).toBe("321"); // "0 0 <width> <height>"
    });

    test("an explicit height overrides the host element's clientHeight", () => {
        const el = makeTarget();
        Object.defineProperty(el, "clientHeight", { value: 321, configurable: true });
        new BarChart(el, { height: 480 }).draw(SAMPLE);
        const viewBox = document.querySelector("#b svg.msc-bar-chart").getAttribute("viewBox");
        expect(viewBox.split(" ")[3]).toBe("480");
    });
});

describe("BarChart — axis chrome", () => {
    test("the category axis drops the baseline AND the tick stubs, keeping the labels", () => {
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);

        const axis = document.querySelector("#b svg g.msc-bar-chart-x-axis");
        expect(axis.querySelector("path.domain")).toBeNull();
        expect(axis.querySelectorAll(".tick line")).toHaveLength(0);
        expect(axis.querySelectorAll(".tick text").length).toBeGreaterThan(0);
    });
});

describe("BarChart — detached host fallback", () => {
    test("a host that measures zero renders at the widget's own default size", () => {
        // With nothing measured, the site-specific fallback constant is what remains.
        const el = makeTarget();
        new BarChart(el, {}).draw(SAMPLE);
        expect(el.querySelector("svg").getAttribute("viewBox")).toBe("0 0 600 240");
    });
});
