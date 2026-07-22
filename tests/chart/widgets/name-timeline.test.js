import { afterEach, describe, expect, test } from "@jest/globals";

import NameTimeline from "src/chart/widgets/name-timeline.js";

afterEach(() => {
    document.body.innerHTML = "";
});

// One active row (no value — pinned to the axis end) plus three dated rows
// spanning the [1900, 2000] inactive extent.
const SAMPLE = [
    { label: "Eva", active: true, meta: "32×" },
    { label: "Karl", value: 2000, meta: "47×" },
    { label: "Mid", value: 1950, meta: "10×" },
    { label: "Anna", value: 1900, meta: "95×" },
];

const makeTarget = (id = "t") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

const dotLeft = (index) => document.querySelectorAll("#t .msc-name-timeline-dot")[index].style.left;
const lineWidth = (index) =>
    document.querySelectorAll("#t .msc-name-timeline-line")[index].style.width;

describe("NameTimeline — empty states", () => {
    test("draw([]) renders empty-state, no timeline", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw([]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t .msc-name-timeline")).toBeNull();
    });

    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw(null);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("inactive rows with non-finite values are dropped; an all-invalid set is empty", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw([{ label: "A", value: Number.NaN }, { label: "B" }]);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new NameTimeline("#t", { emptyMessage: "No names" }).draw([]);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe("No names");
    });
});

describe("NameTimeline — structure", () => {
    test("renders a two-ended axis and one row per item", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#t > div.msc-name-timeline")).toHaveLength(1);
        expect(document.querySelectorAll("#t .msc-name-timeline-axis > span")).toHaveLength(2);
        expect(document.querySelectorAll("#t ol.msc-name-timeline-rows > li")).toHaveLength(4);
    });

    test("each row carries a label, a stem line, a dot, and a primary caption", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw(SAMPLE);
        const karl = document.querySelectorAll("#t .msc-name-timeline-row")[1];
        expect(karl.querySelector(".msc-name-timeline-label").textContent).toBe("Karl");
        expect(
            karl.querySelector(".msc-name-timeline-track .msc-name-timeline-line"),
        ).not.toBeNull();
        expect(
            karl.querySelector(".msc-name-timeline-track .msc-name-timeline-dot"),
        ).not.toBeNull();
        expect(karl.querySelector(".msc-name-timeline-primary").textContent).toBe("2000");
    });

    test("the secondary caption renders only when meta is present", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw([
            { label: "WithMeta", value: 1950, meta: "9×" },
            { label: "NoMeta", value: 1950 },
        ]);
        const rows = document.querySelectorAll("#t .msc-name-timeline-row");
        expect(rows[0].querySelector(".msc-name-timeline-secondary").textContent).toBe("9×");
        expect(rows[1].querySelector(".msc-name-timeline-secondary")).toBeNull();
    });
});

describe("NameTimeline — active rows", () => {
    test("active row gets is-active, sits at the axis end, and shows the activeLabel", () => {
        makeTarget();
        new NameTimeline("#t", { activeLabel: "in use" }).draw(SAMPLE);
        const eva = document.querySelectorAll("#t .msc-name-timeline-row")[0];
        expect(eva.classList.contains("is-active")).toBe(true);
        expect(eva.querySelector(".msc-name-timeline-dot").style.left).toBe("100%");
        expect(eva.querySelector(".msc-name-timeline-line").style.width).toBe("100%");
        expect(eva.querySelector(".msc-name-timeline-primary").textContent).toBe("in use");
    });

    test("inactive rows do not gain is-active", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw(SAMPLE);
        const rows = document.querySelectorAll("#t .msc-name-timeline-row");
        expect(rows[1].classList.contains("is-active")).toBe(false);
    });
});

