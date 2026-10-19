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
    test("renders one path.msc-sankey-flow-link per link", () => {
        makeTarget();
        new SankeyFlow("#k", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#k svg path.msc-sankey-flow-link")).toHaveLength(
            SAMPLE.links.length,
        );
    });
});

describe("SankeyFlow — native get/set accessors", () => {
    test("getters read back the constructor options", () => {
        makeTarget();
        const widget = new SankeyFlow("#k", {
            nodeWidth: 20,
            nodePad: 16,
        });
        expect(widget.nodeWidth).toBe(20);
        expect(widget.nodePad).toBe(16);
    });

    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new SankeyFlow("#k", {});
        expect(widget.height).toBeUndefined();
        expect(widget.margin).toEqual({ top: 8, right: 130, bottom: 8, left: 130 });
        expect(widget.nodeWidth).toBe(14);
        expect(widget.nodePad).toBe(10);
        expect(widget.ariaLabel).toBe("Sankey flow");
        expect(widget.emptyMessage).toBe("No data available");
    });

    test("the i18n setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted i18n pack exposes an empty object so lookups fall back.
        const fallback = new SankeyFlow("#k", {});
        expect(fallback.i18n).toEqual({});
        // A custom object reads back unchanged.
        const pack = { totalSingular: "{count} Person", totalPlural: "{count} Personen" };
        const widget = new SankeyFlow("#k", { i18n: pack });
        expect(widget.i18n).toEqual(pack);
        // The runtime guard resets a non-object value to an empty pack — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.i18n = /** @type {any} */ ("x");
        expect(widget.i18n).toEqual({});
    });

    test("the dispatcher pattern (Object.entries → widget[k] = v) configures the widget", () => {
        makeTarget();
        const widget = new SankeyFlow("#k", {});
        for (const [key, value] of Object.entries({
            nodeWidth: 24,
            nodePad: 12,
        })) {
            widget[key] = value;
        }
        expect(widget.nodeWidth).toBe(24);
        expect(widget.nodePad).toBe(12);
    });
});

describe("SankeyFlow — reduced-motion entrance parity", () => {
    test("renders links at full stroke-opacity (not the held zero)", () => {
        window.matchMedia = () => ({ matches: true });
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
