import { afterEach, describe, expect, test } from "@jest/globals";

import AreaDensity from "src/chart/widgets/area-density.js";
import { targetMaker } from "../../support/make-target.js";

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

const makeTarget = targetMaker("a");

describe("AreaDensity — empty states", () => {
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw([]);
        expect(document.querySelector("#a > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#a svg.msc-area-density")).toBeNull();
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

describe("AreaDensity — axis chrome", () => {
    test("both axes drop the d3 baseline and keep their tick stubs", () => {
        makeTarget();
        new AreaDensity("#a", {}).draw(SAMPLE);

        for (const cls of ["msc-area-density-x-axis", "msc-area-density-y-axis"]) {
            const axis = document.querySelector(`#a svg g.${cls}`);
            expect(axis.querySelector("path.domain")).toBeNull();
            expect(axis.querySelectorAll(".tick line").length).toBeGreaterThan(0);
        }
    });
});