describe("NameTimeline — positioning", () => {
    test("inactive dots map onto the value extent: min 0%, mid 50%, max 100%", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw(SAMPLE);
        // index 0 = active Eva (100%), 1 = Karl 2000 (max), 2 = Mid 1950, 3 = Anna 1900 (min)
        expect(dotLeft(1)).toBe("100%");
        expect(dotLeft(2)).toBe("50%");
        expect(dotLeft(3)).toBe("0%");
    });

    test("the stem line width tracks the dot position", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw(SAMPLE);
        expect(lineWidth(2)).toBe("50%");
        expect(lineWidth(3)).toBe("0%");
    });

    test("valueMin / valueMax pin the axis domain and clamp out-of-range dots", () => {
        makeTarget();
        new NameTimeline("#t", { valueMin: 1800, valueMax: 2100 }).draw([
            { label: "Mid", value: 1950 },
            { label: "Below", value: 1700 },
        ]);
        expect(dotLeft(0)).toBe("50%"); // (150/300)
        expect(dotLeft(1)).toBe("0%"); // clamped below the pinned minimum
    });

    test("a collapsed inactive extent centres the dots", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw([
            { label: "A", value: 1900 },
            { label: "B", value: 1900 },
        ]);
        expect(dotLeft(0)).toBe("50%");
        expect(dotLeft(1)).toBe("50%");
    });

    test("the axis ends caption the resolved domain via the formatter", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw(SAMPLE);
        const ends = document.querySelectorAll("#t .msc-name-timeline-axis > span");
        expect([ends[0].textContent, ends[1].textContent]).toEqual(["1900", "2000"]);
    });
});

describe("NameTimeline — options", () => {
    test("maxItems trims the list (after sanitisation)", () => {
        makeTarget();
        new NameTimeline("#t", { maxItems: 2 }).draw(SAMPLE);
        expect(document.querySelectorAll("#t .msc-name-timeline-row")).toHaveLength(2);
    });

    test("formatter customises inactive captions and axis ticks", () => {
        makeTarget();
        new NameTimeline("#t", { formatter: (v) => `${v} CE` }).draw([{ label: "A", value: 1900 }]);
        expect(document.querySelector("#t .msc-name-timeline-primary").textContent).toBe("1900 CE");
        expect(document.querySelector("#t .msc-name-timeline-axis > span").textContent).toBe(
            "1899 CE",
        );
    });

    test("default formatter emits a plain integer string without locale grouping", () => {
        makeTarget();
        // A four-digit year must not gain a thousands separator ("2,000").
        new NameTimeline("#t", {}).draw([{ label: "A", value: 2000 }]);
        expect(document.querySelector("#t .msc-name-timeline-primary").textContent).toBe("2000");
    });
});

describe("NameTimeline — maxItems / formatter accessors", () => {
    // The accessors live on NameTimeline itself (it is the only list-style
    // widget), so their mechanics are pinned here rather than on the base. The
    // draw-level `options` tests above cover the rendered result; these cover the
    // accessor seam the JSON dispatcher assigns through — floor, reset-not-keep,
    // and the non-callable fallback — which drawing alone does not isolate.
    test("an omitted maxItems leaves the dataset uncapped", () => {
        makeTarget();
        expect(new NameTimeline("#t", {}).maxItems).toBe(Number.POSITIVE_INFINITY);
    });

    test("a caller cap is truncated to a whole number of rows", () => {
        makeTarget();
        // A fractional cap cannot mean "render 4.9 rows"; it floors.
        expect(new NameTimeline("#t", { maxItems: 4.9 }).maxItems).toBe(4);
    });

    test("a rejected maxItems resets to uncapped rather than keeping the previous cap", () => {
        makeTarget();
        const w = new NameTimeline("#t", { maxItems: 3 });
        w.maxItems = /** @type {any} */ (0);
        expect(w.maxItems).toBe(Number.POSITIVE_INFINITY);
    });

    test("an omitted formatter defaults to the exact String reference", () => {
        makeTarget();
        // Pinned by identity, not just output: the default IS `String`, so a
        // future locale-aware default would be a deliberate, test-visible change
        // rather than a silent equivalent-output swap.
        expect(new NameTimeline("#t", {}).formatter).toBe(String);
    });

    test("a caller formatter wins over the default", () => {
        makeTarget();
        const w = new NameTimeline("#t", { formatter: (value) => `${value} ×` });
        expect(w.formatter(12)).toBe("12 ×");
    });

    test.each([
        ["string", "nope"],
        ["null", null],
        ["number", 5],
        ["undefined", undefined],
    ])("a non-callable formatter (%s) resets to the exact String reference", (_label, bad) => {
        makeTarget();
        const w = new NameTimeline("#t", { formatter: (value) => `${value}!` });
        w.formatter = /** @type {any} */ (bad);
        expect(w.formatter).toBe(String);
    });
});

