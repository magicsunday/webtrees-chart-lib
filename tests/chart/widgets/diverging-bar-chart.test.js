import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import DivergingBarChart from "src/chart/widgets/diverging-bar-chart.js";

// Reduced motion makes _runEntry jump to the final keyframe synchronously, so
// bar geometry is asserted without waiting on a d3 transition.
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

const SAMPLE = {
    groups: ["19.", "20."],
    bands: ["0–9", "10–19", "20–29"],
    data: [
        // 19.
        [
            { left: 10, right: 8 },
            { left: 4, right: 3 },
            { left: 6, right: 9 },
        ],
        // 20.
        [
            { left: 20, right: 18 },
            { left: 2, right: 1 },
            { left: 5, right: 7 },
        ],
    ],
};

const makeTarget = (id = "p") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

// Bars are <path>s (built via d3-path) with only their outer corners rounded:
// "M{inner},{y}L{beforeCorner},{y}…". This extracts the gutter-side (inner) and
// outward (the first lineTo x) so the geometry tests can assert direction +
// reach without a width attribute. Zero bands carry the `--empty` modifier.
const barXs = (el) => {
    const m = el.getAttribute("d").match(/^M(-?[\d.]+),-?[\d.]+L(-?[\d.]+)/);
    return { inner: Number(m[1]), outer: Number(m[2]) };
};

const isPlaceholder = (el) => el.classList.contains("msc-diverging-bar-chart-bar--empty");

const maxReach = (selector) =>
    Math.max(
        ...[...document.querySelectorAll(selector)].map((el) => {
            const { inner, outer } = barXs(el);
            return Math.abs(outer - inner);
        }),
    );

describe("DivergingBarChart — empty states", () => {
    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw(null);
        expect(document.querySelector("#p > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#p .msc-diverging-bar-chart")).toBeNull();
    });

    test("missing groups or bands falls through to empty-state", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw({ groups: [], bands: ["0–9"], data: [] });
        expect(document.querySelector("#p > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new DivergingBarChart("#p", { emptyMessage: "keine Daten" }).draw(null);
        expect(document.querySelector("#p > .chart-empty-state").textContent).toBe("keine Daten");
    });
});

