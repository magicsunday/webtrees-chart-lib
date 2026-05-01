import { describe, expect, test } from "@jest/globals";
import { marriagePath } from "src/chart/links/marriage-path.js";

describe("marriagePath — vertical layout", () => {
    test("emits a single straight horizontal segment between two adjacent boxes", () => {
        const d = marriagePath({
            sequence: [
                { x: 0, y: 100 },
                { x: 200, y: 100 },
            ],
            isVertical: true,
            halfBox: 80,
            trim: 2,
            crossAxisCoord: 100,
        });
        // gap = (-200/2 + 80 + 2)? actually: leftEnd = 0 + 80 + 2 = 82; rightEnd = 200 - 80 - 2 = 118
        expect(d).toBe("M82,100L118,100");
    });

    test("sorts sequence along the spread axis before chaining", () => {
        const d = marriagePath({
            sequence: [
                { x: 200, y: 100 },
                { x: 0, y: 100 },
            ],
            isVertical: true,
            halfBox: 80,
            trim: 2,
            crossAxisCoord: 100,
        });
        expect(d).toBe("M82,100L118,100");
    });

    test("emits one segment per inter-box gap when intermediates sit between father and mother", () => {
        const d = marriagePath({
            sequence: [
                { x: 0, y: 100 }, // father
                { x: 200, y: 100 }, // intermediate
                { x: 400, y: 100 }, // mother
            ],
            isVertical: true,
            halfBox: 80,
            trim: 2,
            crossAxisCoord: 105,
        });
        expect(d).toBe("M82,105L118,105M282,105L318,105");
    });

    test("skips a segment when the gap is smaller than 2× trim", () => {
        const d = marriagePath({
            sequence: [
                { x: 0, y: 100 },
                { x: 161, y: 100 },
            ],
            isVertical: true,
            halfBox: 80,
            trim: 2,
            crossAxisCoord: 100,
        });
        // leftEnd = 82, rightEnd = 79 → segmentEnd <= segmentStart, skip
        expect(d).toBe("");
    });

    test("uses the cross-axis coord as Y so stagger shows up", () => {
        const d = marriagePath({
            sequence: [
                { x: 0, y: 100 },
                { x: 200, y: 100 },
            ],
            isVertical: true,
            halfBox: 80,
            trim: 2,
            crossAxisCoord: 95, // staggered up by 5 px
        });
        expect(d).toBe("M82,95L118,95");
    });
});

describe("marriagePath — horizontal layout", () => {
    test("emits a vertical segment with cross-axis coord as X", () => {
        const d = marriagePath({
            sequence: [
                { x: 100, y: 0 },
                { x: 100, y: 200 },
            ],
            isVertical: false,
            halfBox: 40,
            trim: 2,
            crossAxisCoord: 100,
        });
        // leftEnd = 0 + 40 + 2 = 42; rightEnd = 200 - 40 - 2 = 158
        expect(d).toBe("M100,42L100,158");
    });

    test("intermediate boxes produce one vertical segment per gap", () => {
        const d = marriagePath({
            sequence: [
                { x: 100, y: 0 },
                { x: 100, y: 200 },
                { x: 100, y: 400 },
            ],
            isVertical: false,
            halfBox: 40,
            trim: 2,
            crossAxisCoord: 105,
        });
        expect(d).toBe("M105,42L105,158M105,242L105,358");
    });
});

describe("marriagePath — edge cases", () => {
    test("returns empty string for a single-box sequence", () => {
        expect(
            marriagePath({
                sequence: [{ x: 0, y: 0 }],
                isVertical: true,
                halfBox: 80,
                trim: 2,
                crossAxisCoord: 0,
            }),
        ).toBe("");
    });

    test("returns empty string for an empty sequence", () => {
        expect(
            marriagePath({
                sequence: [],
                isVertical: true,
                halfBox: 80,
                trim: 2,
                crossAxisCoord: 0,
            }),
        ).toBe("");
    });
});
