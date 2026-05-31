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
    [...host.querySelectorAll("g.wt-name-bubbles-g")].map((g) => g.getAttribute("transform") ?? "");

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
        select(host).selectAll("g.wt-name-bubbles-g").interrupt("bubble-pop");
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

        const groupsBefore = host.querySelectorAll("g.wt-name-bubbles-g");
        const svgBefore = host.querySelectorAll("svg.wt-name-bubbles");

        // The entrance is held (stored) until playEntry consumes it — proving
        // playEntry actually runs the entry rather than being a no-op.
        expect(typeof widget._entry).toBe("function");

        widget.playEntry();

        // One-shot: the held entry is consumed (cleared) after playing.
        expect(widget._entry).toBeNull();

        // Same SVG, same group nodes — playEntry transitions, never re-draws.
        expect(host.querySelectorAll("svg.wt-name-bubbles").length).toBe(svgBefore.length);
        expect(host.querySelectorAll("g.wt-name-bubbles-g").length).toBe(groupsBefore.length);
        expect(host.querySelector("g.wt-name-bubbles-g")).toBe(groupsBefore[0]);

        select(host).selectAll("g.wt-name-bubbles-g").interrupt("bubble-pop");
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

describe("NameBubbles — neutral DOM contract", () => {
    let host = null;

    afterEach(() => {
        if (host !== null) {
            host.remove();
            host = null;
        }
    });

    test("renders svg.wt-name-bubbles with a labelled group per bubble", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        new NameBubbles(host, {}).draw(SAMPLE);

        expect(host.querySelector("svg.wt-name-bubbles")).not.toBeNull();
        expect(host.querySelectorAll("g.wt-name-bubbles-g")).toHaveLength(SAMPLE.length);
        expect(host.querySelectorAll("g.wt-name-bubbles-g > circle")).toHaveLength(SAMPLE.length);
        expect(host.querySelectorAll("g.wt-name-bubbles-label")).toHaveLength(SAMPLE.length);

        const names = [...host.querySelectorAll("text.wt-name-bubbles-name-text")].map(
            (t) => t.textContent,
        );
        expect(names).toEqual(expect.arrayContaining(["Alpha", "Beta", "Gamma"]));

        // All sample bubbles clear the r>22 threshold, so each renders its count.
        const counts = [...host.querySelectorAll("text.wt-name-bubbles-count-text")].map(
            (t) => t.textContent,
        );
        expect(counts).toEqual(expect.arrayContaining(["12", "9", "5"]));

        select(host).selectAll("g.wt-name-bubbles-g").interrupt("bubble-pop");
    });

    test("suppresses the count caption on bubbles too small to hold it", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        // A tight radius range keeps every bubble at r <= 22, where the count
        // caption is dropped and only the name remains.
        new NameBubbles(host, { rMin: 10, rMax: 20 }).draw(SAMPLE);

        expect(host.querySelectorAll("g.wt-name-bubbles-g")).toHaveLength(SAMPLE.length);
        expect(host.querySelectorAll("text.wt-name-bubbles-name-text")).toHaveLength(SAMPLE.length);
        expect(host.querySelectorAll("text.wt-name-bubbles-count-text")).toHaveLength(0);

        select(host).selectAll("g.wt-name-bubbles-g").interrupt("bubble-pop");
    });

    test("draw([]) renders the empty-state and no svg", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        new NameBubbles(host, {}).draw([]);

        expect(host.querySelector(".chart-empty-state")).not.toBeNull();
        expect(host.querySelector("svg.wt-name-bubbles")).toBeNull();
    });
});

describe("NameBubbles — selection", () => {
    let host = null;

    afterEach(() => {
        if (host !== null) {
            host.remove();
            host = null;
        }
    });

    test("a click invokes onSelectionChanged with the dimension predicate, toggling off on repeat", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        const calls = [];
        const widget = new NameBubbles(host, { dimension: "category", source: "bubbles" });
        widget.onSelectionChanged((payload) => calls.push(payload));
        widget.draw(SAMPLE);

        // The largest bubble (Alpha, value 12) sorts first, so it is the first group.
        const groups = [...host.querySelectorAll("g.wt-name-bubbles-g")];
        groups[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual({
            source: "bubbles",
            predicate: { dimension: "category", value: "Alpha" },
        });
        // The selected bubble stays opaque; the rest dim.
        expect(groups[0].getAttribute("opacity")).toBe("1");
        expect(groups.slice(1).every((g) => g.getAttribute("opacity") === "0.3")).toBe(true);

        groups[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(calls).toHaveLength(2);
        expect(calls[1]).toEqual({ source: "bubbles", predicate: null });
        // Cleared selection restores every bubble to full opacity.
        expect(groups.every((g) => g.getAttribute("opacity") === "1")).toBe(true);

        select(host).selectAll("g.wt-name-bubbles-g").interrupt("bubble-pop");
    });

    test("setSelection applies the dim overlay from a bus echo without re-emitting", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        const calls = [];
        const widget = new NameBubbles(host, { dimension: "category", source: "bubbles" });
        widget.onSelectionChanged((payload) => calls.push(payload));
        widget.draw(SAMPLE);
        const groups = [...host.querySelectorAll("g.wt-name-bubbles-g")];

        // A sibling widget's echo selects "Beta" (value 9 → second group).
        widget.setSelection({ dimension: "category", value: "Beta" });
        expect(groups[1].getAttribute("opacity")).toBe("1");
        expect(groups[0].getAttribute("opacity")).toBe("0.3");
        expect(groups[2].getAttribute("opacity")).toBe("0.3");

        // An echo for a different dimension clears the local selection.
        widget.setSelection({ dimension: "other", value: "Beta" });
        expect(groups.every((g) => g.getAttribute("opacity") === "1")).toBe(true);

        // setSelection is a passive bus sink — it never re-emits.
        expect(calls).toHaveLength(0);

        select(host).selectAll("g.wt-name-bubbles-g").interrupt("bubble-pop");
    });

    test("without a dimension the bubbles are not clickable and emit nothing", () => {
        host = document.createElement("div");
        document.body.appendChild(host);

        const calls = [];
        const widget = new NameBubbles(host, {});
        widget.onSelectionChanged((payload) => calls.push(payload));
        widget.draw(SAMPLE);

        host.querySelector("g.wt-name-bubbles-g").dispatchEvent(
            new MouseEvent("click", { bubbles: true }),
        );
        expect(calls).toHaveLength(0);

        select(host).selectAll("g.wt-name-bubbles-g").interrupt("bubble-pop");
    });
});
