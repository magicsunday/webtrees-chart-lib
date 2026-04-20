/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Saturation decrease per generation (percentage points).
 *
 * @type {number}
 */
export const SATURATION_STEP = 3.5;

/**
 * Lightness increase per generation (percentage points).
 *
 * @type {number}
 */
export const LIGHTNESS_STEP = 3;

/**
 * Fixed generation reference so colors at a given depth stay identical
 * regardless of how many generations are displayed.
 *
 * @type {number}
 */
export const MAX_GENERATIONS_REF = 10;

/**
 * Converts a 6-digit hex color string to an [hue, saturation, lightness]
 * tuple. Hue is in 0..360, saturation and lightness in 0..100. Invalid
 * input falls back to neutral mid-gray [0, 0, 50].
 *
 * @param {string} hex Hex color (e.g. "#3b82b0", with or without leading #)
 *
 * @returns {[number, number, number]}
 */
export function hexToHsl(hex) {
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
        return [0, 0, 50];
    }

    const normalizedHex = hex.replace(/^#/, "");

    const red = parseInt(normalizedHex.substring(0, 2), 16) / 255;
    const green = parseInt(normalizedHex.substring(2, 4), 16) / 255;
    const blue = parseInt(normalizedHex.substring(4, 6), 16) / 255;

    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;

    let hue = 0;
    let saturation = 0;
    const lightness = (max + min) / 2;

    if (delta !== 0) {
        saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

        if (max === red) {
            hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
        } else if (max === green) {
            hue = ((blue - red) / delta + 2) * 60;
        } else {
            hue = ((red - green) / delta + 4) * 60;
        }
    }

    return [Math.round(hue), Math.round(saturation * 100), Math.round(lightness * 100)];
}

/**
 * Computes the saturation floor and lightness ceiling for a given base color
 * across MAX_GENERATIONS_REF generations. Used by depthHsl() to keep the full
 * generation range within a visually pleasing band (more vivid at outer
 * generations, more pastel at inner ones).
 *
 * @param {[number, number, number]} baseHsl [hue, saturation, lightness] base color
 *
 * @returns {{ minSaturation: number, maxLightness: number }}
 */
export function depthBounds(baseHsl) {
    const span = MAX_GENERATIONS_REF - 1;

    return {
        minSaturation: Math.max(20, baseHsl[1] - span * SATURATION_STEP),
        maxLightness: Math.min(90, baseHsl[2] + span * LIGHTNESS_STEP),
    };
}

/**
 * Builds an HSL color string for a given hue, base reference color, and depth.
 * Saturation increases and lightness decreases with depth, so outer generations
 * appear more vivid while inner ones stay pastel. Hue is wrapped into 0..360.
 *
 * @param {number}                   hue     Unnormalized hue (any range, will be wrapped)
 * @param {[number, number, number]} baseHsl [hue, saturation, lightness] reference for bounds
 * @param {number}                   depth   Absolute depth (1 = innermost)
 *
 * @returns {string} CSS HSL color string, e.g. "hsl(210, 50%, 60%)"
 */
export function depthHsl(hue, baseHsl, depth) {
    const { minSaturation, maxLightness } = depthBounds(baseHsl);
    const saturation = minSaturation + (depth - 1) * SATURATION_STEP;
    const lightness = maxLightness - (depth - 1) * LIGHTNESS_STEP;

    return `hsl(${((hue % 360) + 360) % 360}, ${saturation}%, ${lightness}%)`;
}
