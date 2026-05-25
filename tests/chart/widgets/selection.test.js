import { afterEach, describe, expect, test } from "@jest/globals";

import BarChart from "src/chart/widgets/bar-chart.js";
import DonutChart from "src/chart/widgets/donut-chart.js";
import SankeyFlow from "src/chart/widgets/sankey-flow.js";
import StreamGraph from "src/chart/widgets/stream-graph.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const DONUT_DATA = [
    { label: "Male", value: 120 },
    { label: "Female", value: 130 },
    { label: "Unknown", value: 10 },
];

const BAR_DATA = [
    { label: "0-9", value: 4 },
    { label: "10-19", value: 8 },
    { label: "20-29", value: 12 },
];

const makeTarget = (id = "x") => {
    document.body.innerHTML = `<div id="${id}" style="width: 400px; height: 400px;"></div>`;
    return document.getElementById(id);
};

describe("Selection emitter — shared BaseWidget behaviour", () => {
    test("DonutChart click fires onSelectionChanged with the slice predicate", () => {
        makeTarget();
        const chart = new DonutChart("#x", { source: "donut.sex" });
        let received = null;
        chart.onSelectionChanged((payload) => {
            received = payload;
        });
        chart.draw(DONUT_DATA);
        document.querySelector("#x svg path.slice").dispatchEvent(new MouseEvent("click"));
        expect(received).not.toBeNull();
        expect(received.source).toBe("donut.sex");
        expect(received.predicate).toEqual({ slice: "Male" });
    });

    test("DonutChart second click on the same slice clears the predicate", () => {
        makeTarget();
        const chart = new DonutChart("#x", {});
        const events = [];
        chart.onSelectionChanged((payload) => events.push(payload));
        chart.draw(DONUT_DATA);
        const firstSlice = document.querySelector("#x svg path.slice");
        firstSlice.dispatchEvent(new MouseEvent("click"));
        firstSlice.dispatchEvent(new MouseEvent("click"));
        expect(events).toHaveLength(2);
        expect(events[0].predicate).toEqual({ slice: "Male" });
        expect(events[1].predicate).toBeNull();
    });

    test("DonutChart only toggles .is-selected, never sets inline opacity", () => {
        makeTarget();
        const chart = new DonutChart("#x", {});
        chart.onSelectionChanged(() => undefined);
        chart.draw(DONUT_DATA);
        const slices = document.querySelectorAll("#x svg path.slice");
        slices[1].dispatchEvent(new MouseEvent("click"));
        expect(slices[1].classList.contains("is-selected")).toBe(true);
        expect(slices[0].classList.contains("is-selected")).toBe(false);
        // Visual dim is a host-stylesheet concern; the widget
        // never touches inline opacity (would otherwise shadow
        // the consumer's :hover CSS).
        for (const slice of slices) {
            expect(slice.style.opacity).toBe("");
        }
    });

    test("DonutChart re-click clears every .is-selected class", () => {
        makeTarget();
        const chart = new DonutChart("#x", {});
        chart.onSelectionChanged(() => undefined);
        chart.draw(DONUT_DATA);
        const slices = document.querySelectorAll("#x svg path.slice");
        slices[1].dispatchEvent(new MouseEvent("click"));
        slices[1].dispatchEvent(new MouseEvent("click"));
        for (const slice of slices) {
            expect(slice.classList.contains("is-selected")).toBe(false);
            expect(slice.style.opacity).toBe("");
        }
    });

    test("BarChart click fires onSelectionChanged with the row label predicate", () => {
        makeTarget();
        const chart = new BarChart("#x", { source: "bar.age" });
        let received = null;
        chart.onSelectionChanged((payload) => {
            received = payload;
        });
        chart.draw(BAR_DATA);
        document.querySelector("#x svg path.bar").dispatchEvent(new MouseEvent("click"));
        expect(received).not.toBeNull();
        expect(received.source).toBe("bar.age");
        expect(received.predicate).toEqual({ label: "0-9" });
    });

    test("BarChart click on different rows replaces (not toggles) the selection", () => {
        makeTarget();
        const chart = new BarChart("#x", {});
        const events = [];
        chart.onSelectionChanged((payload) => events.push(payload));
        chart.draw(BAR_DATA);
        const paths = document.querySelectorAll("#x svg path.bar");
        paths[0].dispatchEvent(new MouseEvent("click"));
        paths[2].dispatchEvent(new MouseEvent("click"));
        expect(events).toHaveLength(2);
        expect(events[0].predicate).toEqual({ label: "0-9" });
        expect(events[1].predicate).toEqual({ label: "20-29" });
    });

    test("BaseWidget._samePredicate treats keys + primitive values as equal", () => {
        makeTarget();
        const chart = new DonutChart("#x", {});
        expect(chart._samePredicate({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
        expect(chart._samePredicate({ a: 1 }, { a: 2 })).toBe(false);
        expect(chart._samePredicate({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        expect(chart._samePredicate(null, { a: 1 })).toBe(false);
        expect(chart._samePredicate({ a: 1 }, null)).toBe(false);
    });

    test("source defaults to empty string when not configured", () => {
        makeTarget();
        const chart = new DonutChart("#x", {});
        let received = null;
        chart.onSelectionChanged((payload) => {
            received = payload;
        });
        chart.draw(DONUT_DATA);
        document.querySelector("#x svg path.slice").dispatchEvent(new MouseEvent("click"));
        expect(received.source).toBe("");
    });

    test("StreamGraph click fires onSelectionChanged with the band name predicate", () => {
        makeTarget();
        const chart = new StreamGraph("#x", { source: "stream.names" });
        let received = null;
        chart.onSelectionChanged((payload) => {
            received = payload;
        });
        chart.draw({
            decades: [1900, 1910, 1920],
            series: [
                { name: "Anna", values: [1, 3, 2] },
                { name: "Karl", values: [2, 1, 4] },
            ],
        });
        const band = document.querySelector("#x svg path.band");
        if (band !== null) {
            band.dispatchEvent(new MouseEvent("click"));
            expect(received).not.toBeNull();
            expect(received.source).toBe("stream.names");
            expect(received.predicate).toEqual(
                expect.objectContaining({ name: expect.any(String) }),
            );
        }
    });

    test("SankeyFlow click fires onSelectionChanged with the source/target predicate", () => {
        makeTarget();
        const chart = new SankeyFlow("#x", { source: "sankey.migration" });
        let received = null;
        chart.onSelectionChanged((payload) => {
            received = payload;
        });
        chart.draw([
            { source: "DE", target: "US", value: 5 },
            { source: "DE", target: "FR", value: 2 },
        ]);
        const link = document.querySelector("#x svg path.link");
        if (link !== null) {
            link.dispatchEvent(new MouseEvent("click"));
            expect(received).not.toBeNull();
            expect(received.source).toBe("sankey.migration");
            expect(received.predicate).toEqual({
                source: expect.any(String),
                target: expect.any(String),
            });
        }
    });

    test("onSelectionChanged() with a non-function detaches the callback", () => {
        makeTarget();
        const chart = new DonutChart("#x", {});
        let count = 0;
        chart.onSelectionChanged(() => {
            count += 1;
        });
        chart.draw(DONUT_DATA);
        document.querySelector("#x svg path.slice").dispatchEvent(new MouseEvent("click"));
        chart.onSelectionChanged(null);
        document.querySelector("#x svg path.slice").dispatchEvent(new MouseEvent("click"));
        expect(count).toBe(1);
    });
});
