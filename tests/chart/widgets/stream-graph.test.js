import { afterEach, describe, expect, test } from "@jest/globals";
import { select } from "d3-selection";

import StreamGraph from "src/chart/widgets/stream-graph.js";

afterEach(() => {
    document.body.innerHTML = "";
    // Drop any reduced-motion override so it can't leak into other tests.
    window.matchMedia = undefined;
});

const SAMPLE = {
    steps: [1900, 1910, 1920],
    names: ["Alpha", "Beta"],
    series: {
        Alpha: { 1900: 5, 1910: 8, 1920: 6 },
        Beta: { 1900: 3, 1910: 4, 1920: 9 },
    },
};

const makeTarget = (id = "g") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("StreamGraph — empty + error states", () => {
    test.each([
        ["null", null],
        ["undefined", undefined],
        ["non-array steps", { steps: "1900", names: ["A"] }],
        ["non-array names", { steps: [1900], names: "A" }],
        ["empty steps", { steps: [], names: ["A"] }],
        ["empty names", { steps: [1900], names: [] }],
    ])("draw(%s) renders empty-state, no svg", (_label, input) => {
        makeTarget();
        new StreamGraph("#g", {}).draw(input);
        expect(document.querySelector("#g > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#g svg")).toBeNull();
    });
});

describe("StreamGraph — neutral DOM contract", () => {
    test("renders svg.msc-stream-graph with one path.msc-stream-graph-band per name, each carrying data-name", () => {
        makeTarget();
        new StreamGraph("#g", {}).draw(SAMPLE);

        expect(document.querySelector("#g svg.msc-stream-graph")).not.toBeNull();
        const bands = [...document.querySelectorAll("#g svg path.msc-stream-graph-band")];
        expect(bands).toHaveLength(SAMPLE.names.length);
        expect(bands.map((b) => b.getAttribute("data-name")).sort()).toEqual(["Alpha", "Beta"]);

        select("#g").selectAll("path.msc-stream-graph-band").interrupt("stream-graph-enter");
    });

    test("renders an x-axis group of step ticks and a suppressed y-axis", () => {
        makeTarget();
        new StreamGraph("#g", {}).draw(SAMPLE);
        expect(document.querySelector("#g svg .msc-stream-graph-x-axis")).not.toBeNull();
        expect(document.querySelector("#g svg .msc-stream-graph-y-axis")).not.toBeNull();
        // The x-axis carries at least the domain endpoints as ticks.
        expect(
            document.querySelectorAll("#g svg .msc-stream-graph-x-axis .tick").length,
        ).toBeGreaterThan(0);

        select("#g").selectAll("path.msc-stream-graph-band").interrupt("stream-graph-enter");
    });
});

describe("StreamGraph — reduced-motion entrance parity", () => {
    test("renders bands at full opacity (not the held zero)", () => {
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new StreamGraph("#g", { animateOnReveal: true }).draw(SAMPLE);

        // entry(false) sets the final opacity (0.85) + silhouette path directly;
        // the held keyframe leaves bands at opacity 0 on the flat baseline.
        const bands = [...document.querySelectorAll("#g svg path.msc-stream-graph-band")];
        expect(bands.length).toBeGreaterThan(0);
        expect(bands.every((b) => b.getAttribute("opacity") === "0.85")).toBe(true);
    });
});

describe("StreamGraph — selection", () => {
    test("a band click invokes onSelectionChanged with the name predicate, toggling off on repeat", () => {
        makeTarget();
        const calls = [];
        const widget = new StreamGraph("#g", { source: "stream" });
        widget.onSelectionChanged((payload) => calls.push(payload));
        widget.draw(SAMPLE);

        const band = document.querySelector("#g svg path.msc-stream-graph-band");
        const name = band.getAttribute("data-name");

        band.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({ source: "stream", predicate: { name } });
        expect(band.classList.contains("is-selected")).toBe(true);

        band.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(calls).toHaveLength(2);
        expect(calls[1]).toEqual({ source: "stream", predicate: null });
        expect(band.classList.contains("is-selected")).toBe(false);

        select("#g").selectAll("path.msc-stream-graph-band").interrupt("stream-graph-enter");
    });
});

