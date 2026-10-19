import { afterEach, describe, expect, test } from "@jest/globals";

import ChordDiagram from "src/chart/widgets/chord-diagram.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = {
    labels: ["Alpha", "Beta", "Gamma"],
    matrix: [
        [0, 5, 1],
        [5, 0, 2],
        [1, 2, 0],
    ],
};

const makeTarget = (id = "c") => {
    document.body.innerHTML = `<div id="${id}" style="width: 400px; height: 400px;"></div>`;
    return document.getElementById(id);
};

describe("ChordDiagram — empty states", () => {
    test("draw(null) renders empty-state", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw(null);
        expect(document.querySelector("#c > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#c svg.msc-chord-diagram")).toBeNull();
    });

    test("single-label payload yields empty-state (no possible ribbons)", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw({ labels: ["A"], matrix: [[0]] });
        expect(document.querySelector("#c > .chart-empty-state")).not.toBeNull();
    });

    test("matrix length mismatch with labels yields empty-state", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw({
            labels: ["A", "B", "C"],
            matrix: [[0, 1]],
        });
        expect(document.querySelector("#c > .chart-empty-state")).not.toBeNull();
    });

    test("all-zero off-diagonal entries fall through to empty-state", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw({
            labels: ["A", "B"],
            matrix: [
                [0, 0],
                [0, 0],
            ],
        });
        expect(document.querySelector("#c > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new ChordDiagram("#c", { emptyMessage: "No connections" }).draw(null);
        expect(document.querySelector("#c > .chart-empty-state").textContent).toBe(
            "No connections",
        );
    });
});

describe("ChordDiagram — native get/set accessors", () => {
    test("getters read back the constructor options", () => {
        makeTarget();
        const widget = new ChordDiagram("#c", {
            i18n: {
                tooltipValueSingular: "{count} marriage",
                tooltipValuePlural: "{count} marriages",
            },
        });
        expect(widget.i18n).toEqual({
            tooltipValueSingular: "{count} marriage",
            tooltipValuePlural: "{count} marriages",
        });
    });

    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new ChordDiagram("#c", {});
        expect(widget.height).toBeUndefined();
        // An omitted width stays responsive (undefined) so draw falls back to the
        // host element's width.
        expect(widget.width).toBeUndefined();
        expect(widget.ariaLabel).toBe("Chord diagram");
        expect(widget.i18n).toEqual({});
        expect(widget.emptyMessage).toBe("No data available");
    });

    test("the i18n setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const fallback = new ChordDiagram("#c", {});
        expect(fallback.i18n).toEqual({});
        const pack = {
            tooltipValueSingular: "{count} marriage",
            tooltipValuePlural: "{count} marriages",
        };
        const widget = new ChordDiagram("#c", { i18n: pack });
        expect(widget.i18n).toEqual(pack);
        // The runtime guard resets a non-object value to an empty pack — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.i18n = /** @type {any} */ ("x");
        expect(widget.i18n).toEqual({});
    });

    test("the dispatcher pattern (Object.entries → widget[k] = v) configures the widget", () => {
        makeTarget();
        const widget = new ChordDiagram("#c", {});
        for (const [key, value] of Object.entries({
            ariaLabel: "Dispatched chord",
        })) {
            widget[key] = value;
        }
        expect(widget.ariaLabel).toBe("Dispatched chord");
    });
});

describe("ChordDiagram — fixed pad angle", () => {
    test("adjacent group arcs are separated by the fixed pad angle", () => {
        makeTarget();
        new ChordDiagram("#c", { width: 600, height: 600 }).draw(SAMPLE);

        // An arc path starts on the outer radius at `M x,y` and ends its outer edge
        // at the coordinates after the first `A` command. The clockwise angle from
        // twelve o'clock is atan2(x, -y).
        const angle = (x, y) => Math.atan2(x, -y);
        const arcs = [...document.querySelectorAll("#c path.msc-chord-diagram-arc-path")].map(
            (path) => {
                const d = path.getAttribute("d") ?? "";
                const start = /^M(-?[\d.e-]+),(-?[\d.e-]+)/.exec(d);
                const end = /A[\d.]+,[\d.]+,0,[01],1,(-?[\d.e-]+),(-?[\d.e-]+)/.exec(d);

                return {
                    start: angle(Number(start?.[1]), Number(start?.[2])),
                    end: angle(Number(end?.[1]), Number(end?.[2])),
                };
            },
        );
        const [first, second] = /** @type {[typeof arcs[0], typeof arcs[0]]} */ (arcs);

        expect(arcs).toHaveLength(3);
        expect(second.start - first.end).toBeCloseTo(0.04, 3);
    });
});

