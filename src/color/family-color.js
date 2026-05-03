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
 * Interpolates between the most-pastel bound at depth 1 and the picker color
 * at depth `maxGenerations`, so outer generations read as the picker value
 * exactly (modulo hue spread) regardless of how many generations a module
 * displays. Hue is wrapped into 0..360.
 *
 * @param {number}                   hue            Unnormalized hue (any range, will be wrapped)
 * @param {[number, number, number]} baseHsl        [hue, saturation, lightness] picker color
 * @param {number}                   depth          Absolute depth (1 = innermost)
 * @param {number}                   maxGenerations Module's maximum generation count (= picker depth)
 *
 * @returns {string} CSS HSL color string, e.g. "hsl(210, 50%, 60%)"
 */
export function depthHsl(hue, baseHsl, depth, maxGenerations = MAX_GENERATIONS_REF) {
    const { minSaturation, maxLightness } = depthBounds(baseHsl);
    const span = Math.max(1, maxGenerations - 1);
    const ratio = Math.min(1, Math.max(0, (depth - 1) / span));
    const saturation = minSaturation + ratio * (baseHsl[1] - minSaturation);
    const lightness = maxLightness - ratio * (maxLightness - baseHsl[2]);

    return `hsl(${((hue % 360) + 360) % 360}, ${saturation}%, ${lightness}%)`;
}

/**
 * Hue spread (degrees) applied to a branch around its base hue. Branches
 * at the edge of the paternal/maternal half shift by ±BRANCH_HUE_SPREAD/2.
 *
 * @type {number}
 */
export const BRANCH_HUE_SPREAD = 60;

/**
 * Returns the root individual's "center" tint — one step beyond the most
 * pastel depth-1 value, so the root reads as the family root rather than
 * a peer of generation 1.
 *
 * @param {[number, number, number]} baseHsl Picker base color (paternal or maternal)
 *
 * @returns {string} CSS HSL color string
 */
export function familyCenterHsl(baseHsl) {
    const { minSaturation, maxLightness } = depthBounds(baseHsl);
    const sat = Math.max(10, minSaturation - SATURATION_STEP);
    const lit = Math.min(93, maxLightness + LIGHTNESS_STEP);

    return `hsl(${baseHsl[0]}, ${sat}%, ${lit}%)`;
}

/**
 * Returns the per-branch lineage color for a node at given depth on a
 * given side. `half ∈ [0, 1]` is the reference node's normalised position
 * within its paternal/maternal side (0 = outer edge of paternal-most or
 * maternal-most branch; 1 = inner edge nearest the opposite side).
 *
 * Each chart module derives `half` from its own geometry — radial charts
 * from angular midpoints, linear pedigrees from the lineage path — and
 * passes its own `maxGenerations` so the picker color lands at the chart's
 * outermost depth regardless of whether that depth is 10 (fan) or 25 (ped).
 *
 * @param {[number, number, number]} baseHsl        Side base color (paternal or maternal)
 * @param {number}                   depth          Absolute depth (1 = direct parent of root)
 * @param {number}                   half           Reference position in [0, 1]
 * @param {number}                   maxGenerations Module's maximum generation count
 *
 * @returns {string} CSS HSL color string
 */
export function familyBranchHsl(baseHsl, depth, half, maxGenerations = MAX_GENERATIONS_REF) {
    const hue = baseHsl[0] + (half - 0.5) * BRANCH_HUE_SPREAD;

    return depthHsl(hue, baseHsl, depth, maxGenerations);
}
