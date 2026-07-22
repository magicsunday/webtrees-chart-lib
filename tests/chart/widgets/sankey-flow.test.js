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
            height: 480,
            margin: { left: 40 },
            nodeWidth: 20,
            nodePad: 16,
        });
        expect(widget.height).toBe(480);
        // A partial margin only overrides the named side; the rest stay default.
        expect(widget.margin).toEqual({ top: 8, right: 130, bottom: 8, left: 40 });
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
    });

    test("the height setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new SankeyFlow("#k", {});
        widget.height = 500;
        expect(widget.height).toBe(500);
        // A non-positive value clears the override (responsive sizing).
        widget.height = -10;
        expect(widget.height).toBeUndefined();
        // The runtime guard also clears the override for a non-number value — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.height = /** @type {any} */ ("tall");
        expect(widget.height).toBeUndefined();
    });

    test("the margin setter merges over the defaults, getter reads it back", () => {
        makeTarget();
        const widget = new SankeyFlow("#k", {});
        widget.margin = { right: 60, left: 60 };
        expect(widget.margin).toEqual({ top: 8, right: 60, bottom: 8, left: 60 });
        // A missing value falls back to the full default set.
        widget.margin = /** @type {any} */ (undefined);
        expect(widget.margin).toEqual({ top: 8, right: 130, bottom: 8, left: 130 });
    });

    test("the width setter keeps a finite positive number else undefined, getter reads it back", () => {
        makeTarget();
        // An omitted width stays responsive (undefined) so draw falls back to the
        // host element's width.
        const responsive = new SankeyFlow("#k", {});
        expect(responsive.width).toBeUndefined();
        // An explicit positive width reads back unchanged.
        const widget = new SankeyFlow("#k", { width: 720 });
        expect(widget.width).toBe(720);
        // A non-positive value clears the override back to responsive sizing.
        widget.width = 0;
        expect(widget.width).toBeUndefined();
        widget.width = -1;
        expect(widget.width).toBeUndefined();
        // The runtime guard clears a non-number value — the cast simulates the
        // JSON dispatcher assigning an untyped payload value.
        widget.width = /** @type {any} */ ("wide");
        expect(widget.width).toBeUndefined();
    });

    test("the ariaLabel setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted ariaLabel exposes the default accessible name.
        const fallback = new SankeyFlow("#k", {});
        expect(fallback.ariaLabel).toBe("Sankey flow");
        // A custom string reads back unchanged.
        const widget = new SankeyFlow("#k", { ariaLabel: "Migration flow" });
        expect(widget.ariaLabel).toBe("Migration flow");
        // An empty string resets to the default.
        widget.ariaLabel = "";
        expect(widget.ariaLabel).toBe("Sankey flow");
        // The runtime guard also defaults a non-string value — the cast simulates
        // the JSON dispatcher assigning an untyped payload value.
        widget.ariaLabel = /** @type {any} */ (42);
        expect(widget.ariaLabel).toBe("Sankey flow");
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

    test("the emptyMessage setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted emptyMessage exposes the default placeholder text.
        const fallback = new SankeyFlow("#k", {});
        expect(fallback.emptyMessage).toBe("No data available");
        // A custom string reads back unchanged.
        const widget = new SankeyFlow("#k", { emptyMessage: "Nothing to show" });
        expect(widget.emptyMessage).toBe("Nothing to show");
        // An empty string is a valid emptyMessage (only non-string resets).
        widget.emptyMessage = "";
        expect(widget.emptyMessage).toBe("");
        // The runtime guard resets a non-string value to the default — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.emptyMessage = /** @type {any} */ (42);
        expect(widget.emptyMessage).toBe("No data available");
    });

    test("the dispatcher pattern (Object.entries → widget[k] = v) configures the widget", () => {
        makeTarget();
        const widget = new SankeyFlow("#k", {});
        for (const [key, value] of Object.entries({
            height: 400,
            nodeWidth: 24,
            nodePad: 12,
            ariaLabel: "Flow diagram",
        })) {
            widget[key] = value;
        }
        expect(widget.height).toBe(400);
        expect(widget.nodeWidth).toBe(24);
        expect(widget.nodePad).toBe(12);
        expect(widget.ariaLabel).toBe("Flow diagram");
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

describe("SankeyFlow — responsive sizing", () => {
    test("responsive height: an unset height adopts the host element's clientHeight", () => {
        const el = makeTarget();
        Object.defineProperty(el, "clientHeight", { value: 321, configurable: true });
        new SankeyFlow(el, {}).draw(SAMPLE);
        const viewBox = document.querySelector("#k svg.msc-sankey-flow").getAttribute("viewBox");
        // Host reports no width here, so width is this widget's own fallback — pins the FIRST arg (the floor test pins the second). Full seam: base-widget.test.js.
        expect(viewBox.split(" ")[2]).toBe("900");
        expect(viewBox.split(" ")[3]).toBe("321"); // "0 0 <width> <height>"
    });

    test("a host narrower than the floor renders at the 360 px floor, not the fallback", () => {
        // Below-floor host clamps to the minimum, not the fallback — pins the (fallback, minimum) order. Full seam: base-widget.test.js.
        const el = makeTarget();
        Object.defineProperty(el, "clientWidth", { value: 100, configurable: true });
        new SankeyFlow(el, {}).draw(SAMPLE);
        const viewBox = document.querySelector("#k svg.msc-sankey-flow").getAttribute("viewBox");
        expect(viewBox.split(" ")[2]).toBe("360");
    });
});
