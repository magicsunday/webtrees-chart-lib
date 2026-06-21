import { afterEach, describe, expect, test } from "@jest/globals";

import SequenceChain from "src/chart/widgets/sequence-chain.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const makeTarget = (id = "t") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

const sample = (count = 4) =>
    Array.from({ length: count }, (_, index) => ({
        id: `i${index}`,
        label: `First${index} Last${index}`,
        sublabel: `*${1900 + index}`,
        group: index % 2 === 0 ? "a" : "b",
        href: `#/item/${index}`,
    }));

describe("SequenceChain — empty + null states", () => {
    test("draw(null) renders empty-state, no beads", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw(null);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t .msc-sequence-chain-bead")).toBeNull();
    });

    test("draw(undefined) renders empty-state instead of crashing", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw(undefined);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t .msc-sequence-chain-bead")).toBeNull();
    });

    test("draw({items: []}) renders empty-state, no beads", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({ items: [] });
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t .msc-sequence-chain-bead")).toBeNull();
    });

    test("a custom emptyMessage surfaces in the placeholder text", () => {
        makeTarget();
        new SequenceChain("#t", { emptyMessage: "No chain yet" }).draw({ items: [] });
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe("No chain yet");
    });
});

describe("SequenceChain — neutral DOM contract", () => {
    test("4 items render 4 beads and 3 connector links (N → N-1)", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({ items: sample(4) });

        expect(document.querySelectorAll("#t a.msc-sequence-chain-bead")).toHaveLength(4);
        expect(document.querySelectorAll("#t .msc-sequence-chain-link")).toHaveLength(3);
    });

    test("a single item renders 1 bead and 0 links", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({ items: sample(1) });

        expect(document.querySelectorAll("#t a.msc-sequence-chain-bead")).toHaveLength(1);
        expect(document.querySelectorAll("#t .msc-sequence-chain-link")).toHaveLength(0);
    });

    test("roots under div.msc-sequence-chain holding a scroll container", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({ items: sample(2) });

        expect(document.querySelector("#t > div.msc-sequence-chain")).not.toBeNull();
        expect(
            document.querySelector("#t .msc-sequence-chain > .msc-sequence-chain-scroll"),
        ).not.toBeNull();
    });

    test("each bead carries its href and data-group", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({ items: sample(4) });

        const beads = document.querySelectorAll("#t a.msc-sequence-chain-bead");
        expect(beads[0].getAttribute("href")).toBe("#/item/0");
        expect(beads[0].getAttribute("data-group")).toBe("a");
        expect(beads[1].getAttribute("href")).toBe("#/item/1");
        expect(beads[1].getAttribute("data-group")).toBe("b");
    });

    test("a missing group leaves no data-group attribute", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [{ id: "x", label: "Ada Lovelace", sublabel: "", href: "#/x" }],
        });
        const bead = document.querySelector("#t a.msc-sequence-chain-bead");
        expect(bead.hasAttribute("data-group")).toBe(false);
    });

    test("a missing href leaves no href attribute", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [{ id: "x", label: "Ada Lovelace", sublabel: "" }],
        });
        const bead = document.querySelector("#t a.msc-sequence-chain-bead");
        expect(bead.hasAttribute("href")).toBe(false);
    });

    test("a hostile javascript: href never reaches the bead's href attribute", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [
                { id: "a", label: "Ada Lovelace", sublabel: "", href: "javascript:alert(1)" },
                { id: "b", label: "Grace Hopper", sublabel: "", href: "#/b" },
            ],
        });
        const beads = document.querySelectorAll("#t a.msc-sequence-chain-bead");
        // The blocked bead carries no href at all; the safe bead keeps its href.
        expect(beads[0].hasAttribute("href")).toBe(false);
        expect(beads[1].getAttribute("href")).toBe("#/b");
        // No bead on the page carries a javascript: scheme.
        expect(document.querySelector('#t a[href^="javascript:"]')).toBeNull();
    });

    test("the disc shows two-letter initials derived from the label", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [{ id: "x", label: "Ada Lovelace", sublabel: "*1815", group: "a", href: "#/x" }],
        });
        const disc = document.querySelector("#t .msc-sequence-chain-bead .msc-sequence-chain-disc");
        expect(disc).not.toBeNull();
        expect(disc.textContent).toBe("AL");
    });

    test("a single-word label yields a single initial", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [{ id: "x", label: "Cher", sublabel: "", href: "#/x" }],
        });
        expect(document.querySelector("#t .msc-sequence-chain-disc").textContent).toBe("C");
    });

    // One row per observable initials() branch: empty/whitespace → "", the 2-word
    // cap, lowercase uppercasing, inner-whitespace collapse, and a non-BMP first
    // character taken as a whole code point (not a split surrogate half).
    test.each([
        ["empty label", "", ""],
        ["whitespace-only label", "   ", ""],
        ["three words caps at two initials", "Ada Byron Lovelace", "AB"],
        ["lowercase words are uppercased", "ada lovelace", "AL"],
        ["collapses runs of inner whitespace", "Ada   Lovelace", "AL"],
        ["non-BMP first letter is kept whole", "𝒜lice", "𝒜"],
    ])("initials: %s", (_name, label, expected) => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [{ id: "x", label, sublabel: "", href: "#/x" }],
        });
        expect(document.querySelector("#t .msc-sequence-chain-disc").textContent).toBe(expected);
    });

    test("string fields are trimmed; a non-string group is coerced to its string", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [
                {
                    id: "x",
                    label: "  Ada  Lovelace  ",
                    sublabel: "  *1815  ",
                    group: /** @type {any} */ (5),
                    href: "  #/x  ",
                },
            ],
        });
        const bead = document.querySelector("#t a.msc-sequence-chain-bead");
        expect(bead.getAttribute("href")).toBe("#/x");
        expect(bead.getAttribute("data-group")).toBe("5");
        expect(bead.querySelector(".msc-sequence-chain-label").textContent).toBe("Ada  Lovelace");
        expect(bead.querySelector(".msc-sequence-chain-sublabel").textContent).toBe("*1815");
    });

    test("drops null / non-object entries inside items, keeping only real beads", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [
                { id: "a", label: "Ada Lovelace", sublabel: "", href: "#/a" },
                null,
                7,
                "x",
                { id: "b", label: "Grace Hopper", sublabel: "", href: "#/b" },
            ],
        });
        expect(document.querySelectorAll("#t a.msc-sequence-chain-bead")).toHaveLength(2);
        // Two real beads → exactly one connector between them.
        expect(document.querySelectorAll("#t .msc-sequence-chain-link")).toHaveLength(1);
    });

    test("the label and sublabel render as text in the bead", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [{ id: "x", label: "Ada Lovelace", sublabel: "*1815–1852", href: "#/x" }],
        });
        const bead = document.querySelector("#t a.msc-sequence-chain-bead");
        expect(bead.querySelector(".msc-sequence-chain-label").textContent).toBe("Ada Lovelace");
        expect(bead.querySelector(".msc-sequence-chain-sublabel").textContent).toBe("*1815–1852");
    });

    test("each connector link holds the inline ring glyph svg", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({ items: sample(3) });
        const links = document.querySelectorAll("#t .msc-sequence-chain-link");
        expect(links).toHaveLength(2);
        for (const link of links) {
            expect(link.querySelector("svg.msc-sequence-chain-ring")).not.toBeNull();
        }
    });
});

