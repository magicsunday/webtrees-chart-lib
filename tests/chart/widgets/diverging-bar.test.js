import { afterEach, describe, expect, test } from "@jest/globals";

import DivergingBar from "src/chart/widgets/diverging-bar.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = [
    { label: "-10..-5", value: 5, sign: -1 },
    { label: "-5..0", value: 12, sign: -1 },
    { label: "0..5", value: 28, sign: 1 },
    { label: "5..10", value: 14, sign: 1 },
];

const makeTarget = (id = "d") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("DivergingBar — empty states", () => {
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new DivergingBar("#d", {}).draw([]);
        expect(document.querySelector("#d > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#d svg.wt-diverging-bar")).toBeNull();
    });

    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new DivergingBar("#d", {}).draw(null);
        expect(document.querySelector("#d > .chart-empty-state")).not.toBeNull();
    });

    test("all-zero values fall through to empty-state", () => {
        makeTarget();
        new DivergingBar("#d", {}).draw([
            { label: "L", value: 0, sign: -1 },
            { label: "R", value: 0, sign: 1 },
        ]);
        expect(document.querySelector("#d > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new DivergingBar("#d", { emptyMessage: "keine Differenz" }).draw([]);
        expect(document.querySelector("#d > .chart-empty-state").textContent).toBe(
            "keine Differenz",
        );
    });
});

describe("DivergingBar — rendering", () => {
    test("renders one <rect> per row", () => {
        makeTarget();
        new DivergingBar("#d", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#d svg.wt-diverging-bar rect.bar")).toHaveLength(
            SAMPLE.length,
        );
    });

    test("sign drives the negative / positive CSS class hook", () => {
        makeTarget();
        new DivergingBar("#d", {}).draw(SAMPLE);
        const rects = document.querySelectorAll("#d svg rect.bar");
        const classes = Array.from(rects).map((r) => r.getAttribute("class"));
        expect(classes[0]).toContain("negative");
        expect(classes[1]).toContain("negative");
        expect(classes[2]).toContain("positive");
        expect(classes[3]).toContain("positive");
    });

    test("missing sign defaults to positive (right of zero)", () => {
        makeTarget();
        new DivergingBar("#d", {}).draw([{ label: "x", value: 1 }]);
        const cls = document.querySelector("#d svg rect.bar")?.getAttribute("class") ?? "";
        expect(cls).toContain("positive");
        expect(cls).not.toContain("negative");
    });

    test("aria-label encodes the sign as a leading minus for negative rows", () => {
        makeTarget();
        new DivergingBar("#d", {}).draw(SAMPLE);
        const labels = Array.from(document.querySelectorAll("#d svg rect.bar")).map((r) =>
            r.getAttribute("aria-label"),
        );
        expect(labels[0]).toBe("-10..-5: -5");
        expect(labels[2]).toBe("0..5: 28");
    });

    test("ariaLabel option lands on the host <svg>", () => {
        makeTarget();
        new DivergingBar("#d", { ariaLabel: "Couple age gap" }).draw(SAMPLE);
        expect(document.querySelector("#d svg.wt-diverging-bar").getAttribute("aria-label")).toBe(
            "Couple age gap",
        );
    });

    test("renders the zero-baseline line element", () => {
        makeTarget();
        new DivergingBar("#d", {}).draw(SAMPLE);
        expect(document.querySelector("#d svg line.zero-axis")).not.toBeNull();
    });

    test("redraw replaces the prior svg rather than stacking", () => {
        makeTarget();
        const chart = new DivergingBar("#d", {});
        chart.draw(SAMPLE);
        chart.draw([{ label: "only", value: 4, sign: 1 }]);
        expect(document.querySelectorAll("#d svg.wt-diverging-bar")).toHaveLength(1);
        expect(document.querySelectorAll("#d svg rect.bar")).toHaveLength(1);
    });
});
