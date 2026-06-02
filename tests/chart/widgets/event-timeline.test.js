import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import EventTimeline from "src/chart/widgets/event-timeline.js";

// Reduced motion makes _runEntry jump straight to the final keyframe, so every
// dot reaches its resting radius synchronously — a d3 transition never ticks
// under jsdom.
beforeEach(() => {
    window.matchMedia = (query) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
    });
});

afterEach(() => {
    document.body.innerHTML = "";
});

const makeTarget = (id = "t") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

// Domain-neutral year-keyed marks; the widget carries no subject of its own.
const SAMPLE = [
    { year: 1828, value: 8 },
    { year: 1814, value: 3 },
    { year: 1816, value: 7 },
    { year: 1934, value: 8 },
];

describe("EventTimeline — empty + invalid states", () => {
    test("draw(null) renders empty-state, no svg", () => {
        makeTarget();
        new EventTimeline("#t", {}).draw(null);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("draw(undefined) renders empty-state instead of crashing", () => {
        makeTarget();
        new EventTimeline("#t", {}).draw(undefined);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("draw([]) renders empty-state", () => {
        makeTarget();
        new EventTimeline("#t", {}).draw([]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("rows with a non-finite year or a non-positive value are dropped", () => {
        makeTarget();
        new EventTimeline("#t", {}).draw([
            { year: Number.NaN, value: 5 },
            { year: 1900, value: 0 },
            { year: 1900, value: -3 },
        ]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("custom emptyMessage option surfaces in placeholder text", () => {
        makeTarget();
        new EventTimeline("#t", { emptyMessage: "No clusters recorded" }).draw([]);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe(
            "No clusters recorded",
        );
    });
});

describe("EventTimeline — neutral DOM contract", () => {
    test("renders svg.msc-event-timeline with a baseline, a year axis and one dot per mark", () => {
        makeTarget();
        new EventTimeline("#t", {}).draw(SAMPLE);
        expect(document.querySelector("#t svg.msc-event-timeline")).not.toBeNull();
        expect(document.querySelector("#t svg line.msc-event-timeline-baseline")).not.toBeNull();
        expect(document.querySelector("#t svg g.msc-event-timeline-axis")).not.toBeNull();
        expect(document.querySelectorAll("#t svg circle.msc-event-timeline-dot")).toHaveLength(4);
    });

    test("prints the magnitude inside each dot, in year order", () => {
        makeTarget();
        new EventTimeline("#t", {}).draw(SAMPLE);
        const counts = [...document.querySelectorAll("#t text.msc-event-timeline-count")].map(
            (node) => node.textContent,
        );
        // Marks are sorted ascending by year regardless of input order.
        expect(counts).toEqual(["3", "7", "8", "8"]);
    });

    test("the year axis carries plain integer year ticks (no thousands separator)", () => {
        makeTarget();
        new EventTimeline("#t", {}).draw(SAMPLE);
        const tickLabels = [
            ...document.querySelectorAll("#t g.msc-event-timeline-axis .tick text"),
        ].map((node) => node.textContent);
        expect(tickLabels.length).toBeGreaterThan(0);
        for (const label of tickLabels) {
            expect(label).toMatch(/^\d{4}$/);
        }
    });

    test("a larger magnitude yields a larger dot radius (area-proportional sizing)", () => {
        makeTarget();
        new EventTimeline("#t", {}).draw(SAMPLE);
        const radii = [...document.querySelectorAll("#t circle.msc-event-timeline-dot")].map(
            (node) => Number(node.getAttribute("r")),
        );
        // Sorted by year: [1814→3, 1816→7, 1828→8, 1934→8]. The count-3 dot is
        // the smallest; the two count-8 dots share the largest radius.
        expect(radii[0]).toBeLessThan(radii[1]);
        expect(radii[1]).toBeLessThan(radii[2]);
        expect(radii[2]).toBe(radii[3]);
    });

    test("dots take the accent option as their fill", () => {
        makeTarget();
        new EventTimeline("#t", { accent: "rebeccapurple" }).draw(SAMPLE);
        const dots = document.querySelectorAll("#t circle.msc-event-timeline-dot");
        for (const dot of dots) {
            expect(dot.getAttribute("fill")).toBe("rebeccapurple");
        }
    });

    test("a per-row class is appended to the matching dot", () => {
        makeTarget();
        new EventTimeline("#t", {}).draw([{ year: 1900, value: 4, class: "is-peak" }]);
        const dot = document.querySelector("#t circle.msc-event-timeline-dot");
        expect(dot.getAttribute("class")).toBe("msc-event-timeline-dot is-peak");
    });

    test("a single mark renders one dot without collapsing the year scale", () => {
        makeTarget();
        new EventTimeline("#t", {}).draw([{ year: 1900, value: 5 }]);
        const dots = document.querySelectorAll("#t circle.msc-event-timeline-dot");
        expect(dots).toHaveLength(1);
        expect(Number(dots[0].getAttribute("cx"))).toBeGreaterThan(0);
    });

    test("a single-year payload still labels the axis with whole years only", () => {
        makeTarget();
        // One distinct year pads the domain to a 2-year span, where d3 would
        // otherwise emit half-year ticks (1899.5, 1900.5); they must be blanked.
        new EventTimeline("#t", {}).draw([{ year: 1900, value: 5 }]);
        const labels = [...document.querySelectorAll("#t g.msc-event-timeline-axis .tick text")]
            .map((node) => node.textContent)
            .filter((text) => text !== "");
        expect(labels.length).toBeGreaterThan(0);
        for (const label of labels) {
            expect(label).toMatch(/^\d{4}$/);
        }
    });
});

describe("EventTimeline — tooltip", () => {
    test("a dot's tooltip shows the year and magnitude by default", () => {
        makeTarget();
        new EventTimeline("#t", {}).draw(SAMPLE);
        const dot = document.querySelector("#t circle.msc-event-timeline-dot");
        dot?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const text = document.querySelector(".msc-chart-tooltip")?.textContent ?? "";
        // First dot is the earliest year (1814) with three siblings.
        expect(text).toContain("1814");
        expect(text).toContain("3");
    });

    test("tooltip and tooltipLabel overrides replace the default body and header", () => {
        makeTarget();
        // tooltipLabel deliberately differs from the year so the header-override
        // branch is behaviourally distinguished from the default (year) header.
        new EventTimeline("#t", {}).draw([
            {
                year: 1900,
                value: 5,
                tooltipLabel: "Peak year",
                tooltip: "5 siblings of one family",
            },
        ]);
        const dot = document.querySelector("#t circle.msc-event-timeline-dot");
        dot?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const text = document.querySelector(".msc-chart-tooltip")?.textContent ?? "";
        expect(text).toContain("Peak year");
        expect(text).toContain("5 siblings of one family");
    });
});

describe("EventTimeline — redraw", () => {
    test("a second draw replaces the previous svg, never stacks", () => {
        makeTarget();
        const widget = new EventTimeline("#t", {});
        widget.draw(SAMPLE);
        widget.draw([{ year: 1900, value: 2 }]);
        expect(document.querySelectorAll("#t svg.msc-event-timeline")).toHaveLength(1);
        expect(document.querySelectorAll("#t circle.msc-event-timeline-dot")).toHaveLength(1);
    });
});

describe("EventTimeline — native get/set accessors", () => {
    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new EventTimeline("#t", {});
        expect(widget.accent).toBe("currentColor");
        expect(widget.ariaLabel).toBe("Event timeline");
    });

    test("getters read back the constructor options", () => {
        makeTarget();
        const widget = new EventTimeline("#t", { accent: "teal", ariaLabel: "Sibling losses" });
        expect(widget.accent).toBe("teal");
        expect(widget.ariaLabel).toBe("Sibling losses");
    });
});

describe("EventTimeline — entry behaviour", () => {
    const noReducedMotion = () => {
        window.matchMedia = (query) => ({
            matches: false,
            media: query,
            addEventListener() {},
            removeEventListener() {},
        });
    };

    test("with animateOnReveal the entry is held (deferred) instead of run inline", () => {
        noReducedMotion();
        makeTarget();
        const widget = new EventTimeline("#t", { animateOnReveal: true });
        widget.draw(SAMPLE);
        // The held closure distinguishes "deferred" from "ran": under jsdom a
        // transition never ticks, so the held initial keyframe (r=0) stays.
        expect(typeof widget._entry).toBe("function");
        const radii = [...document.querySelectorAll("#t circle.msc-event-timeline-dot")].map(
            (node) => Number(node.getAttribute("r")),
        );
        expect(radii.every((r) => r === 0)).toBe(true);
    });

    test("the default (inline) entry path does not leave a held closure", () => {
        noReducedMotion();
        makeTarget();
        const widget = new EventTimeline("#t", {});
        widget.draw(SAMPLE);
        expect(widget._entry).toBeNull();
    });

    test("an empty redraw retires the held entry so a later playEntry is a no-op", () => {
        noReducedMotion();
        makeTarget();
        const widget = new EventTimeline("#t", { animateOnReveal: true });
        widget.draw(SAMPLE);
        widget.draw([]);
        expect(widget._entry).toBeNull();
        expect(() => widget.playEntry()).not.toThrow();
    });
});
