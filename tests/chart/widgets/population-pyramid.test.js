import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import PopulationPyramid from "src/chart/widgets/population-pyramid.js";

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
    centuries: ["19.", "20."],
    bands: ["0–9", "10–19", "20–29"],
    data: [
        // 19.
        [
            { m: 10, f: 8 },
            { m: 4, f: 3 },
            { m: 6, f: 9 },
        ],
        // 20.
        [
            { m: 20, f: 18 },
            { m: 2, f: 1 },
            { m: 5, f: 7 },
        ],
    ],
};

const makeTarget = (id = "p") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("PopulationPyramid — empty states", () => {
    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new PopulationPyramid("#p", {}).draw(null);
        expect(document.querySelector("#p > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#p .wt-stat-pyramid")).toBeNull();
    });

    test("missing centuries or bands falls through to empty-state", () => {
        makeTarget();
        new PopulationPyramid("#p", {}).draw({ centuries: [], bands: ["0–9"], data: [] });
        expect(document.querySelector("#p > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new PopulationPyramid("#p", { emptyMessage: "keine Daten" }).draw(null);
        expect(document.querySelector("#p > .chart-empty-state").textContent).toBe("keine Daten");
    });
});

describe("PopulationPyramid — rendering", () => {
    test("renders a century picker button per century", () => {
        makeTarget();
        new PopulationPyramid("#p", {}).draw(SAMPLE);
        const buttons = document.querySelectorAll("#p .wt-stat-pyramid-century");
        expect(buttons.length).toBe(2);
        expect([...buttons].map((b) => b.textContent)).toEqual(["19.", "20."]);
    });

    test("renders one male + one female bar per band", () => {
        makeTarget();
        new PopulationPyramid("#p", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#p rect.wt-stat-pyramid-bar-m").length).toBe(3);
        expect(document.querySelectorAll("#p rect.wt-stat-pyramid-bar-f").length).toBe(3);
        expect(document.querySelectorAll("#p text.wt-stat-pyramid-band").length).toBe(3);
    });

    test("defaults to the most recent century with data (last button pressed)", () => {
        makeTarget();
        new PopulationPyramid("#p", {}).draw(SAMPLE);
        const pressed = [...document.querySelectorAll("#p .wt-stat-pyramid-century")].map((b) =>
            b.getAttribute("aria-pressed"),
        );
        expect(pressed).toEqual(["false", "true"]);
    });

    test("applies the ariaLabel option to the host svg", () => {
        makeTarget();
        new PopulationPyramid("#p", { ariaLabel: "Age at death by sex and century" }).draw(SAMPLE);
        expect(
            document.querySelector("#p svg.wt-stat-pyramid-svg").getAttribute("aria-label"),
        ).toBe("Age at death by sex and century");
    });

    test("omits aria-label when no ariaLabel option is supplied", () => {
        makeTarget();
        new PopulationPyramid("#p", {}).draw(SAMPLE);
        expect(
            document.querySelector("#p svg.wt-stat-pyramid-svg").hasAttribute("aria-label"),
        ).toBe(false);
    });

    test("century label formatter is applied to the picker", () => {
        makeTarget();
        new PopulationPyramid("#p", { centuryLabel: (c) => `${c} Jh.` }).draw(SAMPLE);
        expect(document.querySelector("#p .wt-stat-pyramid-century").textContent).toBe("19. Jh.");
    });

    test("male bars grow left of centre, female bars grow right", () => {
        makeTarget();
        new PopulationPyramid("#p", { width: 720, height: 460 }).draw(SAMPLE);
        const centre = 360;
        for (const bar of document.querySelectorAll("#p rect.wt-stat-pyramid-bar-m")) {
            const x = Number(bar.getAttribute("x"));
            const w = Number(bar.getAttribute("width"));
            expect(x + w).toBeLessThanOrEqual(centre);
        }
        for (const bar of document.querySelectorAll("#p rect.wt-stat-pyramid-bar-f")) {
            expect(Number(bar.getAttribute("x"))).toBeGreaterThanOrEqual(centre);
        }
    });
});

describe("PopulationPyramid — picker interaction", () => {
    const maxWidth = (selector) =>
        Math.max(
            ...[...document.querySelectorAll(selector)].map((r) => Number(r.getAttribute("width"))),
        );

    test("clicking a century button switches the pressed state", () => {
        makeTarget();
        new PopulationPyramid("#p", {}).draw(SAMPLE);
        const buttons = document.querySelectorAll("#p .wt-stat-pyramid-century");
        buttons[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
        expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
        // bars are still present after the redraw
        expect(document.querySelectorAll("#p rect.wt-stat-pyramid-bar-m").length).toBe(3);
    });

    // Regression guard: a picker switch re-draws the bars for the chosen
    // century and MUST give them their final geometry. A prior version routed
    // the re-draw through the reveal-gated entry path, which — once the one-shot
    // reveal had fired — held every freshly switched bar at width 0 forever.
    test("switching century re-applies non-zero bar geometry (not held at width 0)", () => {
        makeTarget();
        new PopulationPyramid("#p", {}).draw(SAMPLE);

        // Default is the most recent century (index 1); switch to the first.
        const buttons = document.querySelectorAll("#p .wt-stat-pyramid-century");
        buttons[0].dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(maxWidth("#p rect.wt-stat-pyramid-bar-m")).toBeGreaterThan(0);
        expect(maxWidth("#p rect.wt-stat-pyramid-bar-f")).toBeGreaterThan(0);
    });

    test("the reveal-gated entry also lands on non-zero geometry once played", () => {
        makeTarget();
        const widget = new PopulationPyramid("#p", { animateOnReveal: true });
        widget.draw(SAMPLE);
        // Under reduced motion the held entry resolves to the final state on
        // playEntry, so the bars carry real width afterwards.
        widget.playEntry();

        expect(maxWidth("#p rect.wt-stat-pyramid-bar-m")).toBeGreaterThan(0);
        expect(maxWidth("#p rect.wt-stat-pyramid-bar-f")).toBeGreaterThan(0);
    });

    // Regression guard: a bar hovered when the century is switched never gets
    // its own mouseleave (the node is removed), so the shared tooltip would stay
    // visible over the freshly drawn bars unless the re-draw hides it explicitly.
    test("switching century hides a tooltip left open on the removed bar", () => {
        makeTarget();
        new PopulationPyramid("#p", {}).draw(SAMPLE);

        document
            .querySelector("#p rect.wt-stat-pyramid-bar-m")
            .dispatchEvent(
                new window.MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }),
            );
        const tooltip = document.body.querySelector(".wt-chart-tooltip");
        expect(tooltip.classList.contains("is-visible")).toBe(true);

        document
            .querySelectorAll("#p .wt-stat-pyramid-century")[0]
            .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(tooltip.classList.contains("is-visible")).toBe(false);
    });

    // NOTE: the deferred reveal entry (animateOnReveal + real motion) drives a
    // d3 transition, which throws under jsdom — so the "both columns animate on
    // reveal" path cannot be exercised here and is covered by browser
    // verification instead. The reduced-motion case above proves both columns
    // reach their final geometry through the same single shared entry closure.
});

