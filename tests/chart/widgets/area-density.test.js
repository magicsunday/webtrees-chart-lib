import { afterEach, describe, expect, test } from "@jest/globals";

import AreaDensity from "src/chart/widgets/area-density.js";

afterEach(() => {
    document.body.innerHTML = "";
    // Drop any reduced-motion override so it can't leak into other tests.
    window.matchMedia = undefined;
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
        expect(document.querySelector("#a svg.msc-area-density")).toBeNull();
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
        new AreaDensity("#a", { emptyMessage: "No distribution" }).draw([]);
        expect(document.querySelector("#a > .chart-empty-state").textContent).toBe(
            "No distribution",
        );
    });
});

describe("AreaDensity — rendering", () => {
    test("renders one filled area path", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#a svg path.msc-area-density-area")).toHaveLength(1);
    });

    test("default showLine:true also renders the line overlay", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw(SAMPLE);
        expect(document.querySelector("#a svg path.msc-area-density-line")).not.toBeNull();
    });

    test("showLine:false drops the line overlay", () => {
        makeTarget();
        new AreaDensity("#a", { showLine: false }).draw(SAMPLE);
        expect(document.querySelector("#a svg path.msc-area-density-line")).toBeNull();
        expect(document.querySelector("#a svg path.msc-area-density-area")).not.toBeNull();
    });

    test("renders one hit-target circle per row for tooltips", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#a svg circle.msc-area-density-point")).toHaveLength(
            SAMPLE.length,
        );
    });

    test("aria-label encodes x and y per hit-target", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw(SAMPLE);
        const first = document.querySelector("#a svg circle.msc-area-density-point");
        expect(first?.getAttribute("aria-label")).toBe("1: 5");
    });

    test("ariaLabel option lands on the host <svg>", () => {
        makeTarget();
        new AreaDensity("#a", { ariaLabel: "Sibling age gap density" }).draw(SAMPLE);
        expect(document.querySelector("#a svg.msc-area-density").getAttribute("aria-label")).toBe(
            "Sibling age gap density",
        );
    });

    test("xLabel option renders an x-axis label element", () => {
        makeTarget();
        new AreaDensity("#a", { xLabel: "years" }).draw(SAMPLE);
        expect(
            document.querySelector("#a svg .msc-area-density-axis-label.msc-area-density-x-label")
                ?.textContent,
        ).toBe("years");
    });

    test("yLabel option renders a rotated y-axis label element", () => {
        makeTarget();
        new AreaDensity("#a", { yLabel: "count" }).draw(SAMPLE);
        expect(
            document.querySelector("#a svg .msc-area-density-axis-label.msc-area-density-y-label")
                ?.textContent,
        ).toBe("count");
    });

    test("rows arrive sorted by x even if the caller passes unsorted data", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw([
            { x: 5, y: 8 },
            { x: 1, y: 5 },
            { x: 3, y: 38 },
        ]);
        const labels = Array.from(
            document.querySelectorAll("#a svg circle.msc-area-density-point"),
        ).map((c) => c.getAttribute("aria-label"));
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
        expect(document.querySelectorAll("#a svg.msc-area-density")).toHaveLength(1);
        expect(document.querySelectorAll("#a svg circle.msc-area-density-point")).toHaveLength(2);
    });
});

