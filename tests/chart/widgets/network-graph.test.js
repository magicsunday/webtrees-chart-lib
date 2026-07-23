import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import NetworkGraph, { fitToAspect, placeLabels } from "src/chart/widgets/network-graph.js";

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

    test("an endpoint label sits above its node (y < cy, text-anchor middle)", () => {
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
        // Above the node center, and the endpoint carries no shifted baseline.
        expect(Number(label.getAttribute("y"))).toBeLessThan(cy);
        expect(Number(label.getAttribute("y"))).toBeCloseTo(cy - r - 7, 6);
        expect(label.getAttribute("dominant-baseline")).toBeNull();
    });

    test("the hub label sits BELOW its node while an endpoint label sits ABOVE", () => {
        makeTarget();
        // Distinct hub (`d`) and endpoints (`a`, `e`) so the two label y-bands
        // can never collapse onto the same node — a real discriminator: pushing
        // the hub label back above its node (cy - r - 7) fails this RED.
        new NetworkGraph("#t", {}).draw({
            ...SAMPLE,
            highlightPath: ["a", "c", "e"],
            hubId: "d",
        });
        const hubCircle = document.querySelector('#t a[href="#/d"] circle.msc-network-graph-node');
        const hubLabel = Array.from(
            document.querySelectorAll("#t text.msc-network-graph-label"),
        ).find((node) => node.textContent === "Delta");
        const endCircle = document.querySelector('#t a[href="#/a"] circle.msc-network-graph-node');
        const endLabel = Array.from(
            document.querySelectorAll("#t text.msc-network-graph-label"),
        ).find((node) => node.textContent === "Alpha");

        expect(hubLabel).not.toBeUndefined();
        expect(endLabel).not.toBeUndefined();

        const hubCy = Number(hubCircle.getAttribute("cy"));
        const hubR = Number(hubCircle.getAttribute("r"));
        const endCy = Number(endCircle.getAttribute("cy"));
        const endR = Number(endCircle.getAttribute("r"));

        // Hub label below its node, with the under-node baseline; endpoint above.
        expect(Number(hubLabel.getAttribute("y"))).toBeGreaterThan(hubCy);
        expect(Number(hubLabel.getAttribute("y"))).toBeCloseTo(hubCy + hubR + 14, 6);
        expect(hubLabel.getAttribute("dominant-baseline")).toBe("text-before-edge");
        expect(Number(endLabel.getAttribute("y"))).toBeLessThan(endCy);
        expect(Number(endLabel.getAttribute("y"))).toBeCloseTo(endCy - endR - 7, 6);
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

describe("placeLabels — collision resolution", () => {
    test("a non-overlapping endpoint and hub keep their default placement", () => {
        // Far apart horizontally → no collision → exact default offsets.
        const placed = placeLabels([
            { id: "a", x: 0, y: 100, r: 7.5, isHub: false, label: "A" },
            { id: "d", x: 400, y: 100, r: 11, isHub: true, label: "D" },
        ]);

        // Endpoint default baseline: cy - r - 7; hub default top: cy + r + 14.
        expect(placed.byId.a.y).toBeCloseTo(100 - 7.5 - 7, 6);
        expect(placed.byId.d.y).toBeCloseTo(100 + 11 + 14, 6);
    });

    test("two endpoint labels whose default boxes overlap are pushed apart", () => {
        // Same node y, a few px apart in x, with long names → the default label
        // boxes (both above their node) overlap. The second must be lifted clear.
        const placed = placeLabels([
            { id: "a", x: 100, y: 100, r: 7.5, isHub: false, label: "Eleanor of Austria" },
            { id: "b", x: 112, y: 100, r: 7.5, isHub: false, label: "Emanuel the First" },
        ]);

        // First keeps the default; second is lifted so the bands no longer share
        // the cy - r - 7 line.
        expect(placed.byId.a.y).toBeCloseTo(100 - 7.5 - 7, 6);
        expect(placed.byId.b.y).toBeLessThan(placed.byId.a.y);

        // The resolved boxes must not overlap (font-size band, 11 units tall).
        const [boxA, boxB] = placed.boxes;
        const verticalGap = boxA.top - boxB.bottom;
        const horizontalOverlap = boxA.left < boxB.right && boxA.right > boxB.left;
        expect(horizontalOverlap).toBe(true);
        expect(verticalGap).toBeGreaterThanOrEqual(0);
    });

    test("a hub sitting ABOVE an endpoint separates (must not converge)", () => {
        // The hub's node is higher up than the endpoint's; their default labels
        // (hub below its node, endpoint above its node) land in the gap between
        // and overlap. A fixed up/down rule would push them TOWARD each other —
        // this pins that they diverge instead.
        const placed = placeLabels([
            { id: "hub", x: 200, y: 100, r: 11, isHub: true, label: "Eleanor of Austria" },
            { id: "end", x: 215, y: 150, r: 7.5, isHub: false, label: "Emanuel the First" },
        ]);

        const [hubBox, endBox] = placed.boxes;
        const overlap =
            hubBox.left < endBox.right &&
            hubBox.right > endBox.left &&
            hubBox.top < endBox.bottom &&
            hubBox.bottom > endBox.top;
        expect(overlap).toBe(false);
    });

    test("an endpoint and the hub on the same node column never overlap", () => {
        // Endpoint above, hub below the SAME coordinates → opposite directions,
        // so they separate without any push.
        const placed = placeLabels([
            { id: "a", x: 50, y: 50, r: 7.5, isHub: false, label: "Very Long Endpoint Name" },
            { id: "h", x: 50, y: 50, r: 11, isHub: true, label: "Very Long Hub Name Here" },
        ]);

        const [endpoint, hub] = placed.boxes;
        const overlap =
            endpoint.left < hub.right &&
            endpoint.right > hub.left &&
            endpoint.top < hub.bottom &&
            endpoint.bottom > hub.top;
        expect(overlap).toBe(false);
    });
});

describe("fitToAspect — anisotropic layout fill", () => {
    const span = (pts, key) =>
        Math.max(...pts.map((p) => p[key])) - Math.min(...pts.map((p) => p[key]));
    const aspect = (pts) => span(pts, "x") / span(pts, "y");
    const square = () => [
        { x: 0, y: 0, vx: 0, vy: 0 },
        { x: 100, y: 0, vx: 0, vy: 0 },
        { x: 0, y: 100, vx: 0, vy: 0 },
        { x: 100, y: 100, vx: 0, vy: 0 },
    ];

    test("widens a square blob to a wide target aspect, around its centre", () => {
        const pts = square();
        fitToAspect(pts, 2);

        // Content aspect now matches the wide target so `meet` fills the width.
        expect(aspect(pts)).toBeCloseTo(2, 5);
        // The vertical extent is untouched — only x is stretched.
        expect(span(pts, "y")).toBeCloseTo(100, 5);
        // The stretch is centred: the x-midpoint (50) is preserved.
        const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
        expect(cx).toBeCloseTo(50, 5);
    });

    test("grows the short axis when the blob is already wider than the target", () => {
        const pts = [
            { x: 0, y: 0, vx: 0, vy: 0 },
            { x: 300, y: 0, vx: 0, vy: 0 },
            { x: 0, y: 100, vx: 0, vy: 0 },
            { x: 300, y: 100, vx: 0, vy: 0 },
        ];
        fitToAspect(pts, 1.5);

        expect(aspect(pts)).toBeCloseTo(1.5, 5);
        // x (the already-wide axis) is left alone; y grows to meet the target.
        expect(span(pts, "x")).toBeCloseTo(300, 5);
        expect(span(pts, "y")).toBeCloseTo(200, 5);
    });

    test("caps an extreme stretch so a near-collinear excerpt cannot blow up", () => {
        // spanX 20, spanY 100 → contentAspect 0.2; reaching target 2 would need a
        // 10x stretch, but the cap holds it to 3 → resulting aspect 0.6.
        const pts = [
            { x: 0, y: 0, vx: 0, vy: 0 },
            { x: 20, y: 0, vx: 0, vy: 0 },
            { x: 0, y: 100, vx: 0, vy: 0 },
            { x: 20, y: 100, vx: 0, vy: 0 },
        ];
        fitToAspect(pts, 2);

        expect(aspect(pts)).toBeCloseTo(0.6, 5);
    });

    test("leaves a degenerate collinear layout untouched (no NaN)", () => {
        const pts = [
            { x: 0, y: 0, vx: 0, vy: 0 },
            { x: 50, y: 0, vx: 0, vy: 0 },
            { x: 100, y: 0, vx: 0, vy: 0 },
        ];
        fitToAspect(pts, 2);

        expect(pts.map((p) => p.x)).toEqual([0, 50, 100]);
        expect(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    });
});

describe("NetworkGraph — styled tooltip", () => {
    test("a node's title field drives the tooltip content on hover", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw({
            ...SAMPLE,
            nodes: SAMPLE.nodes.map((node) =>
                node.id === "a" ? { ...node, title: "Alpha · rich detail" } : node,
            ),
        });
        const anchor = document.querySelector('#t a[href="#/a"]');
        anchor.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip).not.toBeNull();
        expect(tooltip.classList.contains("is-visible")).toBe(true);
        expect(tooltip.textContent).toContain("Alpha · rich detail");
    });

    test("a node without a title falls back to its label in the tooltip", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const anchor = document.querySelector('#t a[href="#/c"]');
        anchor.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
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
        anchor.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        const tooltip = document.body.querySelector(".msc-chart-tooltip");
        expect(tooltip.querySelector("img")).toBeNull();
        expect(tooltip.textContent).toContain("<img src=x onerror=alert(1)>");
    });

    test("mouseleave hides the tooltip", () => {
        makeTarget();
        new NetworkGraph("#t", {}).draw(SAMPLE);
        const anchor = document.querySelector('#t a[href="#/a"]');
        anchor.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
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

describe("NetworkGraph — responsive sizing", () => {
    test("an unset width adopts the host element's clientWidth", () => {
        // The svg keeps width="100%", so the resolved width is observable through
        // the fitted layout viewBox rather than a literal width attribute.
        const el = makeTarget();
        Object.defineProperty(el, "clientWidth", { value: 333, configurable: true });
        Object.defineProperty(el, "clientHeight", { value: 222, configurable: true });
        new NetworkGraph(el, {}).draw(SAMPLE);
        const narrowViewBox = document.querySelector("#t svg").getAttribute("viewBox");

        const defaultWidthEl = makeTarget();
        Object.defineProperty(defaultWidthEl, "clientHeight", { value: 222, configurable: true });
        new NetworkGraph(defaultWidthEl, {}).draw(SAMPLE);
        const defaultWidthViewBox = document.querySelector("#t svg").getAttribute("viewBox");

        expect(narrowViewBox).not.toBe(defaultWidthViewBox);
    });

    test("an unset height adopts the host element's clientHeight", () => {
        // The width feeds the fitted layout viewBox, but the resolved height is
        // applied straight to the svg's height attribute — which is what pins
        // the seam call here.
        const el = makeTarget();
        Object.defineProperty(el, "clientHeight", { value: 222, configurable: true });
        new NetworkGraph(el, {}).draw(SAMPLE);
        expect(document.querySelector("#t svg").getAttribute("height")).toBe("222");
    });
});

describe("NetworkGraph — empty→data redraw", () => {
    test("clears the empty-state placeholder and renders exactly one root", () => {
        makeTarget();
        const w = new NetworkGraph("#t", {});
        w.draw(null);
        w.draw(SAMPLE);
        expect(document.querySelectorAll("#t > .chart-empty-state")).toHaveLength(0);
        expect(document.querySelectorAll("#t > div.msc-network-graph-wrapper")).toHaveLength(1);
    });
});

describe("NetworkGraph — redraw idempotence", () => {
    test("a second data draw replaces the prior root rather than stacking", () => {
        // Pins the _clearRoot selector argument: a wrong selector would leave
        // the first root in place and stack a second on a data→data redraw.
        makeTarget();
        const w = new NetworkGraph("#t", {});
        w.draw(SAMPLE);
        w.draw(SAMPLE);
        expect(document.querySelectorAll("#t > div.msc-network-graph-wrapper")).toHaveLength(1);
    });
});
