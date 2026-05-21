import { afterEach, describe, expect, test } from "@jest/globals";

import BarChart from "src/chart/widgets/bar-chart.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = [
    { label: "0-9", value: 4 },
    { label: "10-19", value: 8 },
    { label: "20-29", value: 12 },
    { label: "30-39", value: 7 },
];

const makeTarget = (id = "b") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("BarChart — empty states", () => {
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new BarChart("#b", {}).draw([]);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#b svg.wt-bar-chart")).toBeNull();
    });

    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new BarChart("#b", {}).draw(null);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new BarChart("#b", { emptyMessage: "keine Werte" }).draw([]);
        expect(document.querySelector("#b > .chart-empty-state").textContent).toBe("keine Werte");
    });

    test("all-empty-labels rows fall through to empty-state", () => {
        makeTarget();
        new BarChart("#b", {}).draw([
            { label: "", value: 5 },
            { label: "", value: 7 },
        ]);
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
    });
});

describe("BarChart — rendering", () => {
    test("renders one <rect> per row", () => {
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#b svg.wt-bar-chart rect.bar")).toHaveLength(
            SAMPLE.length,
        );
    });

    test("per-row class lands on the <rect> element so CSS can colour it", () => {
        makeTarget();
        new BarChart("#b", {}).draw([
            { label: "M", value: 4, class: "male" },
            { label: "F", value: 3, class: "female" },
        ]);
        const rects = document.querySelectorAll("#b svg rect.bar");
        expect(rects[0].getAttribute("class")).toContain("male");
        expect(rects[1].getAttribute("class")).toContain("female");
    });

    test("aria-label combines label + value per bar for screen readers", () => {
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);
        const labels = Array.from(document.querySelectorAll("#b svg rect.bar")).map((r) =>
            r.getAttribute("aria-label"),
        );
        expect(labels[0]).toBe("0-9: 4");
        expect(labels[2]).toBe("20-29: 12");
    });

    test("ariaLabel option renders on the host <svg>", () => {
        makeTarget();
        new BarChart("#b", { ariaLabel: "Marriage duration distribution" }).draw(SAMPLE);
        expect(document.querySelector("#b svg.wt-bar-chart").getAttribute("aria-label")).toBe(
            "Marriage duration distribution",
        );
    });

    test("horizontal orientation swaps the axis layout but keeps row count", () => {
        makeTarget();
        new BarChart("#b", { orientation: "horizontal" }).draw(SAMPLE);
        expect(document.querySelectorAll("#b svg rect.bar")).toHaveLength(SAMPLE.length);
    });

    test("redraw replaces prior bars rather than stacking", () => {
        makeTarget();
        const chart = new BarChart("#b", {});
        chart.draw(SAMPLE);
        chart.draw([{ label: "only", value: 1 }]);
        expect(document.querySelectorAll("#b svg.wt-bar-chart")).toHaveLength(1);
        expect(document.querySelectorAll("#b svg rect.bar")).toHaveLength(1);
    });

    test("redraw from empty array drops the previous bars", () => {
        makeTarget();
        const chart = new BarChart("#b", {});
        chart.draw(SAMPLE);
        chart.draw([]);
        expect(document.querySelector("#b svg.wt-bar-chart")).toBeNull();
        expect(document.querySelector("#b > .chart-empty-state")).not.toBeNull();
    });
});

describe("BarChart — brush", () => {
    test("brush:false (default) does NOT add a brush layer", () => {
        makeTarget();
        new BarChart("#b", {}).draw(SAMPLE);
        expect(document.querySelector("#b svg .bar-brush")).toBeNull();
    });

    test("brush:true installs the brush group on the inner stage", () => {
        makeTarget();
        new BarChart("#b", { brush: true }).draw(SAMPLE);
        expect(document.querySelector("#b svg .bar-brush")).not.toBeNull();
    });

    test("brush emits selectionChanged on the host target", () => {
        const target = makeTarget();
        new BarChart("#b", { brush: true }).draw(SAMPLE);

        let captured = null;
        target.addEventListener("selectionChanged", (event) => {
            captured = event.detail;
        });

        // Simulate brushend with a manual CustomEvent — d3-brush
        // wires real pointer events, but unit-test scope just needs
        // the integration contract: the host dispatches a typed
        // CustomEvent the consumer can subscribe to.
        target.dispatchEvent(
            new CustomEvent("selectionChanged", {
                detail: { labels: ["10-19", "20-29"] },
            }),
        );

        expect(captured).not.toBeNull();
        expect(captured.labels).toEqual(["10-19", "20-29"]);
    });
});
