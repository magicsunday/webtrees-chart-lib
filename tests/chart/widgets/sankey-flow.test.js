import { afterEach, describe, expect, test } from "@jest/globals";

import SankeyFlow from "src/chart/widgets/sankey-flow.js";
import { targetMaker } from "../../support/make-target.js";
import { stubReducedMotion } from "../../support/match-media.js";

afterEach(() => {
    document.body.innerHTML = "";
    // Drop any reduced-motion override so it can't leak into other tests.
    window.matchMedia = undefined;
});

// Acyclic flow: Farmer → Smith, Farmer → Clerk, Smith → Clerk. Links reference
// nodes by index (d3-sankey's default nodeId).
const SAMPLE = {
    nodes: [{ name: "Farmer" }, { name: "Smith" }, { name: "Clerk" }],
    links: [
        { source: 0, target: 1, value: 8 },
        { source: 0, target: 2, value: 3 },
        { source: 1, target: 2, value: 2 },
    ],
};

const makeTarget = targetMaker("k");

describe("SankeyFlow — rendering", () => {
    test("renders one path.msc-sankey-flow-link per link", () => {
        makeTarget();
        new SankeyFlow("#k", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#k svg path.msc-sankey-flow-link")).toHaveLength(
            SAMPLE.links.length,
        );
    });
});

describe("SankeyFlow — fixed node geometry", () => {
    test("renders the nodes as rectangles of the fixed node width", () => {
        makeTarget();
        new SankeyFlow("#k", {}).draw(SAMPLE);

        const widths = [...document.querySelectorAll("#k svg g.msc-sankey-flow-node > rect")].map(
            (rect) => Number(rect.getAttribute("width")),
        );
        expect(widths).toHaveLength(SAMPLE.nodes.length);
        expect(widths.every((width) => width === 14)).toBe(true);
    });

    test("keeps the fixed padding between the nodes of one column", () => {
        makeTarget();
        // Both targets sit in the second column, below each other.
        const fork = {
            nodes: [{ name: "Farmer" }, { name: "Smith" }, { name: "Clerk" }],
            links: [
                { source: 0, target: 1, value: 8 },
                { source: 0, target: 2, value: 3 },
            ],
        };
        new SankeyFlow("#k", { height: 320 }).draw(fork);

        const rects = [...document.querySelectorAll("#k svg g.msc-sankey-flow-node > rect")]
            .map((rect) => ({
                x: Number(rect.getAttribute("x")),
                y: Number(rect.getAttribute("y")),
                height: Number(rect.getAttribute("height")),
            }))
            .sort((first, second) => first.y - second.y);
        const rightmost = Math.max(...rects.map((rect) => rect.x));
        const targets = rects.filter((rect) => rect.x === rightmost);
        expect(targets).toHaveLength(2);
        const [upper, lower] = /** @type {[typeof rects[0], typeof rects[0]]} */ (targets);
        expect(lower.y - (upper.y + upper.height)).toBeCloseTo(10, 6);
    });
});

describe("SankeyFlow — reduced-motion entrance parity", () => {
    test("renders links at full stroke-opacity (not the held zero)", () => {
        stubReducedMotion();
        makeTarget();
        new SankeyFlow("#k", { animateOnReveal: true }).draw(SAMPLE);

        // entry(false) sets the final stroke-opacity/width directly; the held
        // keyframe leaves links at stroke-opacity 0.
        const links = [...document.querySelectorAll("#k svg path.msc-sankey-flow-link")];
        expect(links.length).toBeGreaterThan(0);
        expect(links.every((l) => l.getAttribute("stroke-opacity") === "0.45")).toBe(true);
    });
});

describe("SankeyFlow — tooltip composition (union: `→` header + escaped sample meta-div)", () => {
    test("the header reads `source → target` and the __meta div escapes sample names", () => {
        makeTarget();
        new SankeyFlow("#k", {}).draw({
            nodes: [{ name: "A" }, { name: "B" }],
            links: [{ source: 0, target: 1, value: 5, samples: [{ name: "x<b>" }] }],
        });
        document
            .querySelector("#k path.msc-sankey-flow-link")
            ?.dispatchEvent(new Event("mouseover", { bubbles: true }));
        const tip = document.querySelector(".msc-chart-tooltip");
        expect(tip.querySelector("strong").textContent).toBe("A → B");
        const meta = tip.querySelector(".msc-chart-tooltip__meta");
        expect(meta.tagName).toBe("DIV");
        // The sample name is user data — it must render escaped, not as live markup.
        expect(meta.innerHTML).toContain("x&lt;b&gt;");
        expect(meta.querySelector("b")).toBeNull();
    });
});
