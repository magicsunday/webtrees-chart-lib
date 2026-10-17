import { describe, expect, test } from "@jest/globals";

import {
    computeLayout,
    fitToAspect,
    nodeRadius,
    placeLabels,
} from "src/chart/layout/network-layout.js";

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

describe("nodeRadius — role radii", () => {
    test("the hub is the largest, a highlighted or emphasised node mid-sized, any other plain", () => {
        expect(nodeRadius({ isHub: true, emphasis: false, onHighlight: false })).toBe(11);
        expect(nodeRadius({ isHub: false, emphasis: true, onHighlight: false })).toBe(7.5);
        expect(nodeRadius({ isHub: false, emphasis: false, onHighlight: true })).toBe(7.5);
        expect(nodeRadius({ isHub: false, emphasis: false, onHighlight: false })).toBe(5.5);
    });

    test("the hub radius wins over the other roles", () => {
        expect(nodeRadius({ isHub: true, emphasis: true, onHighlight: true })).toBe(11);
    });
});

describe("placeLabels — pinned geometry", () => {
    const endpoint = (id, x, y, label = "AAAA") => ({ id, x, y, r: 5.5, isHub: false, label });

    test("the width of a label is its length times the font size times the glyph ratio", () => {
        // Four characters span 4 * 16 * 0.58 = 37.12 units, so two such labels on
        // the same line collide exactly when their centres are closer than that.
        const colliding = placeLabels([endpoint("a", 0, 100), endpoint("b", 37, 100)]);
        const clear = placeLabels([endpoint("a", 0, 100), endpoint("b", 37.3, 100)]);

        expect(colliding.byId.b.y).not.toBeCloseTo(colliding.byId.a.y, 6);
        expect(clear.byId.b.y).toBeCloseTo(clear.byId.a.y, 6);
    });

    test("an endpoint label box is 16 units above and 6 below its baseline", () => {
        // Same column, so the boxes collide when the baselines are closer than the
        // box height of 22. The default baselines are the node y minus 12.5.
        const colliding = placeLabels([endpoint("a", 0, 100), endpoint("b", 0, 121.5)]);
        const clear = placeLabels([endpoint("a", 0, 100), endpoint("b", 0, 122.5)]);

        expect(colliding.byId.b.y).not.toBeCloseTo(121.5 - 12.5, 6);
        expect(clear.byId.b.y).toBeCloseTo(122.5 - 12.5, 6);
    });

    test("a hub label box starts at its anchor and the ascent of the label below it matters", () => {
        // The hub label hangs 22 units below its anchor, an endpoint label rises 16
        // above its baseline. At the collision edge the endpoint baseline sits 38
        // units below the hub anchor, so its box starts exactly where the hub box ends.
        const hub = { id: "h", x: 0, y: 100, r: 5.5, isHub: true, label: "AAAA" };
        // Hub anchor: 100 + 5.5 + 14 = 119.5. Endpoint anchor: y - 12.5.
        const colliding = placeLabels([hub, endpoint("e", 0, 169)]);
        const clear = placeLabels([hub, endpoint("e", 0, 170)]);

        expect(colliding.byId.e.y).not.toBeCloseTo(169 - 12.5, 6);
        expect(clear.byId.e.y).toBeCloseTo(170 - 12.5, 6);
    });

    test("a label is at least as wide as its node", () => {
        // One character spans 9.28 units, narrower than the node diameter of 11, so
        // the node diameter sets the width and centres closer than 11 collide.
        const colliding = placeLabels([endpoint("a", 0, 100, "A"), endpoint("b", 10.5, 100, "A")]);
        const clear = placeLabels([endpoint("a", 0, 100, "A"), endpoint("b", 11.5, 100, "A")]);

        expect(colliding.byId.b.y).not.toBeCloseTo(colliding.byId.a.y, 6);
        expect(clear.byId.b.y).toBeCloseTo(clear.byId.a.y, 6);
    });

    test("a collided hub label is pushed down, its natural side, when both slots are free", () => {
        // The endpoint box spans 71.5 to 93.5. The hub anchor is 52 + 5.5 + 14 = 71.5,
        // so its box overlaps the endpoint box, and the slot a line height above and
        // the slot a line height below are both free. The hub takes the lower one.
        const hub = { id: "h", x: 0, y: 52, r: 5.5, isHub: true, label: "AAAA" };
        const placed = placeLabels([endpoint("e", 0, 100), hub]);

        expect(placed.byId.h.y).toBeCloseTo(71.5 + 22, 6);
    });

    test("a collided endpoint label is lifted by exactly one line height", () => {
        const placed = placeLabels([endpoint("a", 0, 100), endpoint("b", 0, 100)]);

        expect(placed.byId.a.y).toBeCloseTo(100 - 12.5, 6);
        expect(placed.byId.b.y).toBeCloseTo(100 - 12.5 - 22, 6);
    });

    test("a third label that is blocked on its natural side takes the free slot on the other", () => {
        const placed = placeLabels([
            endpoint("a", 0, 100),
            endpoint("b", 0, 100),
            endpoint("c", 0, 100),
        ]);

        expect(placed.byId.c.y).toBeCloseTo(100 - 12.5 + 22, 6);
    });
});

