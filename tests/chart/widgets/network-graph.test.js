import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import NetworkGraph from "src/chart/widgets/network-graph.js";

beforeEach(() => {
    // Default to reduced motion so the static layout renders synchronously and
    // the determinism assertions read the resting coordinates directly.
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

const makeTarget = (id = "t") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

// Domain-neutral fixture: a five-node chain with one highlighted path. Labels
// and groups are abstract so nothing leaks a marriage/sex vocabulary.
const SAMPLE = {
    nodes: [
        { id: "a", label: "Alpha", group: "g1", href: "#/a" },
        { id: "b", label: "Beta", group: "g1", emphasis: true, href: "#/b" },
        { id: "c", label: "Gamma", group: "g2", href: "#/c" },
        { id: "d", label: "Delta", group: "g2", href: "#/d" },
        { id: "e", label: "Epsilon", group: "g3", href: "#/e" },
    ],
    links: [
        { source: "a", target: "b", highlighted: true },
        { source: "b", target: "c", highlighted: true },
        { source: "c", target: "d" },
        { source: "d", target: "e" },
    ],
    highlightPath: ["a", "b", "c"],
    hubId: "b",
    totalCount: 5,
    shownCount: 5,
};

describe("NetworkGraph — empty states", () => {
    test("draw(null) renders the empty state, no svg", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(null);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("draw(undefined) renders the empty state instead of crashing", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(undefined);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("empty nodes array falls through to the empty state", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw({ nodes: [], links: [] });
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t .msc-network-graph")).toBeNull();
    });

    test("custom emptyMessage surfaces in the placeholder", () => {
        makeTarget();
        new NetworkGraph("#t", { emptyMessage: "No network yet" }).draw(null);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe(
            "No network yet",
        );
    });
});

describe("NetworkGraph — neutral DOM contract", () => {
    test("renders one node circle per node and one line per link", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#t svg.msc-network-graph")).toHaveLength(1);
        expect(document.querySelectorAll("#t circle.msc-network-graph-node")).toHaveLength(5);
        expect(document.querySelectorAll("#t line.msc-network-graph-edge")).toHaveLength(4);
    });

    test("edges are painted before nodes (draw order)", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const edges = document.querySelector("#t .msc-network-graph-edges");
        const nodes = document.querySelector("#t .msc-network-graph-nodes");
        expect(edges).not.toBeNull();
        expect(nodes).not.toBeNull();
        // The edges group precedes the nodes group in document order.
        expect(
            edges.compareDocumentPosition(nodes) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    test("highlightPath edges carry the accent class", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const highlighted = document.querySelectorAll(
            "#t line.msc-network-graph-edge--highlighted",
        );
        // a→b and b→c are on the highlight path; the other two are not. Pin the
        // IDENTITY (not just the count): the highlighted edges must connect the
        // expected node endpoints, so accenting the wrong two lines would fail.
        expect(highlighted).toHaveLength(2);
        const coord = (id) => {
            const circle = document.querySelector(
                `#t a[href="#/${id}"] circle.msc-network-graph-node`,
            );
            return `${circle.getAttribute("cx")},${circle.getAttribute("cy")}`;
        };
        const endpointsOf = (line) =>
            [
                `${line.getAttribute("x1")},${line.getAttribute("y1")}`,
                `${line.getAttribute("x2")},${line.getAttribute("y2")}`,
            ]
                .sort()
                .join("|");
        const highlightedPairs = Array.from(highlighted).map(endpointsOf).sort();
        const expectedPairs = [
            [coord("a"), coord("b")].sort().join("|"),
            [coord("b"), coord("c")].sort().join("|"),
        ].sort();
        expect(highlightedPairs).toEqual(expectedPairs);
    });

    test("highlightPath nodes carry the accent class — exactly a, b, c", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const highlighted = document.querySelectorAll(
            "#t circle.msc-network-graph-node--highlighted",
        );
        // Identity, not just cardinality: the accented circles are the three
        // highlight-path nodes, not any other three.
        const hrefs = Array.from(highlighted)
            .map((circle) => circle.closest("a").getAttribute("href"))
            .sort();
        expect(hrefs).toEqual(["#/a", "#/b", "#/c"]);
    });

    test("a node carries its href (via wrapping <a>) and data-group", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const anchor = document.querySelector('#t a[href="#/a"]');
        expect(anchor).not.toBeNull();
        const circle = anchor.querySelector("circle.msc-network-graph-node");
        expect(circle).not.toBeNull();
        expect(circle.getAttribute("data-group")).toBe("g1");
        // The widget assigns NO colour by group — the consumer styles via CSS.
        expect(circle.getAttribute("fill")).toBeNull();
    });

    test("an emphasis node carries the --emphasis modifier class", () => {
        makeTarget();
        // Node `c` is emphasis-only (not the hub, not on the highlight path),
        // so its emphasised state must be CSS-addressable via the modifier.
        new NetworkGraph("#t", {}).draw({
            ...SAMPLE,
            nodes: [
                { id: "a", label: "Alpha", href: "#/a" },
                { id: "c", label: "Gamma", emphasis: true, href: "#/c" },
            ],
            links: [],
            highlightPath: [],
            hubId: "",
        });
        const circle = document.querySelector('#t a[href="#/c"] circle.msc-network-graph-node');
        expect(circle.classList.contains("msc-network-graph-node--emphasis")).toBe(true);
        const plain = document.querySelector('#t a[href="#/a"] circle.msc-network-graph-node');
        expect(plain.classList.contains("msc-network-graph-node--emphasis")).toBe(false);
    });

    test("a hostile javascript: href never reaches the node's <a> href attribute", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw({
            nodes: [
                { id: "a", label: "Alpha", href: "javascript:alert(1)" },
                { id: "b", label: "Beta", href: "#/b" },
            ],
            links: [],
        });
        const anchors = document.querySelectorAll("#t .msc-network-graph-nodes a");
        // The blocked node carries no href at all; the safe node keeps its href.
        const hrefs = Array.from(anchors).map((a) => a.getAttribute("href"));
        expect(hrefs).not.toContain("javascript:alert(1)");
        expect(document.querySelector('#t a[href="#/b"]')).not.toBeNull();
        // No anchor on the page carries a javascript: scheme.
        expect(document.querySelector('#t a[href^="javascript:"]')).toBeNull();
    });

    test("the hub / emphasis node renders a larger radius than a plain node", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const hub = document.querySelector('#t a[href="#/b"] circle.msc-network-graph-node');
        const plain = document.querySelector('#t a[href="#/e"] circle.msc-network-graph-node');
        expect(Number(hub.getAttribute("r"))).toBeGreaterThan(Number(plain.getAttribute("r")));
    });
});

