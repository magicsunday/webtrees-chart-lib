import { afterEach, describe, expect, test } from "@jest/globals";

import GaugeArc from "src/chart/widgets/gauge-arc.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const makeTarget = (id = "t") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("GaugeArc — empty + error states", () => {
    test("draw(null) renders empty-state, no svg", () => {
        makeTarget();
        new GaugeArc("#t", {}).draw(null);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("draw(undefined) renders empty-state instead of crashing", () => {
        makeTarget();
        new GaugeArc("#t", {}).draw(undefined);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("non-finite value renders empty-state", () => {
        makeTarget();
        new GaugeArc("#t", {}).draw({ value: Number.NaN });
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("scalar Infinity renders empty-state", () => {
        makeTarget();
        new GaugeArc("#t", {}).draw(Number.POSITIVE_INFINITY);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("non-numeric string renders empty-state", () => {
        makeTarget();
        new GaugeArc("#t", {}).draw("not-a-number");
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage option surfaces in placeholder text", () => {
        makeTarget();
        new GaugeArc("#t", { emptyMessage: "No coverage yet" }).draw(null);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe(
            "No coverage yet",
        );
    });
});

describe("GaugeArc — neutral DOM contract", () => {
    test("renders svg.wt-gauge-arc with track + filled arc paths", () => {
        makeTarget();
        new GaugeArc("#t", {}).draw({ value: 75 });
        expect(document.querySelector("#t svg.wt-gauge-arc")).not.toBeNull();
        // Two stroked paths: the track (painted first) and the filled arc.
        expect(document.querySelectorAll("#t svg.wt-gauge-arc path")).toHaveLength(2);
    });

    test("headline value lives in text.wt-gauge-arc-value with a % suffix tspan", () => {
        makeTarget();
        new GaugeArc("#t", {}).draw({ value: 75 });
        const valueText = document.querySelector("#t svg .wt-gauge-arc-value");
        expect(valueText).not.toBeNull();
        const tspans = valueText.querySelectorAll("tspan");
        expect(tspans).toHaveLength(2);
        expect(tspans[0].textContent).toBe("75");
        expect(tspans[1].getAttribute("class")).toBe("wt-gauge-arc-suffix");
        expect(tspans[1].textContent).toBe("%");
    });

    test("filled arc takes the accent option as its stroke", () => {
        makeTarget();
        new GaugeArc("#t", { accent: "rebeccapurple" }).draw({ value: 50 });
        const paths = document.querySelectorAll("#t svg.wt-gauge-arc path");
        expect(paths[1].getAttribute("stroke")).toBe("rebeccapurple");
    });
});

describe("GaugeArc — value coercion", () => {
    // One row per sanitizeValue input shape (scalar, {value} wrapper, string)
    // and per formatValue branch (one-decimal vs integer fallback).
    test("accepts a bare scalar identically to the {value} wrapper", () => {
        makeTarget();
        new GaugeArc("#t", {}).draw(60);
        expect(document.querySelector("#t svg .wt-gauge-arc-value tspan").textContent).toBe("60");
    });

    test("coerces a numeric string payload to its number", () => {
        makeTarget();
        new GaugeArc("#t", {}).draw("60");
        expect(document.querySelector("#t svg .wt-gauge-arc-value tspan").textContent).toBe("60");
    });

    test("clamps above 100 and below 0", () => {
        makeTarget("hi");
        new GaugeArc("#hi", {}).draw({ value: 150 });
        expect(document.querySelector("#hi .wt-gauge-arc-value tspan").textContent).toBe("100");

        makeTarget("lo");
        new GaugeArc("#lo", {}).draw({ value: -10 });
        expect(document.querySelector("#lo .wt-gauge-arc-value tspan").textContent).toBe("0");
    });

    test("formats one decimal but drops a trailing .0", () => {
        makeTarget("a");
        new GaugeArc("#a", {}).draw({ value: 33.33 });
        expect(document.querySelector("#a .wt-gauge-arc-value tspan").textContent).toBe("33.3");

        makeTarget("b");
        new GaugeArc("#b", {}).draw({ value: 50 });
        expect(document.querySelector("#b .wt-gauge-arc-value tspan").textContent).toBe("50");
    });
});

describe("GaugeArc — redraw", () => {
    test("a second draw replaces the previous svg, never stacks", () => {
        makeTarget();
        const widget = new GaugeArc("#t", {});
        widget.draw({ value: 25 });
        widget.draw({ value: 80 });
        expect(document.querySelectorAll("#t svg.wt-gauge-arc")).toHaveLength(1);
        expect(document.querySelector("#t .wt-gauge-arc-value tspan").textContent).toBe("80");
    });
});
