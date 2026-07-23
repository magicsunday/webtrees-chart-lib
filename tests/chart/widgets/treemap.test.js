import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import Treemap from "src/chart/widgets/treemap.js";

beforeEach(() => {
    window.matchMedia = (query) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
    });
    // jsdom never lays out SVG text, so getComputedTextLength is absent. A 0
    // stub keeps truncateToFit a no-op (labels render verbatim); the truncation
    // test overrides it to force a measured width.
    window.SVGElement.prototype.getComputedTextLength = () => 0;
});

afterEach(() => {
    document.body.innerHTML = "";
});

// Domain-neutral fixture: a dominant tile plus a couple of smaller ones, with a
// long tail folded into restMembers. A fixed 720×360 viewport makes the layout
// deterministic under jsdom (where clientWidth is 0).
const SAMPLE = {
    items: [
        { rank: 1, members: 100, label: "Alpha" },
        { rank: 2, members: 30, label: "Beta" },
        { rank: 3, members: 10, label: "Gamma" },
    ],
    restMembers: 5,
};

const makeTarget = (id = "t") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("Treemap — empty states", () => {
    test("draw(null) renders the empty state instead of crashing", () => {
        makeTarget();
        new Treemap("#t", {}).draw(null);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t .msc-treemap")).toBeNull();
    });

    test("empty items array falls through to the empty state", () => {
        makeTarget();
        new Treemap("#t", {}).draw({ items: [], restMembers: 0 });
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in the placeholder", () => {
        makeTarget();
        new Treemap("#t", { emptyMessage: "No islands" }).draw(null);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe("No islands");
    });
});

describe("Treemap — rendering", () => {
    test("renders one tile per item plus a rest tile when restMembers is positive", () => {
        makeTarget();
        new Treemap("#t", { width: 720, height: 360 }).draw(SAMPLE);
        expect(document.querySelectorAll("#t g.msc-treemap-tile").length).toBe(4);
        expect(document.querySelectorAll("#t rect.msc-treemap-rect--rest").length).toBe(1);
    });

    test("omits the rest tile when restMembers is zero", () => {
        makeTarget();
        new Treemap("#t", { width: 720, height: 360 }).draw({
            items: SAMPLE.items,
            restMembers: 0,
        });
        expect(document.querySelectorAll("#t g.msc-treemap-tile").length).toBe(3);
        expect(document.querySelectorAll("#t rect.msc-treemap-rect--rest").length).toBe(0);
    });

    test("the dominant tile carries the big-tier rank, label, value and share", () => {
        makeTarget();
        new Treemap("#t", { width: 720, height: 360 }).draw(SAMPLE);
        const labels = [...document.querySelectorAll("#t text.msc-treemap-label")].map(
            (t) => t.textContent,
        );
        expect(labels).toContain("Alpha");
        const ranks = [...document.querySelectorAll("#t text.msc-treemap-rank")].map(
            (t) => t.textContent,
        );
        expect(ranks).toContain("#1");
    });

    test("the rest tile is captioned with the restLabel option", () => {
        makeTarget();
        new Treemap("#t", { width: 720, height: 360, restLabel: "übrige Inseln" }).draw(SAMPLE);
        const restRect = document.querySelector("#t rect.msc-treemap-rect--rest");
        expect(restRect).not.toBeNull();
        // The rest tile's caption appears somewhere in the rendered text.
        const allText = [...document.querySelectorAll("#t text")].map((t) => t.textContent);
        expect(allText).toContain("übrige Inseln");
    });

    test("tints weighted tiles within the accent via color-mix; the rest tile stays neutral", () => {
        makeTarget();
        new Treemap("#t", { width: 720, height: 360, accent: "var(--slate)" }).draw(SAMPLE);
        const weighted = document.querySelector(
            "#t rect.msc-treemap-rect:not(.msc-treemap-rect--rest)",
        );
        expect(weighted.style.fill).toContain("color-mix");
        expect(weighted.style.fill).toContain("var(--slate)");
        const rest = document.querySelector("#t rect.msc-treemap-rect--rest");
        expect(rest.style.fill).toContain("var(--border-soft");
    });

    test("applies the ariaLabel option to the host svg", () => {
        makeTarget();
        new Treemap("#t", { width: 720, height: 360, ariaLabel: "Island sizes" }).draw(SAMPLE);
        expect(document.querySelector("#t svg.msc-treemap-svg").getAttribute("aria-label")).toBe(
            "Island sizes",
        );
    });

    test("truncates an overlong label to fit the tile, ending with an ellipsis", () => {
        makeTarget();
        // Force a measured width so truncateToFit actually shortens — jsdom has
        // no SVG layout, so the per-char length is simulated here.
        window.SVGElement.prototype.getComputedTextLength = function () {
            return (this.textContent ?? "").length * 100;
        };
        const longLabel = "Donaudampfschifffahrtsgesellschaft";
        new Treemap("#t", { width: 200, height: 360 }).draw({
            items: [{ rank: 1, members: 100, label: longLabel }],
            restMembers: 0,
        });
        const label = document.querySelector("#t text.msc-treemap-label");
        expect(label).not.toBeNull();
        expect(label.textContent.endsWith("…")).toBe(true);
        expect(label.textContent.length).toBeLessThan(longLabel.length);
    });
});

