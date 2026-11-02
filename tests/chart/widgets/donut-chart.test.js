import { afterEach, describe, expect, test } from "@jest/globals";

import DonutChart from "src/chart/widgets/donut-chart.js";

afterEach(() => {
    document.body.innerHTML = "";
    // Drop any reduced-motion override so it can't leak into other tests.
    window.matchMedia = undefined;
});

const SAMPLE = [
    { label: "Male", value: 120, class: "male" },
    { label: "Female", value: 105, class: "female" },
    { label: "Unknown", value: 5, class: "unknown" },
];

const makeTarget = (id = "t", { width = 250, height = 250 } = {}) => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    const el = document.getElementById(id);
    Object.defineProperty(el, "clientWidth", { value: width });
    Object.defineProperty(el, "clientHeight", { value: height });
    return el;
};

// A single full-circle slice degenerates to a radial spoke
// `M0,-<outer>L0,-<inner>Z`, exposing the rendered outer and inner radius
// directly as the two y-magnitudes (a full pie reports inner = 0).
const radiiOf = (pathD) => {
    const ys = [...pathD.matchAll(/[ML]0,(-?\d+(?:\.\d+)?)/g)].map((m) => Math.abs(Number(m[1])));
    return { outer: ys[0], inner: ys[1] };
};

describe("DonutChart — empty + error states", () => {
    test("draw([]) renders empty-state, no svg", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("draw with all-zero values renders empty-state", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: 0 },
            { label: "B", value: 0 },
        ]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });
});

describe("DonutChart — slice rendering", () => {
    test("creates one path per slice", () => {
        makeTarget();
        new DonutChart("#t", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(3);
    });

    test("each slice carries the provided class prefix and class", () => {
        makeTarget();
        new DonutChart("#t", {}).draw(SAMPLE);
        const classes = Array.from(document.querySelectorAll("#t svg path")).map((p) =>
            p.getAttribute("class"),
        );
        expect(classes).toEqual([
            "msc-donut-chart-slice male",
            "msc-donut-chart-slice female",
            "msc-donut-chart-slice unknown",
        ]);
    });

    test("slice without explicit class falls back to bare 'msc-donut-chart-slice'", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([{ label: "X", value: 5 }]);
        expect(document.querySelector("#t svg path").getAttribute("class")).toBe(
            "msc-donut-chart-slice",
        );
    });

    test("no native <title> child on slice paths (tooltip handled by chart-lib overlay)", () => {
        makeTarget();
        new DonutChart("#t", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#t svg path title")).toHaveLength(0);
    });

    test("inline fill style set when option fill present, omitted otherwise", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: 5 },
            { label: "B", value: 5, fill: "#ff0" },
        ]);
        const paths = document.querySelectorAll("#t svg path");
        expect(paths[0].style.fill).toBe("");
        expect(paths[1].style.fill).toBe("#ff0");
    });

    test("redraw replaces previous svg, does not stack", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        w.draw(SAMPLE);
        w.draw([{ label: "A", value: 1 }]);
        expect(document.querySelectorAll("#t svg")).toHaveLength(1);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(1);
    });

    test("redraw from data → empty replaces svg with empty-state", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        w.draw(SAMPLE);
        w.draw([]);
        expect(document.querySelector("#t svg")).toBeNull();
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("redraw from empty → data replaces empty-state with svg", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        w.draw([]);
        w.draw(SAMPLE);
        expect(document.querySelectorAll("#t > .chart-empty-state")).toHaveLength(0);
        expect(document.querySelectorAll("#t svg")).toHaveLength(1);
    });
});

describe("DonutChart — value sanitization", () => {
    test("rows with null/undefined entries are skipped, not crashing", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([null, undefined, { label: "A", value: 5 }]);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(1);
    });

    test("rows with non-finite or zero values are dropped, a numeric string is read as its number", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: 5 },
            { label: "NaN", value: Number.NaN },
            { label: "Infinity", value: Number.POSITIVE_INFINITY },
            { label: "null", value: null },
            { label: "string", value: "5" },
        ]);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(2);
    });

    test("negative values are dropped, do not poison angles", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: 100 },
            { label: "B", value: -30 },
        ]);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(1);
    });

    test("entirely-non-finite dataset falls through to empty-state", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: Number.NaN },
            { label: "B", value: -1 },
        ]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("a row without a label is dropped, no crash", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([{ value: 5 }, { label: "A", value: 5 }]);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(1);
    });
});

