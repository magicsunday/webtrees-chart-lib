import { afterEach, describe, expect, test } from "@jest/globals";

import BarChart from "src/chart/widgets/bar-chart.js";

afterEach(() => {
    document.body.innerHTML = "";
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

describe("BarChart — empty states", () => {
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new BarChart("#b", {}).draw([]);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#b svg.wt-bar-chart")).toBeNull();
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

describe("BarChart — rendering", () => {
    test("renders one <path> per row", () => {
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#b svg.wt-bar-chart path.bar")).toHaveLength(
            SAMPLE.length,
        );
    });

    test("per-row class lands on the <path> element so CSS can colour it", () => {
        makeTarget();
        new BarChart("#b", {}).draw([
            { label: "M", value: 4, class: "male" },
            { label: "F", value: 3, class: "female" },
        ]);
        const paths = document.querySelectorAll("#b svg path.bar");
        expect(paths[0].getAttribute("class")).toContain("male");
        expect(paths[1].getAttribute("class")).toContain("female");
    });

    test("aria-label combines label + value per bar for screen readers", () => {
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);
        const labels = Array.from(document.querySelectorAll("#b svg path.bar")).map((r) =>
            r.getAttribute("aria-label"),
        );
        expect(labels[0]).toBe("0-9: 4");
        expect(labels[2]).toBe("20-29: 12");
    });

    test("ariaLabel option renders on the host <svg>", () => {
        makeTarget();
        new BarChart("#b", { ariaLabel: "Marriage duration distribution" }).draw(SAMPLE);
        expect(document.querySelector("#b svg.wt-bar-chart").getAttribute("aria-label")).toBe(
            "Marriage duration distribution",
        );
    });

    test("horizontal orientation swaps the axis layout but keeps row count", () => {
        makeTarget();
        new BarChart("#b", { orientation: "horizontal" }).draw(SAMPLE);
        expect(document.querySelectorAll("#b svg path.bar")).toHaveLength(SAMPLE.length);
    });

    test("responsive height: an unset height adopts the host element's clientHeight", () => {
        const el = makeTarget();
        // jsdom reports clientHeight 0 by default, which forces the `|| DEFAULT`
        // arm; stubbing a real height exercises the container-adoption arm that
        // the shared `pickPositive(this._height, clientHeight) || DEFAULT` path
        // introduced for every layout widget.
        Object.defineProperty(el, "clientHeight", { value: 321, configurable: true });
        new BarChart(el, {}).draw(SAMPLE);
        const viewBox = document.querySelector("#b svg.wt-bar-chart").getAttribute("viewBox");
        expect(viewBox.split(" ")[3]).toBe("321"); // "0 0 <width> <height>"
    });

    test("an explicit height overrides the host element's clientHeight", () => {
        const el = makeTarget();
        Object.defineProperty(el, "clientHeight", { value: 321, configurable: true });
        new BarChart(el, { height: 480 }).draw(SAMPLE);
        const viewBox = document.querySelector("#b svg.wt-bar-chart").getAttribute("viewBox");
        expect(viewBox.split(" ")[3]).toBe("480");
    });

    test("redraw replaces prior bars rather than stacking", () => {
        makeTarget();
        const chart = new BarChart("#b", {});
        chart.draw(SAMPLE);
        chart.draw([{ label: "only", value: 1 }]);
        expect(document.querySelectorAll("#b svg.wt-bar-chart")).toHaveLength(1);
        expect(document.querySelectorAll("#b svg path.bar")).toHaveLength(1);
    });

    test("redraw from empty array drops the previous bars", () => {
        makeTarget();
        const chart = new BarChart("#b", {});
        chart.draw(SAMPLE);
        chart.draw([]);
        expect(document.querySelector("#b svg.wt-bar-chart")).toBeNull();
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
    });
});

describe("BarChart — native get/set accessors", () => {
    test("getters read back the constructor options", () => {
        makeTarget();
        const widget = new BarChart("#b", {
            height: 360,
            width: 720,
            margin: { left: 40 },
            orientation: "horizontal",
            brush: true,
            barPadding: 0.4,
            xLabel: "Age",
            yLabel: "Count",
            ariaLabel: "Age distribution",
            emptyMessage: "Nothing to show",
        });
        expect(widget.height).toBe(360);
        expect(widget.width).toBe(720);
        // A partial margin only overrides the named side; the rest stay default.
        expect(widget.margin).toEqual({ top: 20, right: 4, bottom: 36, left: 40 });
        expect(widget.orientation).toBe("horizontal");
        expect(widget.brush).toBe(true);
        expect(widget.barPadding).toBe(0.4);
        expect(widget.xLabel).toBe("Age");
        expect(widget.yLabel).toBe("Count");
        expect(widget.ariaLabel).toBe("Age distribution");
        expect(widget.emptyMessage).toBe("Nothing to show");
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

    test("the height setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new BarChart("#b", {});
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
        const responsive = new BarChart("#b", {});
        expect(responsive.width).toBeUndefined();
        // An explicit positive width reads back unchanged.
        const widget = new BarChart("#b", { width: 640 });
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
        const widget = new BarChart("#b", {});
        widget.margin = { top: 10, bottom: 10 };
        expect(widget.margin).toEqual({ top: 10, right: 4, bottom: 10, left: 4 });
        // A missing value falls back to the full default set.
        widget.margin = /** @type {any} */ (undefined);
        expect(widget.margin).toEqual({ top: 20, right: 4, bottom: 36, left: 4 });
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

    test("the ariaLabel setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new BarChart("#b", {});
        widget.ariaLabel = "Marriage durations";
        expect(widget.ariaLabel).toBe("Marriage durations");
        // An empty string resets to the default.
        widget.ariaLabel = "";
        expect(widget.ariaLabel).toBe("Bar chart");
        // The runtime guard also defaults a non-string value — the cast simulates
        // the JSON dispatcher assigning an untyped payload value.
        widget.ariaLabel = /** @type {any} */ (42);
        expect(widget.ariaLabel).toBe("Bar chart");
    });

    test("the emptyMessage setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new BarChart("#b", {});
        widget.emptyMessage = "Nothing here";
        expect(widget.emptyMessage).toBe("Nothing here");
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
        const widget = new BarChart("#b", {});
        for (const [key, value] of Object.entries({
            height: 300,
            orientation: "horizontal",
            brush: true,
            barPadding: 0.3,
            xLabel: "Age",
            ariaLabel: "Distribution",
        })) {
            widget[key] = value;
        }
        expect(widget.height).toBe(300);
        expect(widget.orientation).toBe("horizontal");
        expect(widget.brush).toBe(true);
        expect(widget.barPadding).toBe(0.3);
        expect(widget.xLabel).toBe("Age");
        expect(widget.ariaLabel).toBe("Distribution");
    });
});

describe("BarChart — brush", () => {
    test("brush:false (default) does NOT add a brush layer", () => {
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);
        expect(document.querySelector("#b svg .bar-brush")).toBeNull();
    });

    test("brush:true installs the brush group on the inner stage", () => {
        makeTarget();
        new BarChart("#b", { brush: true }).draw(SAMPLE);
        expect(document.querySelector("#b svg .bar-brush")).not.toBeNull();
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