describe("NetworkGraph — deterministic layout", () => {
    const readCoords = () =>
        Array.from(document.querySelectorAll("#t circle.msc-network-graph-node")).map((c) => ({
            cx: c.getAttribute("cx"),
            cy: c.getAttribute("cy"),
        }));

    test("the same input drawn twice yields byte-identical node coordinates", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const first = readCoords();

        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const second = readCoords();

        expect(second).toEqual(first);
        // Sanity: coordinates are FINITE real numbers (a NaN regression would
        // make toEqual pass vacuously) and spread out on both axes, not all
        // collapsed to a single point.
        for (const point of first) {
            expect(Number.isFinite(Number(point.cx))).toBe(true);
            expect(Number.isFinite(Number(point.cy))).toBe(true);
        }
        expect(new Set(first.map((p) => p.cx)).size).toBeGreaterThan(1);
        expect(new Set(first.map((p) => p.cy)).size).toBeGreaterThan(1);
    });

    test("the layout is identical whether or not reduced motion is active", () => {
        // The solver runs once at draw time; reduced motion only drops the
        // `--anim` class, it must NEVER mutate the resting coordinates. Drawing
        // with the animated path and comparing to the reduced-motion render locks
        // that "geometry identical either way" contract.
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const reduced = readCoords();

        window.matchMedia = (query) => ({
            matches: false, // animated path: prefers-reduced-motion is OFF
            media: query,
            addEventListener() {},
            removeEventListener() {},
        });
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const animated = readCoords();

        expect(animated).toEqual(reduced);
    });
});