describe("DonutChart — fill", () => {
    test("fill is set as inline style (not attribute) so it beats CSS", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([{ label: "X", value: 5, fill: "#ff0" }]);
        const path = document.querySelector("#t svg path");
        expect(path.style.fill).toBe("#ff0");
        expect(path.hasAttribute("fill")).toBe(false);
    });
});

describe("DonutChart — sizing + options", () => {
    test("svg fills the width × height box; the donut centres in it (side = min)", () => {
        const el = makeTarget("t", { width: 400, height: 200 });
        new DonutChart(el, {}).draw(SAMPLE);
        const svg = document.querySelector("#t svg");
        // The svg now spans the full box; the donut (side = min(400, 200) = 200)
        // is centred within it via the slices-group transform.
        expect(svg.getAttribute("viewBox")).toBe("0 0 400 200");
        expect(svg.getAttribute("width")).toBe("400");
        expect(svg.getAttribute("height")).toBe("200");
        expect(
            document.querySelector("#t svg g.msc-donut-chart-slices").getAttribute("transform"),
        ).toBe("translate(200, 100)");
    });

    test("an unset height falls back to the resolved width so the donut stays square", () => {
        const el = makeTarget("t", { width: 300, height: 0 });
        new DonutChart(el, {}).draw(SAMPLE);
        const svg = document.querySelector("#t svg");
        expect(svg.getAttribute("viewBox")).toBe("0 0 300 300");
        expect(
            document.querySelector("#t svg g.msc-donut-chart-slices").getAttribute("transform"),
        ).toBe("translate(150, 150)");
    });

    test("a per-side margin insets the available box and shifts the donut centre", () => {
        const el = makeTarget("t", { width: 300, height: 300 });
        // Reserve 100px on the right (e.g. for a legend): availW = 200, availH =
        // 300, side = 200, centre x = 0 + 200/2 = 100, y = 300/2 = 150.
        new DonutChart(el, { margin: { right: 100 } }).draw(SAMPLE);
        const group = document.querySelector("#t svg g.msc-donut-chart-slices");
        expect(group.getAttribute("transform")).toBe("translate(100, 150)");
        // The donut shrinks to the inset box: side = min(200, 300) = 200.
        const radius = radiiOf(
            document.querySelector("#t svg path.msc-donut-chart-slice").getAttribute("d"),
        ).outer;
        expect(radius).toBe(100 - 1); // side/2 − default padding(1)
    });

    test("centre text tracks the donut centre, not the svg origin", () => {
        const el = makeTarget("t", { width: 400, height: 200 });
        new DonutChart(el, { centerLabel: "Total", centerValue: "42" }).draw(SAMPLE);
        const value = document.querySelector("#t svg text.msc-donut-chart-center-value");
        expect(value.getAttribute("x")).toBe("200");
        // y = centre(100) − 8 when a label is present.
        expect(value.getAttribute("y")).toBe("92");
        const label = document.querySelector("#t svg text.msc-donut-chart-center-label");
        expect(label.getAttribute("x")).toBe("200");
        expect(label.getAttribute("y")).toBe("118"); // centre(100) + 18
    });

    test("explicit holeSize sets the rendered inner radius", () => {
        makeTarget("t", { width: 200, height: 200 });
        new DonutChart("#t", { holeSize: 40 }).draw([{ label: "A", value: 1 }]);
        const { outer, inner } = radiiOf(
            document.querySelector("#t svg path.msc-donut-chart-slice").getAttribute("d"),
        );

        expect(outer).toBeCloseTo(99, 0); // 200 / 2 − default padding(1)
        expect(inner).toBeCloseTo(40, 0); // explicit holeSize
    });

    test("omitted holeSize derives a non-zero hole; holeSize 0 collapses to a full pie", () => {
        makeTarget("t", { width: 200, height: 200 });
        new DonutChart("#t", {}).draw([{ label: "A", value: 1 }]);
        const annulus = radiiOf(
            document.querySelector("#t svg path.msc-donut-chart-slice").getAttribute("d"),
        );

        makeTarget("t2", { width: 200, height: 200 });
        new DonutChart("#t2", { holeSize: 0 }).draw([{ label: "A", value: 1 }]);
        const pie = radiiOf(
            document.querySelector("#t2 svg path.msc-donut-chart-slice").getAttribute("d"),
        );

        // Omitted holeSize derives a default hole (radius − radius / 10).
        expect(annulus.inner).toBeCloseTo(89.1, 1); // 99 − 99 / 10
        expect(annulus.inner).toBeGreaterThan(0);
        // Explicit 0 collapses the hole to the centre.
        expect(pie.inner).toBe(0);
    });
});