describe("DivergingBarChart — rendering", () => {
    test("renders a picker button per group", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw(SAMPLE);
        const buttons = document.querySelectorAll("#p .msc-diverging-bar-chart-group");
        expect(buttons.length).toBe(2);
        expect([...buttons].map((b) => b.textContent)).toEqual(["19.", "20."]);
    });

    test("omits the picker entirely for a single-group dataset", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw({
            groups: ["only"],
            bands: ["0–9", "10–19"],
            data: [
                [
                    { left: 4, right: 2 },
                    { left: 1, right: 3 },
                ],
            ],
        });
        // One group has nothing to switch between → no picker chrome at all.
        expect(document.querySelector("#p .msc-diverging-bar-chart-picker")).toBeNull();
        expect(document.querySelectorAll("#p .msc-diverging-bar-chart-group").length).toBe(0);
        // The two-sided bars still render.
        expect(document.querySelectorAll("#p path.msc-diverging-bar-chart-bar-left").length).toBe(
            2,
        );
    });

    test("renders one left + one right bar per band", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#p path.msc-diverging-bar-chart-bar-left").length).toBe(
            3,
        );
        expect(document.querySelectorAll("#p path.msc-diverging-bar-chart-bar-right").length).toBe(
            3,
        );
        expect(document.querySelectorAll("#p text.msc-diverging-bar-chart-band").length).toBe(3);
    });

    test("defaults to the most recent group with data (last button pressed)", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw(SAMPLE);
        const pressed = [...document.querySelectorAll("#p .msc-diverging-bar-chart-group")].map(
            (b) => b.getAttribute("aria-pressed"),
        );
        expect(pressed).toEqual(["false", "true"]);
    });

    test("applies the ariaLabel option to the host svg", () => {
        makeTarget();
        new DivergingBarChart("#p", { ariaLabel: "Counts by band and group" }).draw(SAMPLE);
        expect(
            document.querySelector("#p svg.msc-diverging-bar-chart-svg").getAttribute("aria-label"),
        ).toBe("Counts by band and group");
    });

    test("omits aria-label when no ariaLabel option is supplied", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw(SAMPLE);
        expect(
            document.querySelector("#p svg.msc-diverging-bar-chart-svg").hasAttribute("aria-label"),
        ).toBe(false);
    });

    test("group label formatter is applied to the picker", () => {
        makeTarget();
        new DivergingBarChart("#p", { groupLabel: (g) => `${g} Jh.` }).draw(SAMPLE);
        expect(document.querySelector("#p .msc-diverging-bar-chart-group").textContent).toBe(
            "19. Jh.",
        );
    });

    test("renders the centre axis title when axisLabel is supplied", () => {
        makeTarget();
        new DivergingBarChart("#p", { axisLabel: "Age" }).draw(SAMPLE);
        const title = document.querySelector("#p text.msc-diverging-bar-chart-axis-title");
        expect(title).not.toBeNull();
        expect(title.textContent).toBe("Age");
    });

    test("omits the axis title when no axisLabel is supplied", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw(SAMPLE);
        expect(document.querySelector("#p text.msc-diverging-bar-chart-axis-title")).toBeNull();
    });

    test("renders side captions only when their labels are supplied", () => {
        makeTarget();
        new DivergingBarChart("#p", { leftLabel: "Male", rightLabel: "Female" }).draw(SAMPLE);
        expect(
            document.querySelector("#p text.msc-diverging-bar-chart-sidelabel-left").textContent,
        ).toBe("Male");
        expect(
            document.querySelector("#p text.msc-diverging-bar-chart-sidelabel-right").textContent,
        ).toBe("Female");

        makeTarget("q");
        new DivergingBarChart("#q", {}).draw(SAMPLE);
        expect(document.querySelector("#q text.msc-diverging-bar-chart-sidelabel-left")).toBeNull();
        expect(
            document.querySelector("#q text.msc-diverging-bar-chart-sidelabel-right"),
        ).toBeNull();
    });

    test("renders a per-bar count caption for every non-zero band", () => {
        makeTarget();
        // Default group is the most recent (20.): left 20/2/5, right 18/1/7.
        new DivergingBarChart("#p", {}).draw(SAMPLE);
        const leftVals = [
            ...document.querySelectorAll("#p text.msc-diverging-bar-chart-value-left"),
        ].map((t) => t.textContent);
        const rightVals = [
            ...document.querySelectorAll("#p text.msc-diverging-bar-chart-value-right"),
        ].map((t) => t.textContent);
        expect(leftVals).toEqual(["20", "2", "5"]);
        expect(rightVals).toEqual(["18", "1", "7"]);
    });

    test("a zero count renders an empty caption (no 0 printed)", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw({
            groups: ["20."],
            bands: ["0–9", "10–19"],
            data: [
                [
                    { left: 4, right: 0 },
                    { left: 0, right: 3 },
                ],
            ],
        });
        const leftVals = [
            ...document.querySelectorAll("#p text.msc-diverging-bar-chart-value-left"),
        ].map((t) => t.textContent);
        const rightVals = [
            ...document.querySelectorAll("#p text.msc-diverging-bar-chart-value-right"),
        ].map((t) => t.textContent);
        expect(leftVals).toEqual(["4", ""]);
        expect(rightVals).toEqual(["", "3"]);
    });

    test("frames the centre gutter with two solid separator rules", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw(SAMPLE);
        const seps = document.querySelectorAll("#p line.msc-diverging-bar-chart-separator");
        expect(seps.length).toBe(2);
        // Vertical rules: x1 === x2, and the two sit symmetrically around centre.
        const xs = [...seps].map((s) => {
            expect(s.getAttribute("x1")).toBe(s.getAttribute("x2"));
            return Number(s.getAttribute("x1"));
        });
        expect(xs[0]).toBeLessThan(360);
        expect(xs[1]).toBeGreaterThan(360);
    });

    test("tooltip shows the band with its unit and the count with its label, no side", () => {
        makeTarget();
        new DivergingBarChart("#p", {
            leftLabel: "Male",
            categoryUnit: "years",
            valueLabel: "individuals",
        }).draw(SAMPLE);
        // Default group 20.: first band "0–9" has left = 20.
        document
            .querySelector("#p path.msc-diverging-bar-chart-bar-left")
            .dispatchEvent(
                new window.MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }),
            );
        const html = document.body.querySelector(".msc-chart-tooltip").innerHTML;
        expect(html).toContain("0–9 years");
        expect(html).toContain("20");
        expect(html).toContain("individuals");
        // The hovered column already conveys the side, so it is not repeated.
        expect(html).not.toContain("Male");
    });

    // The bar height equals the y-span of its path; a single-band chart makes
    // the band tall enough that the cap (barThickness), not the band, decides.
    const barHeight = (el) => {
        const ys = [...el.getAttribute("d").matchAll(/[ML]-?[\d.]+,(-?[\d.]+)/g)].map((m) =>
            Number(m[1]),
        );
        return Math.round(Math.max(...ys) - Math.min(...ys));
    };

    test("barThickness caps the bar height (default 14)", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw({
            groups: ["20."],
            bands: ["0–9"],
            data: [[{ left: 0, right: 5 }]],
        });
        expect(barHeight(document.querySelector("#p path.msc-diverging-bar-chart-bar-left"))).toBe(
            14,
        );
    });

    test("barThickness option overrides the bar height", () => {
        makeTarget();
        new DivergingBarChart("#p", { barThickness: 10 }).draw({
            groups: ["20."],
            bands: ["0–9"],
            data: [[{ left: 0, right: 5 }]],
        });
        expect(barHeight(document.querySelector("#p path.msc-diverging-bar-chart-bar-left"))).toBe(
            10,
        );
    });

    test("left bars grow left of centre, right bars grow right", () => {
        makeTarget();
        new DivergingBarChart("#p", { width: 720, height: 460 }).draw(SAMPLE);
        const centre = 360;
        for (const bar of document.querySelectorAll("#p path.msc-diverging-bar-chart-bar-left")) {
            const { inner, outer } = barXs(bar);
            // Inner edge at the gutter (left of centre); the bar reaches further left.
            expect(inner).toBeLessThanOrEqual(centre);
            expect(outer).toBeLessThanOrEqual(inner);
        }
        for (const bar of document.querySelectorAll("#p path.msc-diverging-bar-chart-bar-right")) {
            const { inner, outer } = barXs(bar);
            expect(inner).toBeGreaterThanOrEqual(centre);
            expect(outer).toBeGreaterThanOrEqual(inner);
        }
    });
});

