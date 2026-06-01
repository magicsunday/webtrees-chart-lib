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

    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new DonutChart("#t", {}).draw(null);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("draw(undefined) renders empty-state instead of crashing", () => {
        makeTarget();
        new DonutChart("#t", {}).draw(undefined);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("draw with all-zero values renders empty-state", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: 0 },
            { label: "B", value: 0 },
        ]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage option surfaces in placeholder text", () => {
        makeTarget();
        new DonutChart("#t", { emptyMessage: "No data yet" }).draw([]);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe("No data yet");
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

    test("rows with non-finite values are coerced to 0 and dropped", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([
            { label: "A", value: 5 },
            { label: "NaN", value: Number.NaN },
            { label: "Infinity", value: Number.POSITIVE_INFINITY },
            { label: "null", value: null },
            { label: "string", value: "5" },
        ]);
        expect(document.querySelectorAll("#t svg path")).toHaveLength(1);
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

    test("missing label is coerced to empty string, no crash", () => {
        makeTarget();
        new DonutChart("#t", {}).draw([{ value: 5 }]);
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
    test("svg viewBox is square with side = min(width, height)", () => {
        const el = makeTarget("t", { width: 400, height: 200 });
        new DonutChart(el, {}).draw(SAMPLE);
        const svg = document.querySelector("#t svg");
        expect(svg.getAttribute("viewBox")).toBe("-100 -100 200 200");
        expect(svg.getAttribute("width")).toBe("200");
        expect(svg.getAttribute("height")).toBe("200");
    });

    test("padding shrinks the rendered outer radius (side / 2 − padding)", () => {
        makeTarget("t", { width: 200, height: 200 });
        new DonutChart("#t", { padding: 10 }).draw([{ label: "A", value: 1 }]);
        const r10 = radiiOf(
            document.querySelector("#t svg path.msc-donut-chart-slice").getAttribute("d"),
        ).outer;

        makeTarget("t2", { width: 200, height: 200 });
        new DonutChart("#t2", { padding: 30 }).draw([{ label: "A", value: 1 }]);
        const r30 = radiiOf(
            document.querySelector("#t2 svg path.msc-donut-chart-slice").getAttribute("d"),
        ).outer;

        expect(r10).toBeCloseTo(90, 0); // 200 / 2 − padding(10)
        expect(r30).toBeCloseTo(70, 0); // 200 / 2 − padding(30)
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
        new DonutChart("#t", { animateOnReveal: true }).draw(SAMPLE);

        // Under reduced motion _runEntry takes the entry(false) branch, which
        // sets the final arc + advances each node's `_current` to the full datum
        // (endAngle > startAngle). The held keyframe would leave a zero sweep.
        const paths = [...document.querySelectorAll("#t svg path")];
        expect(paths.length).toBe(SAMPLE.length);
        const swept = paths.filter(
            (p) => p._current !== undefined && p._current.endAngle > p._current.startAngle,
        );
        expect(swept.length).toBe(paths.length);
    });
});

describe("DonutChart — native get/set accessors", () => {
    test("getters read back the values supplied via the options object", () => {
        makeTarget();
        const w = new DonutChart("#t", {
            width: 300,
            height: 220,
            padding: 12,
            holeSize: 40,
            centerLabel: "Members",
            centerValue: "230",
            emptyMessage: "Nothing here",
        });
        expect(w.width).toBe(300);
        expect(w.height).toBe(220);
        expect(w.padding).toBe(12);
        expect(w.holeSize).toBe(40);
        expect(w.centerLabel).toBe("Members");
        expect(w.centerValue).toBe("230");
        expect(w.emptyMessage).toBe("Nothing here");
    });

    test("getters return the documented defaults when options are omitted", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        expect(w.width).toBeUndefined();
        expect(w.height).toBeUndefined();
        expect(w.padding).toBe(1);
        expect(w.holeSize).toBeUndefined();
        expect(w.centerLabel).toBe("");
        expect(w.centerValue).toBe("");
        expect(w.emptyMessage).toBe("No data available");
    });

    test("setters mutate the backing field after construction", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        w.width = 500;
        w.height = 400;
        w.padding = 8;
        w.holeSize = 0;
        w.centerLabel = "People";
        w.centerValue = "12";
        w.emptyMessage = "Empty";
        expect(w.width).toBe(500);
        expect(w.height).toBe(400);
        expect(w.padding).toBe(8);
        expect(w.holeSize).toBe(0);
        expect(w.centerLabel).toBe("People");
        expect(w.centerValue).toBe("12");
        expect(w.emptyMessage).toBe("Empty");
    });

    test("width setter clears the override for non-positive / non-finite input", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY, "300", null]) {
            w.width = /** @type {any} */ (bad);
            expect(w.width).toBeUndefined();
        }
    });

    test("height setter clears the override for non-positive / non-finite input", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "250", null, {}]) {
            w.height = /** @type {any} */ (bad);
            expect(w.height).toBeUndefined();
        }
    });

    test("padding setter falls back to the default for invalid input", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        for (const bad of [0, -2, Number.NaN, Number.POSITIVE_INFINITY, "1", null]) {
            w.padding = /** @type {any} */ (bad);
            expect(w.padding).toBe(1);
        }
    });

    test("holeSize setter honours explicit 0 but clears for negative / non-numeric input", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        w.holeSize = 0;
        expect(w.holeSize).toBe(0);
        for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "10", null, {}]) {
            w.holeSize = /** @type {any} */ (bad);
            expect(w.holeSize).toBeUndefined();
        }
    });

    test("string setters reset to their default for non-string input", () => {
        makeTarget();
        const w = new DonutChart("#t", {
            centerLabel: "L",
            centerValue: "V",
            emptyMessage: "E",
        });
        for (const bad of [123, null, undefined, {}, []]) {
            w.centerLabel = /** @type {any} */ (bad);
            w.centerValue = /** @type {any} */ (bad);
            w.emptyMessage = /** @type {any} */ (bad);
            expect(w.centerLabel).toBe("");
            expect(w.centerValue).toBe("");
            expect(w.emptyMessage).toBe("No data available");
        }
    });

    test("empty-string centerLabel / centerValue are preserved", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        w.centerLabel = "";
        w.centerValue = "";
        expect(w.centerLabel).toBe("");
        expect(w.centerValue).toBe("");
    });

    test("dispatcher Object.entries → widget[k] = v applies every option", () => {
        makeTarget();
        const w = new DonutChart("#t", {});
        const config = {
            width: 320,
            height: 280,
            padding: 6,
            holeSize: 50,
            centerLabel: "Total",
            centerValue: "99",
            emptyMessage: "No rows",
        };
        for (const [key, value] of Object.entries(config)) {
            /** @type {any} */ (w)[key] = value;
        }
        expect(w.width).toBe(320);
        expect(w.height).toBe(280);
        expect(w.padding).toBe(6);
        expect(w.holeSize).toBe(50);
        expect(w.centerLabel).toBe("Total");
        expect(w.centerValue).toBe("99");
        expect(w.emptyMessage).toBe("No rows");
    });

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
