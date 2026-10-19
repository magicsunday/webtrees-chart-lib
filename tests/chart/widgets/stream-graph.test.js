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

describe("StreamGraph — native get/set accessors", () => {
    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new StreamGraph("#g", {});
        expect(widget.height).toBeUndefined();
        expect(widget.margin).toEqual({ top: 4, right: 24, bottom: 28, left: 24 });
        expect(widget.ariaLabel).toBe("Stream graph");
        expect(widget.emptyMessage).toBe("No data available");
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
});

describe("StreamGraph — tooltip composition (union: __stat total + peak __meta span)", () => {
    test("the tooltip carries a header, a __stat total and an ESCAPED __meta peak SPAN", () => {
        makeTarget();
        // peakInPattern is consumer-supplied, so it reaches the inline __meta
        // span as untrusted content and must be escaped, not rendered as markup.
        new StreamGraph("#g", { i18n: { peakInPattern: "peak <b>{step}</b>" } }).draw(SAMPLE);
        document
            .querySelector("#g path.msc-stream-graph-band")
            ?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const tip = document.querySelector(".msc-chart-tooltip");
        expect(tip.querySelector("strong")).not.toBeNull();
        expect(tip.querySelector(".msc-chart-tooltip__stat")).not.toBeNull();
        const meta = tip.querySelector(".msc-chart-tooltip__meta");
        expect(meta.tagName).toBe("SPAN");
        expect(meta.innerHTML).toContain("&lt;b&gt;");
        expect(meta.querySelector("b")).toBeNull();
    });
});

describe("StreamGraph — axis chrome", () => {
    test("the x-axis drops the baseline and keeps its tick stubs", () => {
        makeTarget();
        new StreamGraph("#g", {}).draw(SAMPLE);

        const axis = document.querySelector("#g svg g.msc-stream-graph-x-axis");
        expect(axis.querySelector("path.domain")).toBeNull();
        expect(axis.querySelectorAll(".tick line").length).toBeGreaterThan(0);
    });

    test("the suppressed y-axis drops the baseline", () => {
        // `ticks(0)` leaves this axis without a single tick, so it has no tick
        // stubs either way — only the baseline removal is observable here.
        makeTarget();
        new StreamGraph("#g", {}).draw(SAMPLE);

        const axis = document.querySelector("#g svg g.msc-stream-graph-y-axis");
        // Both assertions below are absences, which an axis that never rendered
        // would satisfy too. d3-axis stamps its own presentation attributes on
        // the group and the strip does not touch them, so they anchor the
        // premise that the axis ran at all.
        expect(axis.getAttribute("font-family")).toBe("sans-serif");
        expect(axis.querySelector("path.domain")).toBeNull();
        expect(axis.querySelectorAll(".tick")).toHaveLength(0);
    });
});