describe("DivergingBarChart — picker interaction", () => {
    test("clicking a group button switches the pressed state", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw(SAMPLE);
        const buttons = document.querySelectorAll("#p .msc-diverging-bar-chart-group");
        buttons[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
        expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
        // bars are still present after the redraw
        expect(document.querySelectorAll("#p path.msc-diverging-bar-chart-bar-left").length).toBe(
            3,
        );
    });

    // Regression guard: a picker switch re-draws the bars for the chosen group
    // and MUST give them their final geometry. A prior version routed the
    // re-draw through the reveal-gated entry path, which — once the one-shot
    // reveal had fired — held every freshly switched bar at width 0 forever.
    test("switching group re-applies non-zero bar geometry (not held at width 0)", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw(SAMPLE);

        // Default is the most recent group (index 1); switch to the first.
        const buttons = document.querySelectorAll("#p .msc-diverging-bar-chart-group");
        buttons[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(maxReach("#p path.msc-diverging-bar-chart-bar-left")).toBeGreaterThan(0);
        expect(maxReach("#p path.msc-diverging-bar-chart-bar-right")).toBeGreaterThan(0);
    });

    test("the reveal-gated entry also lands on non-zero geometry once played", () => {
        makeTarget();
        const widget = new DivergingBarChart("#p", { animateOnReveal: true });
        widget.draw(SAMPLE);
        // Under reduced motion the held entry resolves to the final state on
        // playEntry, so the bars carry real width afterwards.
        widget.playEntry();

        expect(maxReach("#p path.msc-diverging-bar-chart-bar-left")).toBeGreaterThan(0);
        expect(maxReach("#p path.msc-diverging-bar-chart-bar-right")).toBeGreaterThan(0);
    });

    // Regression guard: with a DEFERRED reveal entry (real motion, not yet
    // played), the bars must still carry a `d` and every value caption an `x` —
    // the held "from" keyframe is applied on creation, not inside the entry
    // closure. Otherwise the deferred state left unset <path>/<text> nodes and
    // collapsed every number onto the gutter at x=0.
    test("a deferred reveal entry holds bar paths and caption x before playEntry", () => {
        window.matchMedia = (query) => ({
            matches: false,
            media: query,
            addEventListener() {},
            removeEventListener() {},
        });
        makeTarget();
        new DivergingBarChart("#p", { animateOnReveal: true }).draw(SAMPLE);

        const bars = document.querySelectorAll(
            "#p path.msc-diverging-bar-chart-bar-left, #p path.msc-diverging-bar-chart-bar-right",
        );
        const caps = document.querySelectorAll(
            "#p text.msc-diverging-bar-chart-value-left, #p text.msc-diverging-bar-chart-value-right",
        );
        // SAMPLE has 3 bands → 3 left + 3 right bars and one caption each, so the
        // loops below can't silently pass over an empty NodeList.
        expect(bars.length).toBe(6);
        expect(caps.length).toBe(6);
        for (const bar of bars) {
            expect(bar.getAttribute("d")).not.toBeNull();
        }
        for (const cap of caps) {
            expect(cap.getAttribute("x")).not.toBeNull();
        }
    });

    // Regression guard: a bar hovered when the group is switched never gets its
    // own mouseleave (the node is removed), so the shared tooltip would stay
    // visible over the freshly drawn bars unless the re-draw hides it explicitly.
    test("switching group hides a tooltip left open on the removed bar", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw(SAMPLE);

        document
            .querySelector("#p path.msc-diverging-bar-chart-bar-left")
            .dispatchEvent(
                new window.MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }),
            );
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip.classList.contains("is-visible")).toBe(true);

        document
            .querySelectorAll("#p .msc-diverging-bar-chart-group")[0]
            .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(tooltip.classList.contains("is-visible")).toBe(false);
    });

    // NOTE: the deferred reveal entry (animateOnReveal + real motion) drives a
    // d3 transition, which throws under jsdom — so the "both columns animate on
    // reveal" path cannot be exercised here and is covered by browser
    // verification instead. The reduced-motion case above proves both columns
    // reach their final geometry through the same single shared entry closure.
});