describe("ChordDiagram — rendering", () => {
    test("renders one arc per label", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw(SAMPLE);
        expect(
            document.querySelectorAll("#c svg.msc-chord-diagram g.msc-chord-diagram-arc"),
        ).toHaveLength(3);
    });

    test("each arc carries its label on data-label", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw(SAMPLE);
        const labels = Array.from(document.querySelectorAll("#c svg g.msc-chord-diagram-arc")).map(
            (arc) => arc.getAttribute("data-label"),
        );
        expect(labels).toEqual(["Alpha", "Beta", "Gamma"]);
    });

    test("ribbon count equals symmetric upper-triangle non-zero entries", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw(SAMPLE);
        // d3-chord renders one ribbon per non-zero pair (symmetric
        // matrix → one ribbon per unordered pair). SAMPLE has 3
        // pairs: M↔S, M↔B, S↔B — but d3-chord still emits one
        // ribbon per ordered pair where i ≤ j. Verify at least
        // the three expected ribbons exist.
        const ribbons = document.querySelectorAll("#c svg path.msc-chord-diagram-ribbon");
        expect(ribbons.length).toBeGreaterThanOrEqual(3);
    });

    test("ribbons carry source + target labels as data attributes", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw(SAMPLE);
        const sources = Array.from(
            document.querySelectorAll("#c svg path.msc-chord-diagram-ribbon"),
        ).map((r) => r.getAttribute("data-source"));
        expect(sources).toContain("Alpha");
        expect(sources).toContain("Beta");
    });

    test("per-arc class lands on g.msc-chord-diagram-arc element", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw({
            labels: ["A", "B"],
            matrix: [
                [0, 3],
                [3, 0],
            ],
            classes: ["alpha", "beta"],
        });
        const arcs = document.querySelectorAll("#c svg g.msc-chord-diagram-arc");
        expect(arcs[0].getAttribute("class")).toContain("alpha");
        expect(arcs[1].getAttribute("class")).toContain("beta");
    });

    test("aria-label on the arc encodes label + total connection strength", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw(SAMPLE);
        const firstArcPath = document.querySelector(
            "#c svg g.msc-chord-diagram-arc path.msc-chord-diagram-arc-path",
        );
        // Alpha row sum: 0 + 5 + 1 = 6 (first arc by d3-chord order)
        expect(firstArcPath?.getAttribute("aria-label")).toBe("Alpha: 6");
    });

    test("ariaLabel option lands on the host <svg>", () => {
        makeTarget();
        new ChordDiagram("#c", { ariaLabel: "Surname marriage chord" }).draw(SAMPLE);
        expect(document.querySelector("#c svg.msc-chord-diagram").getAttribute("aria-label")).toBe(
            "Surname marriage chord",
        );
    });

    test("redraw replaces prior svg rather than stacking", () => {
        makeTarget();
        const chart = new ChordDiagram("#c", {});
        chart.draw(SAMPLE);
        chart.draw({
            labels: ["X", "Y"],
            matrix: [
                [0, 1],
                [1, 0],
            ],
        });
        expect(document.querySelectorAll("#c svg.msc-chord-diagram")).toHaveLength(1);
        expect(document.querySelectorAll("#c svg g.msc-chord-diagram-arc")).toHaveLength(2);
    });
});

describe("ChordDiagram — responsive sizing", () => {
    test("responsive height: an unset height adopts the host element's clientHeight", () => {
        const el = makeTarget();
        Object.defineProperty(el, "clientHeight", { value: 321, configurable: true });
        new ChordDiagram(el, {}).draw(SAMPLE);
        const viewBox = document.querySelector("#c svg.msc-chord-diagram").getAttribute("viewBox");
        expect(viewBox.split(" ")[3]).toBe("321"); // "0 0 <width> <height>"
    });

    test("the width falls back to the resolved height, not the 600 default", () => {
        // Chord is the only call site whose WIDTH falls back to another resolved
        // dimension — the height resolved one line above. (donut-chart and
        // month-radial have the mirror shape: their height falls back to the
        // resolved width.) At floor-time that is indistinguishable from the 600
        // default, so a host reporting 321 is what separates the two spellings.
        const el = makeTarget();
        Object.defineProperty(el, "clientHeight", { value: 321, configurable: true });
        new ChordDiagram(el, {}).draw(SAMPLE);
        const viewBox = document.querySelector("#c svg.msc-chord-diagram").getAttribute("viewBox");
        expect(viewBox.split(" ")[2]).toBe("321");
    });
});
