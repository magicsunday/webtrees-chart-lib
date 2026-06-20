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