describe("AreaDensity — native get/set accessors", () => {
    test("getters read back the constructor options", () => {
        makeTarget();
        const widget = new AreaDensity("#a", {
            height: 320,
            width: 720,
            margin: { left: 60 },
            showLine: false,
            xLabel: "years",
            yLabel: "count",
            ariaLabel: "Age gap density",
            emptyMessage: "No distribution",
        });
        expect(widget.height).toBe(320);
        expect(widget.width).toBe(720);
        // A partial margin only overrides the named side; the rest stay default.
        expect(widget.margin).toEqual({ top: 12, right: 24, bottom: 32, left: 60 });
        expect(widget.showLine).toBe(false);
        expect(widget.xLabel).toBe("years");
        expect(widget.yLabel).toBe("count");
        expect(widget.ariaLabel).toBe("Age gap density");
        expect(widget.emptyMessage).toBe("No distribution");
    });

    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new AreaDensity("#a", {});
        expect(widget.height).toBeUndefined();
        expect(widget.width).toBeUndefined();
        expect(widget.margin).toEqual({ top: 12, right: 24, bottom: 32, left: 40 });
        expect(widget.showLine).toBe(true);
        expect(widget.xLabel).toBe("");
        expect(widget.yLabel).toBe("");
        expect(widget.ariaLabel).toBe("Area density chart");
        expect(widget.emptyMessage).toBe("No data available");
    });

    test("the height setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new AreaDensity("#a", {});
        widget.height = 500;
        expect(widget.height).toBe(500);
        // A non-positive value clears the override (responsive sizing).
        widget.height = -10;
        expect(widget.height).toBeUndefined();
        // The runtime guard also clears the override for a non-number value — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.height = /** @type {any} */ ("tall");
        expect(widget.height).toBeUndefined();
    });

    test("the width setter keeps a finite positive number else undefined, getter reads it back", () => {
        makeTarget();
        // An omitted width stays responsive (undefined) so draw falls back to the
        // host element's width.
        const responsive = new AreaDensity("#a", {});
        expect(responsive.width).toBeUndefined();
        // An explicit positive width reads back unchanged.
        const widget = new AreaDensity("#a", { width: 640 });
        expect(widget.width).toBe(640);
        // A non-positive value clears the override back to responsive sizing.
        widget.width = 0;
        expect(widget.width).toBeUndefined();
        widget.width = -1;
        expect(widget.width).toBeUndefined();
        // The runtime guard clears a non-number value — the cast simulates the
        // JSON dispatcher assigning an untyped payload value.
        widget.width = /** @type {any} */ ("wide");
        expect(widget.width).toBeUndefined();
    });

    test("the margin setter merges over the defaults, getter reads it back", () => {
        makeTarget();
        const widget = new AreaDensity("#a", {});
        widget.margin = { right: 60, left: 60 };
        expect(widget.margin).toEqual({ top: 12, right: 60, bottom: 32, left: 60 });
        // A missing value falls back to the full default set.
        widget.margin = /** @type {any} */ (undefined);
        expect(widget.margin).toEqual({ top: 12, right: 24, bottom: 32, left: 40 });
    });

    test("the showLine setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new AreaDensity("#a", {});
        widget.showLine = false;
        expect(widget.showLine).toBe(false);
        widget.showLine = true;
        expect(widget.showLine).toBe(true);
        // The runtime guard resets a non-boolean value to the default — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.showLine = /** @type {any} */ ("yes");
        expect(widget.showLine).toBe(true);
    });

    test("the xLabel setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new AreaDensity("#a", {});
        widget.xLabel = "years";
        expect(widget.xLabel).toBe("years");
        // An empty string is a valid xLabel (omits the label).
        widget.xLabel = "";
        expect(widget.xLabel).toBe("");
        // The runtime guard resets a non-string value to an empty string — the
        // cast simulates the JSON dispatcher assigning an untyped payload value.
        widget.xLabel = /** @type {any} */ (42);
        expect(widget.xLabel).toBe("");
    });

    test("the yLabel setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new AreaDensity("#a", {});
        widget.yLabel = "count";
        expect(widget.yLabel).toBe("count");
        // An empty string is a valid yLabel (omits the label).
        widget.yLabel = "";
        expect(widget.yLabel).toBe("");
        // The runtime guard resets a non-string value to an empty string — the
        // cast simulates the JSON dispatcher assigning an untyped payload value.
        widget.yLabel = /** @type {any} */ (42);
        expect(widget.yLabel).toBe("");
    });

    test("the ariaLabel setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted ariaLabel exposes the default accessible name.
        const fallback = new AreaDensity("#a", {});
        expect(fallback.ariaLabel).toBe("Area density chart");
        // A custom string reads back unchanged.
        const widget = new AreaDensity("#a", { ariaLabel: "Age gap density" });
        expect(widget.ariaLabel).toBe("Age gap density");
        // An empty string resets to the default.
        widget.ariaLabel = "";
        expect(widget.ariaLabel).toBe("Area density chart");
        // The runtime guard also defaults a non-string value — the cast simulates
        // the JSON dispatcher assigning an untyped payload value.
        widget.ariaLabel = /** @type {any} */ (42);
        expect(widget.ariaLabel).toBe("Area density chart");
    });

    test("the emptyMessage setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted emptyMessage exposes the default placeholder text.
        const fallback = new AreaDensity("#a", {});
        expect(fallback.emptyMessage).toBe("No data available");
        // A custom string reads back unchanged.
        const widget = new AreaDensity("#a", { emptyMessage: "Nothing to show" });
        expect(widget.emptyMessage).toBe("Nothing to show");
        // An empty string is a valid emptyMessage (only non-string resets).
        widget.emptyMessage = "";
        expect(widget.emptyMessage).toBe("");
        // The runtime guard resets a non-string value to the default — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.emptyMessage = /** @type {any} */ (42);
        expect(widget.emptyMessage).toBe("No data available");
    });

    test("the dispatcher pattern (Object.entries → widget[k] = v) configures the widget", () => {
        makeTarget();
        const widget = new AreaDensity("#a", {});
        for (const [key, value] of Object.entries({
            height: 400,
            showLine: false,
            xLabel: "decade",
            ariaLabel: "Density chart",
        })) {
            widget[key] = value;
        }
        expect(widget.height).toBe(400);
        expect(widget.showLine).toBe(false);
        expect(widget.xLabel).toBe("decade");
        expect(widget.ariaLabel).toBe("Density chart");
    });
});

describe("AreaDensity — reduced-motion entrance parity", () => {
    test("renders the area at full opacity (not the held zero)", () => {
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new AreaDensity("#a", { animateOnReveal: true }).draw(SAMPLE);

        // entry(false) sets opacity to 1 directly; the held keyframe is opacity 0.
        const area = document.querySelector("#a svg path.msc-area-density-area");
        expect(area).not.toBeNull();
        expect(area.getAttribute("opacity")).toBe("1");
    });
});
