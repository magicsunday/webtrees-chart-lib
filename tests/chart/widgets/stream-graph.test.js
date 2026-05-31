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
    test("renders svg.wt-stream-graph with one path.band per name, each carrying data-name", () => {
        makeTarget();
        new StreamGraph("#g", {}).draw(SAMPLE);

        expect(document.querySelector("#g svg.wt-stream-graph")).not.toBeNull();
        const bands = [...document.querySelectorAll("#g svg path.band")];
        expect(bands).toHaveLength(SAMPLE.names.length);
        expect(bands.map((b) => b.getAttribute("data-name")).sort()).toEqual(["Alpha", "Beta"]);

        select("#g").selectAll("path.band").interrupt("stream-graph-enter");
    });

    test("renders an x-axis group of step ticks and a suppressed y-axis", () => {
        makeTarget();
        new StreamGraph("#g", {}).draw(SAMPLE);
        expect(document.querySelector("#g svg .x-axis")).not.toBeNull();
        expect(document.querySelector("#g svg .y-axis")).not.toBeNull();
        // The x-axis carries at least the domain endpoints as ticks.
        expect(document.querySelectorAll("#g svg .x-axis .tick").length).toBeGreaterThan(0);

        select("#g").selectAll("path.band").interrupt("stream-graph-enter");
    });
});

describe("StreamGraph — reduced-motion entrance parity", () => {
    test("renders bands at full opacity (not the held zero)", () => {
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new StreamGraph("#g", { animateOnReveal: true }).draw(SAMPLE);

        // entry(false) sets the final opacity (0.85) + silhouette path directly;
        // the held keyframe leaves bands at opacity 0 on the flat baseline.
        const bands = [...document.querySelectorAll("#g svg path.band")];
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

        const band = document.querySelector("#g svg path.band");
        const name = band.getAttribute("data-name");

        band.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({ source: "stream", predicate: { name } });
        expect(band.classList.contains("is-selected")).toBe(true);

        band.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(calls).toHaveLength(2);
        expect(calls[1]).toEqual({ source: "stream", predicate: null });
        expect(band.classList.contains("is-selected")).toBe(false);

        select("#g").selectAll("path.band").interrupt("stream-graph-enter");
    });
});
