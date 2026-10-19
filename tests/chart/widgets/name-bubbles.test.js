/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from "@jest/globals";
import { select } from "d3-selection";

import NameBubbles from "src/chart/widgets/name-bubbles.js";

// jsdom does not implement SVGGraphicsElement.getBBox, which the widget's
// label-recentre step reads. A zero-sized box turns the recentre into a no-op
// via the widget's own guard — exactly what these tests want, since they assert
// on the bubble-group transforms, not on glyph centring.
const originalGetBBox = window.SVGElement.prototype.getBBox;

beforeAll(() => {
    window.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
});

afterAll(() => {
    window.SVGElement.prototype.getBBox = originalGetBBox;
});

const SAMPLE = [
    { label: "Alpha", value: 12 },
    { label: "Beta", value: 9 },
    { label: "Gamma", value: 5 },
];

/** @returns {string[]} the `transform` of every rendered bubble group */
const transforms = (host) =>
    [...host.querySelectorAll("g.msc-name-bubbles-bubble")].map(
        (g) => g.getAttribute("transform") ?? "",
    );

describe("NameBubbles entry animation", () => {
    let host = null;

    afterEach(() => {
        if (host !== null) {
            host.remove();
            host = null;
        }
        // Drop any reduced-motion override so it can't leak into other tests.
        window.matchMedia = undefined;
    });

    test("plays the pop inline on a plain draw (scales bubbles up from zero)", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        new NameBubbles(host, {}).draw(SAMPLE);

        // playEntry runs inline, so the initial keyframe (scale 0) is applied
        // synchronously before the async tween to scale 1.
        const t = transforms(host);
        expect(t.length).toBe(SAMPLE.length);
        expect(t.every((x) => x.includes("scale(0)"))).toBe(true);

        // Cancel the pending transitions so no d3 timer outlives the test.
        select(host).selectAll("g.msc-name-bubbles-bubble").interrupt("bubble-pop");
    });

    test("holds bubbles at the initial keyframe when animateOnReveal is set", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        new NameBubbles(host, { animateOnReveal: true }).draw(SAMPLE);

        // Drawn, but held hidden (scale 0) until a later playEntry — and NO
        // transition scheduled yet, so they stay at scale 0.
        const t = transforms(host);
        expect(t.length).toBe(SAMPLE.length);
        expect(t.every((x) => x.includes("scale(0)"))).toBe(true);
    });

    test("playEntry re-animates the existing groups without re-drawing", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        const widget = new NameBubbles(host, { animateOnReveal: true });
        widget.draw(SAMPLE);

        const groupsBefore = host.querySelectorAll("g.msc-name-bubbles-bubble");
        const svgBefore = host.querySelectorAll("svg.msc-name-bubbles");

        // The entrance is held (stored) until playEntry consumes it — proving
        // playEntry actually runs the entry rather than being a no-op.
        expect(typeof widget._entry).toBe("function");

        widget.playEntry();

        // One-shot: the held entry is consumed (cleared) after playing.
        expect(widget._entry).toBeNull();

        // Same SVG, same group nodes — playEntry transitions, never re-draws.
        expect(host.querySelectorAll("svg.msc-name-bubbles").length).toBe(svgBefore.length);
        expect(host.querySelectorAll("g.msc-name-bubbles-bubble").length).toBe(groupsBefore.length);
        expect(host.querySelector("g.msc-name-bubbles-bubble")).toBe(groupsBefore[0]);

        select(host).selectAll("g.msc-name-bubbles-bubble").interrupt("bubble-pop");
    });

    test("renders final scale and treats playEntry as a no-op under prefers-reduced-motion", () => {
        window.matchMedia = () => ({ matches: true });

        host = document.createElement("div");
        document.body.appendChild(host);

        const widget = new NameBubbles(host, { animateOnReveal: true });
        widget.draw(SAMPLE);
        widget.playEntry();

        const t = transforms(host);
        expect(t.length).toBe(SAMPLE.length);
        expect(t.some((x) => x.includes("scale(0)"))).toBe(false);
    });
});

