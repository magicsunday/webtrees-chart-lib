import { describe, expect, test } from "@jest/globals";

import { fitToAspect, placeLabels } from "src/chart/layout/network-layout.js";

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
