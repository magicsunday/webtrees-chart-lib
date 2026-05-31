import { describe, expect, test } from "@jest/globals";

import { roundedBarPath } from "src/chart/bars/rounded-bar-path.js";

// The builder emits a bar whose INNER edge (at `base`) stays square and whose
// OUTER edge is rounded. d3-path renders the rounded corners as `A` arc
// commands, so the tests assert the square start/end points exactly and probe
// the arc radius via the `A<r>,<r>` token rather than re-deriving full arc
// geometry by hand.

describe("roundedBarPath — horizontal growth", () => {
    test("right bar starts square at the gutter and rounds the right corners", () => {
        const d = roundedBarPath({
            direction: "right",
            base: 10,
            length: 30,
            cross: 20,
            thickness: 14,
        });
        // Square inner edge at the gutter (base = 10).
        expect(d.startsWith("M10,20")).toBe(true);
        // Top edge runs out to `outer - radius` = (10 + 30) - 7 = 33.
        expect(d).toContain("L33,20");
        // Both outer corners rounded at the default radius 7.
        expect(d).toContain("A7,7,");
        // Inner-bottom corner returns to the square gutter edge.
        expect(d).toContain("L10,34");
        expect(d.endsWith("Z")).toBe(true);
    });

    test("left bar grows the opposite way and rounds the left corners", () => {
        const d = roundedBarPath({
            direction: "left",
            base: 100,
            length: 30,
            cross: 20,
            thickness: 14,
        });
        expect(d.startsWith("M100,20")).toBe(true);
        // Top edge runs out to `outer + radius` = (100 - 30) + 7 = 77.
        expect(d).toContain("L77,20");
        expect(d).toContain("A7,7,");
        expect(d.endsWith("Z")).toBe(true);
    });
});

describe("roundedBarPath — vertical growth", () => {
    test("up bar starts square at the axis and rounds the top corners", () => {
        const d = roundedBarPath({
            direction: "up",
            base: 200,
            length: 30,
            cross: 40,
            thickness: 14,
        });
        // Square inner edge at the axis (base = 200), bar left at cross = 40.
        expect(d.startsWith("M40,200")).toBe(true);
        // Left edge runs up to `outer + radius` = (200 - 30) + 7 = 177.
        expect(d).toContain("L40,177");
        expect(d).toContain("A7,7,");
        expect(d.endsWith("Z")).toBe(true);
    });

    test("down bar grows the opposite way and rounds the bottom corners", () => {
        const d = roundedBarPath({
            direction: "down",
            base: 200,
            length: 30,
            cross: 40,
            thickness: 14,
        });
        expect(d.startsWith("M40,200")).toBe(true);
        // Left edge runs down to `outer - radius` = (200 + 30) - 7 = 223.
        expect(d).toContain("L40,223");
        expect(d).toContain("A7,7,");
        expect(d.endsWith("Z")).toBe(true);
    });
});

describe("roundedBarPath — placeholders and clamps", () => {
    test("zero length renders a 1px square stub pinned at the gutter (right)", () => {
        const d = roundedBarPath({
            direction: "right",
            base: 10,
            length: 0,
            cross: 20,
            thickness: 14,
        });
        // No arc — a flat 1px rectangle so an empty band still reads.
        expect(d).toBe("M10,20L11,20L11,34L10,34Z");
    });

    test("zero length on the left pins the stub one pixel inside the gutter", () => {
        const d = roundedBarPath({
            direction: "left",
            base: 10,
            length: 0,
            cross: 20,
            thickness: 14,
        });
        expect(d).toBe("M9,20L10,20L10,34L9,34Z");
    });

    test("zero length up pins a 1px stub above the axis", () => {
        const d = roundedBarPath({
            direction: "up",
            base: 200,
            length: 0,
            cross: 40,
            thickness: 14,
        });
        expect(d).toBe("M40,199L54,199L54,200L40,200Z");
    });

    test("zero length down pins a 1px stub below the axis", () => {
        const d = roundedBarPath({
            direction: "down",
            base: 200,
            length: 0,
            cross: 40,
            thickness: 14,
        });
        expect(d).toBe("M40,200L54,200L54,201L40,201Z");
    });

    test("a positive length below minLength is floored so a tiny bar stays visible", () => {
        const d = roundedBarPath({
            direction: "right",
            base: 10,
            length: 1,
            cross: 20,
            thickness: 14,
        });
        // effective = max(1, 2) = 2; a non-floored length 1 would clamp the
        // radius to 1 → the "A2,2" arc proves the floor lifted it to 2.
        expect(d).toContain("A2,2,");
        expect(d).not.toContain("A1,1,");
    });

    test("a length exactly at minLength is a floor no-op", () => {
        const atFloor = roundedBarPath({
            direction: "right",
            base: 10,
            length: 2,
            cross: 20,
            thickness: 14,
        });
        const belowFloor = roundedBarPath({
            direction: "right",
            base: 10,
            length: 1,
            cross: 20,
            thickness: 14,
        });
        // length 2 is the floor boundary, so it renders identically to a floored
        // length-1 bar — the floor is a no-op at exactly minLength.
        expect(atFloor).toBe(belowFloor);
    });

    test("the corner radius clamps to the bar length, independent of the floor", () => {
        const d = roundedBarPath({
            direction: "right",
            base: 10,
            length: 5,
            cross: 20,
            thickness: 40,
        });
        // radius = min(7, effective=5, thickness/2=20) = 5 — the length is the
        // sole binding clamp here (well above minLength, well below thickness/2).
        expect(d).toContain("A5,5,");
    });

    test("a non-finite length falls back to the placeholder stub instead of a NaN path", () => {
        const d = roundedBarPath({
            direction: "right",
            base: 10,
            length: Number.NaN,
            cross: 20,
            thickness: 14,
        });
        expect(d).toBe("M10,20L11,20L11,34L10,34Z");
        expect(d).not.toContain("NaN");
    });

    test("the corner radius clamps to half the bar thickness on a thin bar", () => {
        const d = roundedBarPath({
            direction: "right",
            base: 10,
            length: 30,
            cross: 20,
            thickness: 8,
        });
        // radius = min(7, 30, 8/2) = 4.
        expect(d).toContain("A4,4,");
    });

    test("a custom radius overrides the default", () => {
        const d = roundedBarPath({
            direction: "right",
            base: 10,
            length: 30,
            cross: 20,
            thickness: 40,
            radius: 12,
        });
        expect(d).toContain("A12,12,");
    });
});