describe("DivergingBarChart — crossfilter", () => {
    test("clicking a bar emits a {category, side} predicate", () => {
        makeTarget();
        const widget = new DivergingBarChart("#p", { source: "pyramid" });
        widget.draw(SAMPLE);

        const events = [];
        widget.onSelectionChanged((payload) => events.push(payload));

        document
            .querySelector("#p path.msc-diverging-bar-chart-bar-right")
            .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(events).toHaveLength(1);
        expect(events[0].source).toBe("pyramid");
        expect(events[0].predicate).toEqual({ category: "0–9", side: "right" });
    });
});

describe("DivergingBarChart — sanitize", () => {
    test("negative / non-finite counts are clamped to zero (no crash, bars still rendered)", () => {
        makeTarget();
        new DivergingBarChart("#p", {}).draw({
            groups: ["20."],
            bands: ["0–9", "10–19"],
            data: [
                [
                    { left: -5, right: Number.NaN },
                    { left: 3, right: 2 },
                ],
            ],
        });
        // still renders (one group with a positive cell)
        expect(document.querySelectorAll("#p path.msc-diverging-bar-chart-bar-left").length).toBe(
            2,
        );
        // the clamped (zero) left bar carries the empty modifier (placeholder)
        const firstLeft = document.querySelectorAll("#p path.msc-diverging-bar-chart-bar-left")[0];
        expect(isPlaceholder(firstLeft)).toBe(true);
    });

    test("a zero band keeps a 1-px placeholder bar pinned to the gutter", () => {
        makeTarget();
        new DivergingBarChart("#p", { width: 720, height: 460 }).draw({
            groups: ["20."],
            bands: ["0–9"],
            data: [[{ left: 0, right: 5 }]],
        });
        const leftBar = document.querySelector("#p path.msc-diverging-bar-chart-bar-left");
        expect(isPlaceholder(leftBar)).toBe(true);
        // The placeholder hugs the gutter (well left of the right field).
        expect(barXs(leftBar).inner).toBeLessThan(360);
    });
});