describe("SequenceChain — styled tooltip", () => {
    test("an item's title drives the tooltip content on bead hover", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [
                {
                    id: "x",
                    label: "Ada Lovelace",
                    sublabel: "*1815",
                    href: "#/x",
                    title: "Ada Lovelace · rich detail",
                },
            ],
        });
        const bead = document.querySelector("#t a.msc-sequence-chain-bead");
        bead.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip).not.toBeNull();
        expect(tooltip.classList.contains("is-visible")).toBe(true);
        expect(tooltip.textContent).toContain("Ada Lovelace · rich detail");
    });

    test("a bead without a title falls back to label · sublabel", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [{ id: "x", label: "Ada Lovelace", sublabel: "*1815", href: "#/x" }],
        });
        const bead = document.querySelector("#t a.msc-sequence-chain-bead");
        bead.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip.textContent).toContain("Ada Lovelace · *1815");
    });

    test("a bead with a label but no sublabel falls back to just the label", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [{ id: "x", label: "Cher", sublabel: "", href: "#/x" }],
        });
        const bead = document.querySelector("#t a.msc-sequence-chain-bead");
        bead.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip.textContent).toContain("Cher");
        expect(tooltip.textContent).not.toContain("·");
    });

    test("a hostile title is escaped, never parsed into live markup", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [
                {
                    id: "x",
                    label: "Ada Lovelace",
                    sublabel: "",
                    href: "#/x",
                    title: "<img src=x onerror=alert(1)>",
                },
            ],
        });
        const bead = document.querySelector("#t a.msc-sequence-chain-bead");
        bead.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip.querySelector("img")).toBeNull();
        expect(tooltip.textContent).toContain("<img src=x onerror=alert(1)>");
    });

    test("mouseleave hides the tooltip", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({
            items: [{ id: "x", label: "Ada Lovelace", sublabel: "*1815", href: "#/x" }],
        });
        const bead = document.querySelector("#t a.msc-sequence-chain-bead");
        bead.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        bead.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip.classList.contains("is-visible")).toBe(false);
    });
});

