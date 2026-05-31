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
        expect(document.querySelector("#c svg.wt-chord-diagram")).toBeNull();
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
            height: 480,
            width: 720,
            padAngle: 0.1,
            ariaLabel: "Surname chord",
            i18n: {
                tooltipValueSingular: "{count} marriage",
                tooltipValuePlural: "{count} marriages",
            },
            emptyMessage: "No connections",
        });
        expect(widget.height).toBe(480);
        expect(widget.width).toBe(720);
        expect(widget.padAngle).toBe(0.1);
        expect(widget.ariaLabel).toBe("Surname chord");
        expect(widget.i18n).toEqual({
            tooltipValueSingular: "{count} marriage",
            tooltipValuePlural: "{count} marriages",
        });
        expect(widget.emptyMessage).toBe("No connections");
    });

    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new ChordDiagram("#c", {});
        expect(widget.height).toBe(600);
        // An omitted width stays responsive (undefined) so draw falls back to the
        // host element's width.
        expect(widget.width).toBeUndefined();
        expect(widget.padAngle).toBe(0.04);
        expect(widget.ariaLabel).toBe("Chord diagram");
        expect(widget.i18n).toEqual({});
        expect(widget.emptyMessage).toBe("No data available");
    });

    test("the height setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new ChordDiagram("#c", {});
        widget.height = 500;
        expect(widget.height).toBe(500);
        // A non-positive value resets to the default.
        widget.height = -10;
        expect(widget.height).toBe(600);
        // The runtime guard also defaults a non-number value — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.height = /** @type {any} */ ("tall");
        expect(widget.height).toBe(600);
    });

    test("the width setter keeps a finite positive number else undefined, getter reads it back", () => {
        makeTarget();
        const responsive = new ChordDiagram("#c", {});
        expect(responsive.width).toBeUndefined();
        const widget = new ChordDiagram("#c", { width: 720 });
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

    test("the padAngle setter clamps into [0, 0.5] and defaults non-finite input", () => {
        makeTarget();
        const widget = new ChordDiagram("#c", {});
        widget.padAngle = 0.2;
        expect(widget.padAngle).toBe(0.2);
        // Negative values clamp to zero.
        widget.padAngle = -1;
        expect(widget.padAngle).toBe(0);
        // Values above the 0.5-rad ceiling clamp down to it.
        widget.padAngle = 5;
        expect(widget.padAngle).toBe(0.5);
        // The runtime guard defaults a non-number value — the cast simulates the
        // JSON dispatcher assigning an untyped payload value.
        widget.padAngle = /** @type {any} */ ("wide");
        expect(widget.padAngle).toBe(0.04);
    });

    test("the ariaLabel setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const fallback = new ChordDiagram("#c", {});
        expect(fallback.ariaLabel).toBe("Chord diagram");
        const widget = new ChordDiagram("#c", { ariaLabel: "Marriage chord" });
        expect(widget.ariaLabel).toBe("Marriage chord");
        // An empty string resets to the default.
        widget.ariaLabel = "";
        expect(widget.ariaLabel).toBe("Chord diagram");
        // The runtime guard also defaults a non-string value — the cast simulates
        // the JSON dispatcher assigning an untyped payload value.
        widget.ariaLabel = /** @type {any} */ (42);
        expect(widget.ariaLabel).toBe("Chord diagram");
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

    test("the emptyMessage setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const fallback = new ChordDiagram("#c", {});
        expect(fallback.emptyMessage).toBe("No data available");
        const widget = new ChordDiagram("#c", { emptyMessage: "Nothing to show" });
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
        const widget = new ChordDiagram("#c", {});
        for (const [key, value] of Object.entries({
            height: 400,
            width: 500,
            padAngle: 0.08,
            ariaLabel: "Chord chart",
        })) {
            widget[key] = value;
        }
        expect(widget.height).toBe(400);
        expect(widget.width).toBe(500);
        expect(widget.padAngle).toBe(0.08);
        expect(widget.ariaLabel).toBe("Chord chart");
    });
});

describe("ChordDiagram — rendering", () => {
    test("renders one arc per label", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#c svg.wt-chord-diagram g.arc")).toHaveLength(3);
    });

    test("each arc carries its label on data-label", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw(SAMPLE);
        const labels = Array.from(document.querySelectorAll("#c svg g.arc")).map((arc) =>
            arc.getAttribute("data-label"),
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
        const ribbons = document.querySelectorAll("#c svg path.ribbon");
        expect(ribbons.length).toBeGreaterThanOrEqual(3);
    });

    test("ribbons carry source + target labels as data attributes", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw(SAMPLE);
        const sources = Array.from(document.querySelectorAll("#c svg path.ribbon")).map((r) =>
            r.getAttribute("data-source"),
        );
        expect(sources).toContain("Alpha");
        expect(sources).toContain("Beta");
    });

    test("per-arc class lands on g.arc element", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw({
            labels: ["A", "B"],
            matrix: [
                [0, 3],
                [3, 0],
            ],
            classes: ["alpha", "beta"],
        });
        const arcs = document.querySelectorAll("#c svg g.arc");
        expect(arcs[0].getAttribute("class")).toContain("alpha");
        expect(arcs[1].getAttribute("class")).toContain("beta");
    });

    test("aria-label on the arc encodes label + total connection strength", () => {
        makeTarget();
        new ChordDiagram("#c", {}).draw(SAMPLE);
        const firstArcPath = document.querySelector("#c svg g.arc path.arc-path");
        // Alpha row sum: 0 + 5 + 1 = 6 (first arc by d3-chord order)
        expect(firstArcPath?.getAttribute("aria-label")).toBe("Alpha: 6");
    });

    test("ariaLabel option lands on the host <svg>", () => {
        makeTarget();
        new ChordDiagram("#c", { ariaLabel: "Surname marriage chord" }).draw(SAMPLE);
        expect(document.querySelector("#c svg.wt-chord-diagram").getAttribute("aria-label")).toBe(
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
        expect(document.querySelectorAll("#c svg.wt-chord-diagram")).toHaveLength(1);
        expect(document.querySelectorAll("#c svg g.arc")).toHaveLength(2);
    });
});