describe("PopulationPyramid — crossfilter", () => {
    test("clicking a bar emits an ageBand predicate with the sex", () => {
        makeTarget();
        const widget = new PopulationPyramid("#p", { source: "pyramid" });
        widget.draw(SAMPLE);

        const events = [];
        widget.onSelectionChanged((payload) => events.push(payload));

        document
            .querySelector("#p rect.wt-stat-pyramid-bar-f")
            .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(events).toHaveLength(1);
        expect(events[0].source).toBe("pyramid");
        expect(events[0].predicate).toEqual({ dimension: "ageBand", value: "0–9", sex: "F" });
    });
});

describe("PopulationPyramid — sanitize", () => {
    test("negative / non-finite counts are clamped to zero (no crash, bars still rendered)", () => {
        makeTarget();
        new PopulationPyramid("#p", {}).draw({
            centuries: ["20."],
            bands: ["0–9", "10–19"],
            data: [
                [
                    { m: -5, f: Number.NaN },
                    { m: 3, f: 2 },
                ],
            ],
        });
        // still renders (one century with a positive cell)
        expect(document.querySelectorAll("#p rect.wt-stat-pyramid-bar-m").length).toBe(2);
        // the clamped male bar has zero width
        const firstMale = document.querySelectorAll("#p rect.wt-stat-pyramid-bar-m")[0];
        expect(Number(firstMale.getAttribute("width"))).toBe(0);
    });
});
