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
    { label: "Müller", value: 12 },
    { label: "Schmidt", value: 9 },
    { label: "Sonntag", value: 5 },
];

/** @returns {string[]} the `transform` of every rendered bubble group */
const transforms = (host) =>
    [...host.querySelectorAll("g.wt-stat-bubble-g")].map((g) => g.getAttribute("transform") ?? "");

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

        new NameBubbles(host, { dimension: "surname" }).draw(SAMPLE);

        // playEntry runs inline, so the initial keyframe (scale 0) is applied
        // synchronously before the async tween to scale 1.
        const t = transforms(host);
        expect(t.length).toBe(SAMPLE.length);
        expect(t.every((x) => x.includes("scale(0)"))).toBe(true);

        // Cancel the pending transitions so no d3 timer outlives the test.
        select(host).selectAll("g.wt-stat-bubble-g").interrupt("bubble-pop");
    });

    test("holds bubbles at the initial keyframe when animateOnReveal is set", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        new NameBubbles(host, { dimension: "surname", animateOnReveal: true }).draw(SAMPLE);

        // Drawn, but held hidden (scale 0) until a later playEntry — and NO
        // transition scheduled yet, so they stay at scale 0.
        const t = transforms(host);
        expect(t.length).toBe(SAMPLE.length);
        expect(t.every((x) => x.includes("scale(0)"))).toBe(true);
    });

    test("playEntry re-animates the existing groups without re-drawing", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        const widget = new NameBubbles(host, { dimension: "surname", animateOnReveal: true });
        widget.draw(SAMPLE);

        const groupsBefore = host.querySelectorAll("g.wt-stat-bubble-g");
        const svgBefore = host.querySelectorAll("svg.wt-stat-bubble");

        // The entrance is held (stored) until playEntry consumes it — proving
        // playEntry actually runs the entry rather than being a no-op.
        expect(typeof widget._entry).toBe("function");

        widget.playEntry();

        // One-shot: the held entry is consumed (cleared) after playing.
        expect(widget._entry).toBeNull();

        // Same SVG, same group nodes — playEntry transitions, never re-draws.
        expect(host.querySelectorAll("svg.wt-stat-bubble").length).toBe(svgBefore.length);
        expect(host.querySelectorAll("g.wt-stat-bubble-g").length).toBe(groupsBefore.length);
        expect(host.querySelector("g.wt-stat-bubble-g")).toBe(groupsBefore[0]);

        select(host).selectAll("g.wt-stat-bubble-g").interrupt("bubble-pop");
    });

    test("renders final scale and treats playEntry as a no-op under prefers-reduced-motion", () => {
        window.matchMedia = () => ({ matches: true });

        host = document.createElement("div");
        document.body.appendChild(host);

        const widget = new NameBubbles(host, { dimension: "surname", animateOnReveal: true });
        widget.draw(SAMPLE);
        widget.playEntry();

        const t = transforms(host);
        expect(t.length).toBe(SAMPLE.length);
        expect(t.some((x) => x.includes("scale(0)"))).toBe(false);
    });
});