describe("NetworkGraph — name labels", () => {
    test("renders exactly the endpoint + hub labels (two chain ends + hub)", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const labels = document.querySelectorAll("#t text.msc-network-graph-label");
        // highlightPath = [a, b, c]; endpoints a and c, plus hub b. b is both an
        // endpoint and the hub, so the de-duplicated set is exactly {a, b, c}.
        expect(labels).toHaveLength(3);
        const texts = Array.from(labels)
            .map((node) => node.textContent)
            .sort();
        expect(texts).toEqual(["Alpha", "Beta", "Gamma"]);
    });

    test("a label sits above its node (y = cy - r - 7, text-anchor middle)", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        // Node `a` (Alpha) is an endpoint, not the hub → highlight radius.
        const circle = document.querySelector('#t a[href="#/a"] circle.msc-network-graph-node');
        const label = Array.from(document.querySelectorAll("#t text.msc-network-graph-label")).find(
            (node) => node.textContent === "Alpha",
        );
        expect(label).not.toBeUndefined();
        expect(label.getAttribute("text-anchor")).toBe("middle");
        expect(label.getAttribute("x")).toBe(circle.getAttribute("cx"));
        const cy = Number(circle.getAttribute("cy"));
        const r = Number(circle.getAttribute("r"));
        expect(Number(label.getAttribute("y"))).toBeCloseTo(cy - r - 7, 6);
    });

    test("a plain node off the path / hub carries no label", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        // Node `e` (Epsilon) is neither an endpoint nor the hub.
        const texts = Array.from(document.querySelectorAll("#t text.msc-network-graph-label")).map(
            (node) => node.textContent,
        );
        expect(texts).not.toContain("Epsilon");
    });
});

describe("NetworkGraph — styled tooltip", () => {
    test("a node's title field drives the tooltip content on mousemove", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw({
            ...SAMPLE,
            nodes: SAMPLE.nodes.map((node) =>
                node.id === "a" ? { ...node, title: "Alpha · rich detail" } : node,
            ),
        });
        const anchor = document.querySelector('#t a[href="#/a"]');
        anchor.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip).not.toBeNull();
        expect(tooltip.classList.contains("is-visible")).toBe(true);
        expect(tooltip.textContent).toContain("Alpha · rich detail");
    });

    test("a node without a title falls back to its label in the tooltip", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const anchor = document.querySelector('#t a[href="#/c"]');
        anchor.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip.textContent).toContain("Gamma");
    });

    test("a hostile title is escaped, never parsed into live markup", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw({
            ...SAMPLE,
            nodes: SAMPLE.nodes.map((node) =>
                node.id === "a" ? { ...node, title: "<img src=x onerror=alert(1)>" } : node,
            ),
        });
        const anchor = document.querySelector('#t a[href="#/a"]');
        anchor.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip.querySelector("img")).toBeNull();
        expect(tooltip.textContent).toContain("<img src=x onerror=alert(1)>");
    });

    test("mouseleave hides the tooltip", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const anchor = document.querySelector('#t a[href="#/a"]');
        anchor.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
        anchor.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip.classList.contains("is-visible")).toBe(false);
    });
});

describe("NetworkGraph — cap badge", () => {
    test("shownCount < totalCount renders the i18n badge text", () => {
        makeTarget();
        new NetworkGraph("#t", {
            i18n: { capBadge: "showing {shown} of {total}" },
        }).draw({ ...SAMPLE, shownCount: 5, totalCount: 42 });
        const badge = document.querySelector("#t .msc-network-graph-badge");
        expect(badge).not.toBeNull();
        expect(badge.textContent).toBe("showing 5 of 42");
    });

    test("shownCount == totalCount renders no badge", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        expect(document.querySelector("#t .msc-network-graph-badge")).toBeNull();
    });
});