describe("computeLayout — pinned solver output", () => {
    const node = (id, extra = {}) => ({
        id,
        label: id.toUpperCase(),
        isHub: false,
        emphasis: false,
        onHighlight: false,
        showLabel: false,
        ...extra,
    });
    const model = {
        nodes: [
            node("a", { onHighlight: true, showLabel: true }),
            node("b"),
            node("c", { isHub: true, showLabel: true }),
            node("d"),
            node("e"),
        ],
        links: [
            { source: "a", target: "b", isHighlighted: true },
            { source: "b", target: "c", isHighlighted: true },
            { source: "c", target: "d", isHighlighted: false },
            { source: "b", target: "e", isHighlighted: false },
        ],
    };

    // The solver is seeded and runs a fixed number of rounds, so the coordinates
    // are an exact function of its constants. Pinning them notices a change of the
    // seed, the iteration count, the spring length, the repulsion, the padding and
    // the aspect fit. Three decimals are far finer than any tuning step.
    const expectPoints = (actual, expected) => {
        expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());

        for (const [id, point] of Object.entries(expected)) {
            expect(actual[id].x).toBeCloseTo(point.x, 3);
            expect(actual[id].y).toBeCloseTo(point.y, 3);
        }
    };
    const expectViewBox = (actual, expected) => {
        const parts = actual.split(" ").map(Number);

        expect(parts).toHaveLength(4);
        for (const [index, part] of parts.entries()) {
            expect(part).toBeCloseTo(expected[index], 3);
        }
    };

    test("a wide card lays the same graph out to these coordinates and viewBox", () => {
        const layout = computeLayout(model, 720, 360);

        expectPoints(layout.byId, {
            a: { x: 440.108, y: 238.842 },
            b: { x: 403.303, y: 181.126 },
            c: { x: 314.141, y: 177.011 },
            d: { x: 228.528, y: 179.684 },
            e: { x: 450.841, y: 127.686 },
        });
        expectViewBox(layout.viewBox, [194.528, 93.686, 290.313, 179.157]);
        expectPoints(layout.labelById, {
            a: { x: 440.108, y: 224.342 },
            c: { x: 314.141, y: 202.011 },
        });
    });

    test("the viewBox grows to take in the label boxes that reach past the nodes", () => {
        // An endpoint label rises above its node and a hub label hangs below its
        // node, and a long name is wider than the node spread. The frame has to follow
        // these label boxes and not the nodes alone.
        const longName = "A very long name that is certainly wider than the whole graph of nodes";
        const labelled = {
            nodes: [
                node("a", { onHighlight: true, showLabel: true, label: longName }),
                node("b", { isHub: true, showLabel: true, label: longName }),
            ],
            links: [{ source: "a", target: "b", isHighlighted: false }],
        };
        const layout = computeLayout(labelled, 720, 360);
        const halfWidth = (longName.length * 16 * 0.58) / 2;
        const endpoint = layout.labelById.a;
        const hub = layout.labelById.b;
        const nodes = Object.values(layout.byId);

        // Endpoint box: 16 above and 6 below its baseline. Hub box: 22 below its anchor.
        const left = Math.min(
            ...nodes.map((point) => point.x),
            endpoint.x - halfWidth,
            hub.x - halfWidth,
        );
        const right = Math.max(
            ...nodes.map((point) => point.x),
            endpoint.x + halfWidth,
            hub.x + halfWidth,
        );
        const top = Math.min(...nodes.map((point) => point.y), endpoint.y - 16, hub.y);
        const bottom = Math.max(...nodes.map((point) => point.y), endpoint.y + 6, hub.y + 22);
        const [x, y, width, height] = layout.viewBox.split(" ").map(Number);

        expect(x).toBeCloseTo(left - 34, 3);
        expect(y).toBeCloseTo(top - 34, 3);
        expect(width).toBeCloseTo(right - left + 68, 3);
        expect(height).toBeCloseTo(bottom - top + 68, 3);

        // The label boxes reach past the nodes on every side, otherwise the test
        // would not tell a label box from the node extent.
        expect(left).toBeLessThan(Math.min(...nodes.map((point) => point.x)));
        expect(right).toBeGreaterThan(Math.max(...nodes.map((point) => point.x)));
        expect(top).toBeLessThan(Math.min(...nodes.map((point) => point.y)));
        expect(bottom).toBeGreaterThan(Math.max(...nodes.map((point) => point.y)));
    });

    test("only the nodes flagged for a label get one", () => {
        // A node in the middle of the highlight path is highlighted but carries no
        // visible name, and a flagged node needs neither the hub nor the highlight role.
        const mixed = {
            nodes: [
                node("a", { onHighlight: true, showLabel: true }),
                node("m", { onHighlight: true, showLabel: false }),
                node("c", { isHub: true, showLabel: true }),
                node("x", { showLabel: true }),
                node("y", { isHub: true, showLabel: false }),
            ],
            links: [
                { source: "a", target: "m", isHighlighted: true },
                { source: "m", target: "c", isHighlighted: true },
                { source: "c", target: "x", isHighlighted: false },
                { source: "x", target: "y", isHighlighted: false },
            ],
        };
        const layout = computeLayout(mixed, 720, 360);

        expect(Object.keys(layout.labelById).sort()).toEqual(["a", "c", "x"]);
    });

    test("a square card lays the same graph out differently", () => {
        const layout = computeLayout(model, 360, 360);

        expectPoints(layout.byId, {
            a: { x: 231.89, y: 263.187 },
            b: { x: 205.427, y: 180.19 },
            c: { x: 141.319, y: 174.272 },
            d: { x: 79.762, y: 178.117 },
            e: { x: 239.608, y: 103.341 },
        });
        expectViewBox(layout.viewBox, [45.762, 69.341, 227.846, 227.846]);
    });
});
