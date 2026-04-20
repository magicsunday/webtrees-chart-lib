import { describe, expect, test } from "@jest/globals";
import {
    depthBounds,
    depthHsl,
    hexToHsl,
    LIGHTNESS_STEP,
    MAX_GENERATIONS_REF,
    SATURATION_STEP,
} from "src/color/familyColor.js";

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
        expect(depthHsl(210, [210, 50, 50], 1)).toMatch(/^hsl\(\d+(\.\d+)?, \d+(\.\d+)?%, \d+(\.\d+)?%\)$/);
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
        const shallow = depthHsl(210, baseHsl, 1);
        const deep = depthHsl(210, baseHsl, 5);

        // Extract saturation + lightness percent values
        const matchShallow = shallow.match(/hsl\(\d+(?:\.\d+)?, ([\d.]+)%, ([\d.]+)%\)/);
        const matchDeep = deep.match(/hsl\(\d+(?:\.\d+)?, ([\d.]+)%, ([\d.]+)%\)/);

        expect(matchShallow).not.toBeNull();
        expect(matchDeep).not.toBeNull();

        const satShallow = parseFloat(matchShallow[1]);
        const litShallow = parseFloat(matchShallow[2]);
        const satDeep = parseFloat(matchDeep[1]);
        const litDeep = parseFloat(matchDeep[2]);

        expect(satDeep).toBeGreaterThan(satShallow);
        expect(litDeep).toBeLessThan(litShallow);
    });
});