describe("DonutChart — reduced-motion entrance parity", () => {
    test("renders slices at their final swept arc (not the held zero-sweep)", () => {
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new DonutChart("#t", {}).draw(SAMPLE);
        const plainArcs = [...document.querySelectorAll("#t svg path")].map((path) =>
            path.getAttribute("d"),
        );

        // Under reduced motion the reveal entry jumps to the final arc at once, so a
        // widget that would hold the zero-sweep keyframe draws the same arcs as one
        // that never animates. The held keyframe would leave a zero sweep.
        makeTarget();
        new DonutChart("#t", { animateOnReveal: true }).draw(SAMPLE);
        const revealArcs = [...document.querySelectorAll("#t svg path")].map((path) =>
            path.getAttribute("d"),
        );

        expect(plainArcs).toHaveLength(SAMPLE.length);
        expect(revealArcs).toEqual(plainArcs);

        // A zero sweep ends its outer arc where it starts; every real slice does not.
        for (const arc of revealArcs) {
            const [, startX, startY, endX, endY] = arc.match(
                /^M(-?[\d.e-]+),(-?[\d.e-]+)A[^,]+,[^,]+,\d,\d,\d,(-?[\d.e-]+),(-?[\d.e-]+)/,
            );
            expect([endX, endY]).not.toEqual([startX, startY]);
        }
    });
});

describe("DonutChart — native get/set accessors", () => {
    test("draw honours the emptyMessage set after construction", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        w.emptyMessage = "Set later";
        w.draw([]);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe("Set later");
    });

    test("draw reflects centerValue / centerLabel set after construction", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        w.centerValue = "Custom";
        w.centerLabel = "Caption";
        w.draw(SAMPLE);
        expect(document.querySelector("#t .msc-donut-chart-center-value").textContent).toBe(
            "Custom",
        );
        expect(document.querySelector("#t .msc-donut-chart-center-label").textContent).toBe(
            "Caption",
        );
    });
});

describe("DonutChart — tooltip composition (union: share suffix)", () => {
    test("the stat line appends ` · <share>%` when the total is positive", () => {
        makeTarget();
        new DonutChart("#t", {}).draw(SAMPLE);
        document
            .querySelector("#t path.msc-donut-chart-slice")
            ?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const stat =
            document.querySelector(".msc-chart-tooltip .msc-chart-tooltip__stat")?.textContent ??
            "";
        expect(stat).toContain(" · ");
        expect(stat.endsWith("%")).toBe(true);
    });

    test("tooltipLabel and tooltipBody override the header and the body of the tooltip", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: 5, tooltipLabel: "Header text", tooltipBody: "Body text" },
        ]);
        document
            .querySelector("#t path.msc-donut-chart-slice")
            ?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const tooltip = document.querySelector(".msc-chart-tooltip");

        expect(tooltip?.textContent).toContain("Header text");
        expect(tooltip?.querySelector(".msc-chart-tooltip__stat")?.textContent).toContain(
            "Body text",
        );
    });
});

describe("DonutChart — detached host fallback", () => {
    test("a host that measures zero renders at the widget's own default size", () => {
        // With nothing measured, the site-specific fallback constant is what remains.
        const el = makeTarget("t", { width: 0, height: 0 });
        new DonutChart(el, {}).draw(SAMPLE);
        expect(el.querySelector("svg").getAttribute("viewBox")).toBe("0 0 250 250");
    });
});
