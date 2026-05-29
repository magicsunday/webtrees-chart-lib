import { afterEach, describe, expect, test } from "@jest/globals";

import SankeyFlow from "src/chart/widgets/sankey-flow.js";

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

const makeTarget = (id = "k") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("SankeyFlow — rendering", () => {
    test("draw(null) renders the empty-state, no svg", () => {
        makeTarget();
        new SankeyFlow("#k", {}).draw(null);
        expect(document.querySelector("#k > .chart-empty-state")).not.toBeNull();
    });

    test("renders one path.link per link", () => {
        makeTarget();
        new SankeyFlow("#k", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#k svg path.link")).toHaveLength(SAMPLE.links.length);
    });
});

describe("SankeyFlow — reduced-motion entrance parity", () => {
    test("renders links at full stroke-opacity (not the held zero)", () => {
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new SankeyFlow("#k", { animateOnReveal: true }).draw(SAMPLE);

        // entry(false) sets the final stroke-opacity/width directly; the held
        // keyframe leaves links at stroke-opacity 0.
        const links = [...document.querySelectorAll("#k svg path.link")];
        expect(links.length).toBeGreaterThan(0);
        expect(links.every((l) => l.getAttribute("stroke-opacity") === "0.45")).toBe(true);
    });
});