describe("SequenceChain — redraw", () => {
    test("a second draw replaces the previous chain, never stacks", () => {
        makeTarget();
        const widget = new SequenceChain("#t", {});
        widget.draw({ items: sample(4) });
        widget.draw({ items: sample(2) });
        expect(document.querySelectorAll("#t .msc-sequence-chain")).toHaveLength(1);
        expect(document.querySelectorAll("#t a.msc-sequence-chain-bead")).toHaveLength(2);
    });

    test("a redraw from a populated chain to empty data clears the chain root", () => {
        makeTarget();
        const widget = new SequenceChain("#t", {});
        widget.draw({ items: sample(4) });
        widget.draw({ items: [] });
        // The whole chain root is removed, not just its beads — no stale shell.
        expect(document.querySelector("#t .msc-sequence-chain")).toBeNull();
        expect(document.querySelector("#t .msc-sequence-chain-bead")).toBeNull();
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });
});

describe("SequenceChain — scroll edge-fade flags", () => {
    test("both flags start cleared at rest (jsdom scroll metrics are 0)", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({ items: sample(4) });
        const scroll = document.querySelector("#t .msc-sequence-chain-scroll");
        // In jsdom every scroll metric is 0, so neither edge is faded.
        expect(scroll.hasAttribute("data-start")).toBe(false);
        expect(scroll.hasAttribute("data-end")).toBe(false);
    });

    test("a scroll event flips data-end on when content overflows to the right", () => {
        makeTarget();
        new SequenceChain("#t", {}).draw({ items: sample(4) });
        const scroll = document.querySelector("#t .msc-sequence-chain-scroll");
        // jsdom never lays out, so feed the scroll geometry: a 100px viewport over
        // 500px of content, parked at the left edge → end faded, start not.
        Object.defineProperty(scroll, "clientWidth", { configurable: true, value: 100 });
        Object.defineProperty(scroll, "scrollWidth", { configurable: true, value: 500 });
        scroll.scrollLeft = 0;
        scroll.dispatchEvent(new Event("scroll"));
        expect(scroll.getAttribute("data-end")).toBe("1");
        expect(scroll.hasAttribute("data-start")).toBe(false);

        // Scroll to the far right → start faded, end cleared.
        scroll.scrollLeft = 400;
        scroll.dispatchEvent(new Event("scroll"));
        expect(scroll.getAttribute("data-start")).toBe("1");
        expect(scroll.hasAttribute("data-end")).toBe(false);
    });
});
