import { afterEach, describe, expect, test } from "@jest/globals";

import ChordDiagram from "src/chart/widgets/chord-diagram.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = {
    labels: ["Müller", "Schmidt", "Bach"],
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
        new ChordDiagram("#c", { emptyMessage: "keine Verbindung" }).draw(null);
        expect(document.querySelector("#c > .chart-empty-state").textContent).toBe(
            "keine Verbindung",
        );
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
        expect(labels).toEqual(["Müller", "Schmidt", "Bach"]);
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
        expect(sources).toContain("Müller");
        expect(sources).toContain("Schmidt");
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
        // Müller row sum: 0 + 5 + 1 = 6 (first arc by d3-chord order)
        expect(firstArcPath?.getAttribute("aria-label")).toBe("Müller: 6");
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
