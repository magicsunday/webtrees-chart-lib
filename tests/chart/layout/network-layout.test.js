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

    test("caps an extreme stretch of the short vertical axis too", () => {
        // spanX 400, spanY 10 → contentAspect 40; reaching target 1 would need a
        // 40x stretch, the cap holds it to 3 around the vertical centre (5).
        const pts = [
            { x: 0, y: 0, vx: 0, vy: 0 },
            { x: 400, y: 10, vx: 0, vy: 0 },
            { x: 200, y: 5, vx: 0, vy: 0 },
        ];
        fitToAspect(pts, 1);

        expect(pts.map((p) => p.y)).toEqual([-10, 20, 5]);
        expect(pts.map((p) => p.x)).toEqual([0, 400, 200]);
    });

    test.each([0, -1])("leaves the cloud untouched for the target aspect %p", (target) => {
        const pts = [
            { x: 0, y: 0, vx: 0, vy: 0 },
            { x: 400, y: 10, vx: 0, vy: 0 },
        ];
        fitToAspect(pts, target);

        expect(pts.map((p) => [p.x, p.y])).toEqual([
            [0, 0],
            [400, 10],
        ]);
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

    test("the relocation scan widens by a line height per step", () => {
        // Five labels on one spot take the default, then one slot above, one below,
        // two above and two below.
        const placed = placeLabels(["a", "b", "c", "d", "e"].map((id) => endpoint(id, 0, 100)));
        const offsets = ["a", "b", "c", "d", "e"].map((id) => placed.byId[id].y - (100 - 12.5));

        expect(offsets).toEqual([0, -22, 22, -44, 44]);
    });

    test("the relocation scan gives up after the last step and keeps the default", () => {
        // The default slot and the slots a line height apart, up to the step limit on
        // each side, hold one label each. The label after the last free slot has no
        // clear slot left and stays on its default.
        const ids = Array.from({ length: 82 }, (_, index) => `n${index}`);
        const placed = placeLabels(ids.map((id) => endpoint(id, 0, 2000)));
        const defaultY = 2000 - 12.5;

        expect(placed.byId.n80.y).toBeCloseTo(defaultY + 40 * 22, 6);
        expect(placed.byId.n81.y).toBeCloseTo(defaultY, 6);
    });

    test("label boxes that only touch on a vertical side do not collide", () => {
        // A one-character label is as wide as its node, 11 units, so nodes 11 apart
        // give boxes that share the edge. Touching is not overlapping, in either order.
        const rightTouch = placeLabels([endpoint("a", 0, 100, "A"), endpoint("b", 11, 100, "A")]);
        const leftTouch = placeLabels([endpoint("a", 11, 100, "A"), endpoint("b", 0, 100, "A")]);

        expect(rightTouch.byId.b.y).toBeCloseTo(rightTouch.byId.a.y, 6);
        expect(leftTouch.byId.b.y).toBeCloseTo(leftTouch.byId.a.y, 6);
    });
});

describe("computeLayout layout invariants", () => {
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

    const radiusOf = (id) => nodeRadius(model.nodes.find((entry) => entry.id === id));
    const parseViewBox = (viewBox) => {
        const [x, y, width, height] = viewBox.split(" ").map(Number);

        return { x, y, width, height };
    };

    // Wide, square and tall cards.
    describe.each([
        [720, 360],
        [360, 360],
        [360, 720],
    ])("on a card of %i by %i", (width, height) => {
        test("the same graph always lays out to the same result", () => {
            expect(computeLayout(model, width, height)).toEqual(
                computeLayout(model, width, height),
            );
        });

        test("every node gets a finite position and no two nodes touch", () => {
            const { byId } = computeLayout(model, width, height);
            const ids = Object.keys(byId);

            expect(ids.sort()).toEqual(model.nodes.map((entry) => entry.id).sort());

            for (const [index, id] of ids.entries()) {
                expect(Number.isFinite(byId[id].x)).toBe(true);
                expect(Number.isFinite(byId[id].y)).toBe(true);

                for (const other of ids.slice(index + 1)) {
                    expect(
                        Math.hypot(byId[id].x - byId[other].x, byId[id].y - byId[other].y),
                    ).toBeGreaterThan(radiusOf(id) + radiusOf(other));
                }
            }
        });

        test("the viewBox holds every node with its radius and every label anchor", () => {
            const layout = computeLayout(model, width, height);
            const box = parseViewBox(layout.viewBox);

            for (const [id, point] of Object.entries(layout.byId)) {
                expect(point.x - radiusOf(id)).toBeGreaterThanOrEqual(box.x);
                expect(point.x + radiusOf(id)).toBeLessThanOrEqual(box.x + box.width);
                expect(point.y - radiusOf(id)).toBeGreaterThanOrEqual(box.y);
                expect(point.y + radiusOf(id)).toBeLessThanOrEqual(box.y + box.height);
            }

            for (const point of Object.values(layout.labelById)) {
                expect(point.x).toBeGreaterThan(box.x);
                expect(point.x).toBeLessThan(box.x + box.width);
                expect(point.y).toBeGreaterThan(box.y);
                expect(point.y).toBeLessThan(box.y + box.height);
            }
        });

        test("the nodes spread over the aspect ratio of the card", () => {
            const points = Object.values(computeLayout(model, width, height).byId);
            const span = (key) =>
                Math.max(...points.map((point) => point[key])) -
                Math.min(...points.map((point) => point[key]));

            expect(span("x") / span("y")).toBeCloseTo(width / height, 2);
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
});
