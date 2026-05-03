import { describe, expect, test } from "@jest/globals";
import {
    BRANCH_HUE_SPREAD,
    depthBounds,
    depthHsl,
    familyBranchHsl,
    familyCenterHsl,
    hexToHsl,
    LIGHTNESS_STEP,
    MAX_GENERATIONS_REF,
    SATURATION_STEP,
} from "src/color/family-color.js";

const parseHsl = (s) => {
    const m = s.match(/hsl\((\d+(?:\.\d+)?), ([\d.]+)%, ([\d.]+)%\)/);
    return m ? { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) } : null;
};

describe("hexToHsl", () => {
    test("converts a known blue hex to its HSL equivalent", () => {
        const [h, s, l] = hexToHsl("#3b82b0");

        // Verified against an external HSL converter
        expect(h).toBeGreaterThanOrEqual(200);
        expect(h).toBeLessThanOrEqual(210);
        expect(s).toBeGreaterThanOrEqual(45);
        expect(s).toBeLessThanOrEqual(55);
        expect(l).toBeGreaterThanOrEqual(40);
        expect(l).toBeLessThanOrEqual(50);
    });

    test("accepts hex without leading hash", () => {
        const [h1] = hexToHsl("#3b82b0");
        const [h2] = hexToHsl("3b82b0");

        expect(h1).toBe(h2);
    });

    test("returns neutral mid-gray for invalid input", () => {
        expect(hexToHsl("not-a-color")).toEqual([0, 0, 50]);
        expect(hexToHsl("#xyz")).toEqual([0, 0, 50]);
        expect(hexToHsl("#12")).toEqual([0, 0, 50]);
    });

    test("pure red, green, blue map to expected hues", () => {
        expect(hexToHsl("#ff0000")[0]).toBe(0);
        expect(hexToHsl("#00ff00")[0]).toBe(120);
        expect(hexToHsl("#0000ff")[0]).toBe(240);
    });
});

describe("depthBounds", () => {
    test("clamps minSaturation at 20 even for low-saturation base colors", () => {
        const { minSaturation } = depthBounds([200, 10, 50]);
        expect(minSaturation).toBe(20);
    });

    test("clamps maxLightness at 90 even for very-light base colors", () => {
        const { maxLightness } = depthBounds([200, 50, 100]);
        expect(maxLightness).toBe(90);
    });

    test("scales bounds across MAX_GENERATIONS_REF generations", () => {
        const { minSaturation, maxLightness } = depthBounds([200, 60, 50]);

        // span = 9; minSaturation = 60 - 9*3.5 = 28.5; maxLightness = 50 + 9*3 = 77
        expect(minSaturation).toBeCloseTo(60 - (MAX_GENERATIONS_REF - 1) * SATURATION_STEP, 5);
        expect(maxLightness).toBeCloseTo(50 + (MAX_GENERATIONS_REF - 1) * LIGHTNESS_STEP, 5);
    });
});

describe("depthHsl", () => {
    test("renders a valid CSS HSL string", () => {
        expect(depthHsl(210, [210, 50, 50], 1)).toMatch(
            /^hsl\(\d+(\.\d+)?, \d+(\.\d+)?%, \d+(\.\d+)?%\)$/,
        );
    });

    test("wraps negative hue back into 0..360", () => {
        const result = depthHsl(-30, [210, 50, 50], 1);
        expect(result).toMatch(/^hsl\(330, /);
    });

    test("wraps hues above 360 back into 0..360", () => {
        const result = depthHsl(390, [210, 50, 50], 1);
        expect(result).toMatch(/^hsl\(30, /);
    });

    test("becomes more saturated and darker with increasing depth", () => {
        const baseHsl = [210, 60, 50];
        const shallow = parseHsl(depthHsl(210, baseHsl, 1));
        const deep = parseHsl(depthHsl(210, baseHsl, 5));

        expect(shallow).not.toBeNull();
        expect(deep).not.toBeNull();
        expect(deep.s).toBeGreaterThan(shallow.s);
        expect(deep.l).toBeLessThan(shallow.l);
    });

    test("reaches base saturation + lightness at depth = maxGenerations", () => {
        const baseHsl = [210, 60, 50];
        const outer = parseHsl(depthHsl(210, baseHsl, 10, 10));

        expect(outer.s).toBeCloseTo(baseHsl[1], 5);
        expect(outer.l).toBeCloseTo(baseHsl[2], 5);
    });

    test("scales interpolation per module maxGenerations", () => {
        const baseHsl = [210, 60, 50];

        // Endpoints align between fan (10 gens) and ped (25 gens): both
        // start at the same pastel bound at depth 1 and reach the picker
        // color at their own maxGenerations.
        const fanInner = parseHsl(depthHsl(210, baseHsl, 1, 10));
        const pedInner = parseHsl(depthHsl(210, baseHsl, 1, 25));
        const fanOuter = parseHsl(depthHsl(210, baseHsl, 10, 10));
        const pedOuter = parseHsl(depthHsl(210, baseHsl, 25, 25));

        expect(pedInner.s).toBeCloseTo(fanInner.s, 5);
        expect(pedOuter.s).toBeCloseTo(fanOuter.s, 5);
    });
});

describe("familyCenterHsl", () => {
    test("is lighter and less saturated than the depth-1 bound", () => {
        const baseHsl = [210, 60, 50];
        const center = parseHsl(familyCenterHsl(baseHsl));
        const depth1 = parseHsl(depthHsl(baseHsl[0], baseHsl, 1));

        expect(center.l).toBeGreaterThan(depth1.l);
        expect(center.s).toBeLessThan(depth1.s);
        expect(center.h).toBe(baseHsl[0]);
    });
});

describe("familyBranchHsl", () => {
    test("spreads hue by ±BRANCH_HUE_SPREAD/2 at half=0 and half=1", () => {
        const baseHsl = [210, 60, 50];
        const left = parseHsl(familyBranchHsl(baseHsl, 5, 0));
        const right = parseHsl(familyBranchHsl(baseHsl, 5, 1));

        expect(left.h).toBeCloseTo(baseHsl[0] - BRANCH_HUE_SPREAD / 2, 5);
        expect(right.h).toBeCloseTo(baseHsl[0] + BRANCH_HUE_SPREAD / 2, 5);
    });

    test("half=0.5 keeps base hue", () => {
        const baseHsl = [210, 60, 50];
        const mid = parseHsl(familyBranchHsl(baseHsl, 5, 0.5));

        expect(mid.h).toBeCloseTo(baseHsl[0], 5);
    });
});