describe("StreamGraph — native get/set accessors", () => {
    test("getters read back the constructor options", () => {
        makeTarget();
        const widget = new StreamGraph("#g", {
            height: 320,
            margin: { top: 10, right: 30, bottom: 40, left: 20 },
        });
        expect(widget.height).toBe(320);
        expect(widget.margin).toEqual({ top: 10, right: 30, bottom: 40, left: 20 });
    });

    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new StreamGraph("#g", {});
        expect(widget.height).toBeUndefined();
        expect(widget.margin).toEqual({ top: 4, right: 24, bottom: 28, left: 24 });
    });

    test("the height setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new StreamGraph("#g", {});
        widget.height = 500;
        expect(widget.height).toBe(500);
        // A non-positive value clears the override (responsive sizing).
        widget.height = -1;
        expect(widget.height).toBeUndefined();
        // The runtime guard also clears the override for a non-number value — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.height = /** @type {any} */ ("tall");
        expect(widget.height).toBeUndefined();
    });

    test("the margin setter merges caller keys over the defaults", () => {
        makeTarget();
        const widget = new StreamGraph("#g", {});
        widget.margin = { left: 50 };
        expect(widget.margin).toEqual({ top: 4, right: 24, bottom: 28, left: 50 });
        // A missing value resets to the full default set.
        widget.margin = /** @type {any} */ (undefined);
        expect(widget.margin).toEqual({ top: 4, right: 24, bottom: 28, left: 24 });
    });

    test("the width setter keeps a finite positive number else undefined, getter reads it back", () => {
        makeTarget();
        // An omitted width stays responsive (undefined) so draw falls back to the
        // host element's width.
        const responsive = new StreamGraph("#g", {});
        expect(responsive.width).toBeUndefined();
        // An explicit positive width reads back unchanged.
        const widget = new StreamGraph("#g", { width: 720 });
        expect(widget.width).toBe(720);
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

    test("the ariaLabel setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted ariaLabel exposes the default accessible name.
        const fallback = new StreamGraph("#g", {});
        expect(fallback.ariaLabel).toBe("Stream graph");
        // A custom string reads back unchanged.
        const widget = new StreamGraph("#g", { ariaLabel: "Decade composition" });
        expect(widget.ariaLabel).toBe("Decade composition");
        // An empty string resets to the default.
        widget.ariaLabel = "";
        expect(widget.ariaLabel).toBe("Stream graph");
        // The runtime guard also defaults a non-string value — the cast simulates
        // the JSON dispatcher assigning an untyped payload value.
        widget.ariaLabel = /** @type {any} */ (42);
        expect(widget.ariaLabel).toBe("Stream graph");
    });

    test("the i18n setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted i18n pack exposes an empty object so lookups fall back.
        const fallback = new StreamGraph("#g", {});
        expect(fallback.i18n).toEqual({});
        // A custom object reads back unchanged.
        const pack = { totalSingular: "{count} Person", totalPlural: "{count} Personen" };
        const widget = new StreamGraph("#g", { i18n: pack });
        expect(widget.i18n).toEqual(pack);
        // The runtime guard resets a non-object value to an empty pack — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.i18n = /** @type {any} */ ("x");
        expect(widget.i18n).toEqual({});
    });

    test("the emptyMessage setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted emptyMessage exposes the default placeholder text.
        const fallback = new StreamGraph("#g", {});
        expect(fallback.emptyMessage).toBe("No data available");
        // A custom string reads back unchanged.
        const widget = new StreamGraph("#g", { emptyMessage: "Nothing to show" });
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
        const widget = new StreamGraph("#g", {});
        for (const [key, value] of Object.entries({
            height: 360,
            margin: { top: 8 },
            width: 640,
            ariaLabel: "Composition over time",
            emptyMessage: "Empty",
        })) {
            widget[key] = value;
        }
        expect(widget.height).toBe(360);
        expect(widget.margin).toEqual({ top: 8, right: 24, bottom: 28, left: 24 });
        expect(widget.width).toBe(640);
        expect(widget.ariaLabel).toBe("Composition over time");
        expect(widget.emptyMessage).toBe("Empty");
    });
});

describe("StreamGraph — responsive sizing", () => {
    test("responsive height: an unset height adopts the host element's clientHeight", () => {
        const el = makeTarget();
        Object.defineProperty(el, "clientHeight", { value: 321, configurable: true });
        new StreamGraph(el, {}).draw(SAMPLE);
        const viewBox = document.querySelector("#g svg.msc-stream-graph").getAttribute("viewBox");
        expect(viewBox.split(" ")[3]).toBe("321"); // "0 0 <width> <height>"
    });
});