describe("NameBubbles — neutral DOM contract", () => {
    let host = null;

    afterEach(() => {
        if (host !== null) {
            host.remove();
            host = null;
        }
    });

    test("renders svg.msc-name-bubbles with a labelled group per bubble", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        new NameBubbles(host, {}).draw(SAMPLE);

        expect(host.querySelector("svg.msc-name-bubbles")).not.toBeNull();
        expect(host.querySelectorAll("g.msc-name-bubbles-bubble")).toHaveLength(SAMPLE.length);
        expect(host.querySelectorAll("g.msc-name-bubbles-bubble > circle")).toHaveLength(
            SAMPLE.length,
        );
        expect(host.querySelectorAll("g.msc-name-bubbles-label")).toHaveLength(SAMPLE.length);

        const names = [...host.querySelectorAll("text.msc-name-bubbles-label-text")].map(
            (t) => t.textContent,
        );
        expect(names).toEqual(expect.arrayContaining(["Alpha", "Beta", "Gamma"]));

        // Every bubble renders its count next to its name.
        const counts = [...host.querySelectorAll("text.msc-name-bubbles-value-text")].map(
            (t) => t.textContent,
        );
        expect(counts).toEqual(expect.arrayContaining(["12", "9", "5"]));

        select(host).selectAll("g.msc-name-bubbles-bubble").interrupt("bubble-pop");
    });

    test("bubble radii span the fixed range between the smallest and the largest bubble", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        new NameBubbles(host, {}).draw(SAMPLE);

        const max = Math.max(...SAMPLE.map((row) => row.value));
        const radii = [...host.querySelectorAll("g.msc-name-bubbles-bubble > circle")].map(
            (circle) => Number(circle.getAttribute("r")),
        );
        const expected = SAMPLE.map((row) => 50 + Math.sqrt(row.value / max) * (110 - 50));

        expect(radii).toHaveLength(SAMPLE.length);
        radii.forEach((radius, index) => {
            expect(radius).toBeCloseTo(/** @type {number} */ (expected[index]), 6);
        });

        select(host).selectAll("g.msc-name-bubbles-bubble").interrupt("bubble-pop");
    });

    test("packed bubbles keep a gap between each other", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        new NameBubbles(host, {}).draw(SAMPLE);

        const bubbles = [...host.querySelectorAll("g.msc-name-bubbles-bubble")].map((group) => {
            const match = /translate\(([-\d.e]+),([-\d.e]+)\)/.exec(
                group.getAttribute("transform") ?? "",
            );
            const circle = /** @type {Element} */ (group.querySelector("circle"));

            return {
                x: Number(match?.[1]),
                y: Number(match?.[2]),
                r: Number(circle.getAttribute("r")),
            };
        });

        for (const [index, first] of bubbles.entries()) {
            for (const second of bubbles.slice(index + 1)) {
                expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThanOrEqual(
                    first.r + second.r + 8,
                );
            }
        }

        select(host).selectAll("g.msc-name-bubbles-bubble").interrupt("bubble-pop");
    });

    test("the default spiral packs the sample into a landscape viewBox", () => {
        const originalRandom = Math.random;
        Math.random = () => 0.5;
        try {
            host = document.createElement("div");
            document.body.appendChild(host);

            new NameBubbles(host, {}).draw(SAMPLE);

            expect(host.querySelector("svg.msc-name-bubbles")?.getAttribute("viewBox")).toBe(
                "-25.89419162443238 48.07985578811616 740.4732728332401 257.92014421188384",
            );

            select(host).selectAll("g.msc-name-bubbles-bubble").interrupt("bubble-pop");
        } finally {
            Math.random = originalRandom;
        }
    });

    test("draw([]) renders the empty-state and no svg", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        new NameBubbles(host, {}).draw([]);

        expect(host.querySelector(".chart-empty-state")).not.toBeNull();
        expect(host.querySelector("svg.msc-name-bubbles")).toBeNull();
    });
});

describe("NameBubbles — native get/set accessors", () => {
    test("accent reads back the constructor-supplied option and defaults to currentColor", () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        expect(new NameBubbles(host, { accent: "#abc" }).accent).toBe("#abc");
        expect(new NameBubbles(host, {}).accent).toBe("currentColor");
        host.remove();
    });

    test("an unset width / height reports undefined and the layout ignores the host clientHeight", () => {
        // Pin Math.random so the spiral placement — and therefore the
        // content-driven viewBox — is identical across both renders; only the
        // stubbed clientHeight differs between them.
        const originalRandom = Math.random;
        Math.random = () => 0.5;
        try {
            const baseline = document.createElement("div");
            document.body.appendChild(baseline);
            const w = new NameBubbles(baseline, {});
            // Converged sizing: an unset width / height stays inert (undefined),
            // because name-bubbles scales via preserveAspectRatio off a fixed
            // 720x360 reference box rather than the host's pixel size.
            expect(w.width).toBeUndefined();
            expect(w.height).toBeUndefined();
            w.draw(SAMPLE);
            const baselineSvg = baseline.querySelector("svg.msc-name-bubbles");
            expect(baselineSvg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
            expect(baseline.querySelectorAll("g.msc-name-bubbles-bubble")).toHaveLength(
                SAMPLE.length,
            );
            const baselineViewBox = baselineSvg.getAttribute("viewBox");

            // A tall host must NOT change the rendered viewBox the way it does
            // for the clientHeight-adopting layout widgets.
            const tall = document.createElement("div");
            Object.defineProperty(tall, "clientHeight", { value: 999, configurable: true });
            document.body.appendChild(tall);
            new NameBubbles(tall, {}).draw(SAMPLE);
            expect(tall.querySelector("svg.msc-name-bubbles").getAttribute("viewBox")).toBe(
                baselineViewBox,
            );

            baseline.remove();
            tall.remove();
        } finally {
            Math.random = originalRandom;
        }
    });

    test("accent setter falls back to currentColor on empty / non-string input", () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const w = new NameBubbles(host, { accent: "#abc" });
        w.accent = "";
        expect(w.accent).toBe("currentColor");
        w.accent = /** @type {any} */ (5);
        expect(w.accent).toBe("currentColor");
        host.remove();
    });
});

describe("NameBubbles — empty→data redraw", () => {
    test("clears the empty-state placeholder and renders exactly one root", () => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const w = new NameBubbles(host, {});
        w.draw([]);
        w.draw(SAMPLE);
        expect(host.querySelectorAll(":scope > .chart-empty-state")).toHaveLength(0);
        expect(host.querySelectorAll(":scope > svg.msc-name-bubbles")).toHaveLength(1);
        host.remove();
    });
});

describe("NameBubbles — redraw idempotence", () => {
    test("a second data draw replaces the prior root rather than stacking", () => {
        // Pins the _clearRoot selector argument: a wrong selector would leave
        // the first root in place and stack a second on a data→data redraw.
        const host = document.createElement("div");
        document.body.appendChild(host);
        const w = new NameBubbles(host, {});
        w.draw(SAMPLE);
        w.draw(SAMPLE);
        expect(host.querySelectorAll(":scope > svg.msc-name-bubbles")).toHaveLength(1);
        host.remove();
    });
});