describe("Treemap — tooltip", () => {
    test("the tooltip names the tile, its value with unit, and its share", () => {
        makeTarget();
        new Treemap("#t", { width: 720, height: 360, valueLabel: "persons" }).draw(SAMPLE);
        document
            .querySelector("#t rect.msc-treemap-rect")
            .dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
        const tip = document.querySelector(".msc-chart-tooltip")?.textContent ?? "";
        // The first leaf is the largest (Alpha, 100 of 145 ≈ 69,0%).
        expect(tip).toContain("Alpha");
        expect(tip).toContain("100 persons");
        expect(tip).toContain("69,0%");
    });
});

describe("Treemap — sanitize", () => {
    test("drops items with a non-positive or non-finite member count", () => {
        makeTarget();
        new Treemap("#t", { width: 720, height: 360 }).draw({
            items: [
                { rank: 1, members: 50, label: "Keep" },
                { rank: 2, members: 0, label: "Zero" },
                { rank: 3, members: -4, label: "Negative" },
                { rank: 4, members: Number.NaN, label: "NaN" },
            ],
            restMembers: 0,
        });
        expect(document.querySelectorAll("#t g.msc-treemap-tile").length).toBe(1);
    });
});

describe("Treemap — native get/set accessors", () => {
    test("getters read back the constructor options", () => {
        makeTarget();
        const widget = new Treemap("#t", {
            width: 800,
            height: 400,
            accent: "var(--slate)",
            valueLabel: "persons",
            restLabel: "rest islands",
            ariaLabel: "Island sizes",
            emptyMessage: "No islands",
        });
        expect(widget.width).toBe(800);
        expect(widget.height).toBe(400);
        expect(widget.accent).toBe("var(--slate)");
        expect(widget.valueLabel).toBe("persons");
        expect(widget.restLabel).toBe("rest islands");
        expect(widget.ariaLabel).toBe("Island sizes");
        expect(widget.emptyMessage).toBe("No islands");
    });

    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new Treemap("#t", {});
        expect(widget.width).toBeUndefined();
        expect(widget.height).toBeUndefined();
        expect(widget.accent).toBe("currentColor");
        expect(widget.valueLabel).toBe("");
        expect(widget.restLabel).toBe("Rest");
        expect(widget.emptyMessage).toBe("");
    });

    test("the restLabel setter resets a non-string or empty value to the Rest default", () => {
        makeTarget();
        const widget = new Treemap("#t", { restLabel: "übrige" });
        expect(widget.restLabel).toBe("übrige");
        widget.restLabel = "";
        expect(widget.restLabel).toBe("Rest");
        widget.restLabel = /** @type {any} */ (42);
        expect(widget.restLabel).toBe("Rest");
    });

    test("the dispatcher pattern (Object.entries → widget[k] = v) configures the widget", () => {
        makeTarget();
        const widget = new Treemap("#t", {});
        for (const [key, value] of Object.entries({
            width: 640,
            height: 320,
            accent: "var(--slate)",
            valueLabel: "persons",
            restLabel: "rest",
            ariaLabel: "Islands",
            emptyMessage: "No data",
        })) {
            widget[key] = value;
        }
        expect(widget.width).toBe(640);
        expect(widget.accent).toBe("var(--slate)");
        expect(widget.restLabel).toBe("rest");
    });
});

describe("Treemap — responsive sizing", () => {
    test("an unmeasured option adopts the host element's measurement", () => {
        // An unmeasured host must adopt the host measurement, not collapse to the bare fallback. Full seam: base-widget.test.js.
        const el = makeTarget();
        Object.defineProperty(el, "clientWidth", { value: 333, configurable: true });
        Object.defineProperty(el, "clientHeight", { value: 222, configurable: true });
        new Treemap(el, {}).draw(SAMPLE);
        const viewBox = document.querySelector("#t svg").getAttribute("viewBox");
        expect(viewBox.split(" ")[2]).toBe("333");
        expect(viewBox.split(" ")[3]).toBe("222");
    });
});

describe("Treemap — empty→data redraw", () => {
    test("clears the empty-state placeholder and renders exactly one root", () => {
        makeTarget();
        const w = new Treemap("#t", {});
        w.draw(null);
        w.draw(SAMPLE);
        expect(document.querySelectorAll("#t > .chart-empty-state")).toHaveLength(0);
        expect(document.querySelectorAll("#t > div.msc-treemap")).toHaveLength(1);
    });
});

describe("Treemap — redraw idempotence", () => {
    test("a second data draw replaces the prior root rather than stacking", () => {
        // Pins the _clearRoot selector argument: a wrong selector would leave
        // the first root in place and stack a second on a data→data redraw.
        makeTarget();
        const w = new Treemap("#t", {});
        w.draw(SAMPLE);
        w.draw(SAMPLE);
        expect(document.querySelectorAll("#t > div.msc-treemap")).toHaveLength(1);
    });
});
