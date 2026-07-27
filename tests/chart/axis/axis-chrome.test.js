import { describe, expect, test } from "@jest/globals";
import { axisBottom } from "d3-axis";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";

import { stripAxisDomainPath, stripAxisTickLines } from "src/chart/axis/axis-chrome.js";

/**
 * Render a real d3 axis into a jsdom `<svg>` and hand back its group selection.
 * d3-axis emits `path.domain` (the baseline) plus one `g.tick` per tick, each
 * carrying a `line` stub and a `text` label — the exact node set the helpers
 * operate on.
 *
 * @returns {import("d3-selection").Selection<SVGGElement, unknown, null, undefined>} The axis group selection.
 */
const renderAxis = () => {
    document.body.innerHTML = "<svg></svg>";

    return select(document.querySelector("svg"))
        .append("g")
        .call(axisBottom(scaleLinear().domain([0, 10]).range([0, 100])));
};

describe("stripAxisDomainPath", () => {
    test("removes the d3 baseline path", () => {
        const axisGroup = renderAxis();
        expect(axisGroup.node().querySelector("path.domain")).not.toBeNull();

        stripAxisDomainPath(axisGroup);

        expect(axisGroup.node().querySelector("path.domain")).toBeNull();
    });

    test("leaves the ticks — stubs and labels — standing, so the two removals stay independent", () => {
        // Counted on both node sets, not merely non-empty: with eleven ticks on
        // the fixture, a helper that took a few stubs or labels with it would
        // still leave plenty behind.
        const axisGroup = renderAxis();
        const stubs = axisGroup.node().querySelectorAll(".tick line").length;
        const labels = axisGroup.node().querySelectorAll(".tick text").length;
        expect(stubs).toBeGreaterThan(1);
        expect(labels).toBeGreaterThan(1);

        stripAxisDomainPath(axisGroup);

        expect(axisGroup.node().querySelectorAll(".tick line")).toHaveLength(stubs);
        expect(axisGroup.node().querySelectorAll(".tick text")).toHaveLength(labels);
    });
});

describe("stripAxisTickLines", () => {
    test("removes every per-tick stub line", () => {
        const axisGroup = renderAxis();

        stripAxisTickLines(axisGroup);

        expect(axisGroup.node().querySelectorAll(".tick line")).toHaveLength(0);
    });

    test("keeps the tick labels — only the stubs go, never the ticks themselves", () => {
        // Guards the selector: removing `.tick` rather than `.tick line` would
        // strip the labels the axis exists for. One label per tick has to
        // survive, so losing all but one does not pass as "kept".
        const axisGroup = renderAxis();
        const ticks = axisGroup.node().querySelectorAll("g.tick").length;
        expect(ticks).toBeGreaterThan(1);

        stripAxisTickLines(axisGroup);

        expect(axisGroup.node().querySelectorAll(".tick text")).toHaveLength(ticks);
    });

    test("leaves the baseline standing — the two removals stay independent", () => {
        const axisGroup = renderAxis();

        stripAxisTickLines(axisGroup);

        expect(axisGroup.node().querySelector("path.domain")).not.toBeNull();
    });
});