describe("DivergingBarChart — ease option", () => {
    test("resolves a named ease to a function and falls back to the default", () => {
        makeTarget();
        expect(typeof new DivergingBarChart("#p", { ease: "back-out" })._ease).toBe("function");
        // Unknown name and no option both fall back to the default easing.
        expect(typeof new DivergingBarChart("#p", { ease: "nonsense" })._ease).toBe("function");
        expect(typeof new DivergingBarChart("#p", {})._ease).toBe("function");
    });

    test("passes a supplied ease function through unchanged", () => {
        makeTarget();
        const fn = (t) => t;
        expect(new DivergingBarChart("#p", { ease: fn })._ease).toBe(fn);
    });
});

describe("DivergingBarChart — native get/set accessors", () => {
    test("getters read back constructor-supplied options", () => {
        makeTarget();
        const fmt = (group) => `G:${group}`;
        const ease = (t) => t;
        const chart = new DivergingBarChart("#p", {
            leftLabel: "Left",
            rightLabel: "Right",
            axisLabel: "Count",
            categoryUnit: "yrs",
            valueLabel: "People",
            barThickness: 20,
            ease,
            groupLabel: fmt,
        });
        expect(chart.leftLabel).toBe("Left");
        expect(chart.rightLabel).toBe("Right");
        expect(chart.axisLabel).toBe("Count");
        expect(chart.categoryUnit).toBe("yrs");
        expect(chart.valueLabel).toBe("People");
        expect(chart.barThickness).toBe(20);
        expect(chart.ease).toBe(ease);
        expect(chart.groupLabel).toBe(fmt);
    });

    test("getters fall back to defaults when options are omitted", () => {
        makeTarget();
        const chart = new DivergingBarChart("#p", {});
        expect(chart.leftLabel).toBe("");
        expect(chart.rightLabel).toBe("");
        expect(chart.axisLabel).toBe("");
        expect(chart.categoryUnit).toBe("");
        expect(chart.valueLabel).toBe("");
        expect(chart.barThickness).toBe(14);
        // Default easing is cubic-out: cubicOut(0.5) = 0.875, not the linear 0.5.
        expect(chart.ease(0.5)).toBeCloseTo(0.875, 5);
        // Default groupLabel is the identity String(group) formatter.
        expect(chart.groupLabel(42)).toBe("42");
    });

    test("ease setter resolves a named easing and falls back to cubic-out on unknown input", () => {
        makeTarget();
        const chart = new DivergingBarChart("#p", {});
        chart.ease = "linear";
        expect(chart.ease(0.5)).toBeCloseTo(0.5, 5); // linear easing passes through
        chart.ease = /** @type {any} */ (42);
        expect(chart.ease(0.5)).toBeCloseTo(0.875, 5); // unknown -> cubic-out
    });

    test("barThickness setter falls back to 14 on a non-positive / non-finite value", () => {
        makeTarget();
        const chart = new DivergingBarChart("#p", {});
        for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "20", null, undefined]) {
            chart.barThickness = /** @type {any} */ (bad);
            expect(chart.barThickness).toBe(14);
        }
    });

    test("groupLabel setter falls back to the identity formatter for a non-function", () => {
        makeTarget();
        const chart = new DivergingBarChart("#p", {});
        chart.groupLabel = /** @type {any} */ ("nope");
        expect(chart.groupLabel(42)).toBe("42");
    });

    test("string label setters fall back to an empty string on non-string input", () => {
        makeTarget();
        const chart = new DivergingBarChart("#p", {
            leftLabel: "L",
            rightLabel: "R",
            axisLabel: "A",
            categoryUnit: "u",
            valueLabel: "v",
        });
        chart.leftLabel = /** @type {any} */ (5);
        chart.rightLabel = /** @type {any} */ (null);
        chart.axisLabel = /** @type {any} */ (undefined);
        chart.categoryUnit = /** @type {any} */ (5);
        chart.valueLabel = /** @type {any} */ (null);
        expect(chart.leftLabel).toBe("");
        expect(chart.rightLabel).toBe("");
        expect(chart.axisLabel).toBe("");
        expect(chart.categoryUnit).toBe("");
        expect(chart.valueLabel).toBe("");
    });
});
