import { describe, expect, test } from "@jest/globals";
import { elbowsPath } from "src/chart/links/elbow-path.js";

describe("elbowsPath — vertical, single child", () => {
    test("source-drop and per-child drop only; spine collapses to zero", () => {
        const d = elbowsPath({
            source: { x: 100, y: 50 },
            children: [{ x: 100, y: 250 }],
            isVertical: true,
            halfBoxCross: 40, // halfBoxHeight
            halfOffsetCross: 20, // halfYOffset
            direction: 1,
        });
        // elbowY  = 250 - 40*1 - 20*1 = 190
        // targetY = 250 - 40*1       = 210
        // Spine min = max = 100 → skipped
        expect(d).toBe("M100,50L100,190M100,190L100,210");
    });
});

describe("elbowsPath — vertical, multiple children", () => {
    test("emits source-drop, spine across the row, one drop per child", () => {
        const d = elbowsPath({
            source: { x: 100, y: 50 },
            children: [
                { x: 60, y: 250 },
                { x: 140, y: 250 },
            ],
            isVertical: true,
            halfBoxCross: 40,
            halfOffsetCross: 20,
            direction: 1,
        });
        expect(d).toBe(
            "M100,50L100,190" + // source drop
                "M60,190L140,190" + // spine
                "M60,190L60,210" + // child 1 drop
                "M140,190L140,210", // child 2 drop
        );
    });

    test("spine extends to include the source X when source sits outside the children's X-range", () => {
        const d = elbowsPath({
            source: { x: 200, y: 50 },
            children: [
                { x: 60, y: 250 },
                { x: 140, y: 250 },
            ],
            isVertical: true,
            halfBoxCross: 40,
            halfOffsetCross: 20,
            direction: 1,
        });
        expect(d).toBe(
            "M200,50L200,190" + "M60,190L200,190" + "M60,190L60,210" + "M140,190L140,210",
        );
    });
});

describe("elbowsPath — vertical, direction = -1 (bottom-top)", () => {
    test("flips the cross-axis offsets", () => {
        const d = elbowsPath({
            source: { x: 100, y: -50 },
            children: [{ x: 100, y: -250 }],
            isVertical: true,
            halfBoxCross: 40,
            halfOffsetCross: 20,
            direction: -1,
        });
        // elbowY  = -250 - 40*-1 - 20*-1 = -250 + 60 = -190
        // targetY = -250 - 40*-1         = -210
        expect(d).toBe("M100,-50L100,-190M100,-190L100,-210");
    });
});

describe("elbowsPath — horizontal, single child", () => {
    test("source-runout and per-child runout; spine collapses", () => {
        const d = elbowsPath({
            source: { x: 50, y: 100 },
            children: [{ x: 250, y: 100 }],
            isVertical: false,
            halfBoxCross: 80, // halfBoxWidth
            halfOffsetCross: 15, // halfXOffset
            direction: 1,
        });
        // elbowX  = 250 - 80 - 15 = 155
        // targetX = 250 - 80      = 170
        expect(d).toBe("M50,100L155,100M155,100L170,100");
    });
});

describe("elbowsPath — horizontal, multiple children", () => {
    test("emits source-runout, vertical spine, one runout per child", () => {
        const d = elbowsPath({
            source: { x: 50, y: 100 },
            children: [
                { x: 250, y: 60 },
                { x: 250, y: 140 },
            ],
            isVertical: false,
            halfBoxCross: 80,
            halfOffsetCross: 15,
            direction: 1,
        });
        expect(d).toBe(
            "M50,100L155,100" + // source runout
                "M155,60L155,140" + // spine
                "M155,60L170,60" + // child 1 runout
                "M155,140L170,140", // child 2 runout
        );
    });
});

describe("elbowsPath — edge cases", () => {
    test("returns empty string when children is empty", () => {
        expect(
            elbowsPath({
                source: { x: 0, y: 0 },
                children: [],
                isVertical: true,
                halfBoxCross: 40,
                halfOffsetCross: 20,
                direction: 1,
            }),
        ).toBe("");
    });

    test("returns empty string when children is missing", () => {
        expect(
            elbowsPath({
                source: { x: 0, y: 0 },
                isVertical: true,
                halfBoxCross: 40,
                halfOffsetCross: 20,
                direction: 1,
            }),
        ).toBe("");
    });
});