describe("NameTimeline — entrance / reveal", () => {
    test("inline entry (default): the timeline mounts already revealed", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw(SAMPLE);
        const root = document.querySelector("#t .msc-name-timeline");
        expect(root.classList.contains("msc-name-timeline--animate")).toBe(true);
        expect(root.classList.contains("is-revealed")).toBe(true);
    });

    test("animateOnReveal holds the entry until playEntry() reveals it", () => {
        makeTarget();
        const widget = new NameTimeline("#t", { animateOnReveal: true });
        widget.draw(SAMPLE);
        const root = document.querySelector("#t .msc-name-timeline");
        // Held: the animate flag is on so the stylesheet pins the initial
        // keyframe, but the reveal has not played yet.
        expect(root.classList.contains("msc-name-timeline--animate")).toBe(true);
        expect(root.classList.contains("is-revealed")).toBe(false);

        widget.playEntry();
        expect(root.classList.contains("is-revealed")).toBe(true);
    });

    test("reduced motion mounts at the resting state with no held keyframe", () => {
        makeTarget();
        const original = window.matchMedia;
        window.matchMedia = (query) => ({
            matches: query === "(prefers-reduced-motion: reduce)",
            media: query,
            addEventListener() {},
            removeEventListener() {},
        });

        try {
            new NameTimeline("#t", { animateOnReveal: true }).draw(SAMPLE);
            const root = document.querySelector("#t .msc-name-timeline");
            // No animate flag → the stylesheet never holds the initial keyframe,
            // so the resting state shows immediately without waiting for a reveal.
            expect(root.classList.contains("msc-name-timeline--animate")).toBe(false);
            expect(root.classList.contains("is-revealed")).toBe(false);
        } finally {
            window.matchMedia = original;
        }
    });
});

describe("NameTimeline — safety + idempotence", () => {
    test("HTML in a label or meta renders as text, never parsed", () => {
        makeTarget();
        new NameTimeline("#t", {}).draw([{ label: "<b>x</b>", value: 1900, meta: "<i>y</i>" }]);
        const row = document.querySelector("#t .msc-name-timeline-row");
        expect(row.querySelector(".msc-name-timeline-label").textContent).toBe("<b>x</b>");
        expect(row.querySelector(".msc-name-timeline-label b")).toBeNull();
        expect(row.querySelector(".msc-name-timeline-secondary").textContent).toBe("<i>y</i>");
    });

    test("redraw replaces the prior timeline, does not stack", () => {
        makeTarget();
        const widget = new NameTimeline("#t", {});
        widget.draw(SAMPLE);
        widget.draw(SAMPLE);
        expect(document.querySelectorAll("#t > div.msc-name-timeline")).toHaveLength(1);
    });

    test("redraw from data to empty clears the timeline and shows the placeholder", () => {
        makeTarget();
        const widget = new NameTimeline("#t", {});
        widget.draw(SAMPLE);
        widget.draw([]);
        expect(document.querySelector("#t .msc-name-timeline")).toBeNull();
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });
});
