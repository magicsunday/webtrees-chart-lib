/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Build an SVG `d` attribute for a marriage line drawn as a chain of
 * straight segments through the inter-box gaps between the boxes in
 * `sequence`. Adjacent box pairs collapse to a single segment in their
 * shared gap; if intermediate boxes sit between father and mother
 * (polygamous continuation marriages), each gap emits its own segment
 * so the line never crosses an unrelated person's box.
 *
 * Axis-agnostic: when `isVertical` is true, segments run along X at the
 * given Y; when false, they run along Y at the given X.
 *
 * @param {object}                  options
 * @param {Array<{x:number,y:number}>} options.sequence       Boxes ordered along the spread axis (father, …intermediates, mother)
 * @param {boolean}                 options.isVertical      True for top-bottom / bottom-top layouts
 * @param {number}                  options.halfBox         Half the box dimension along the spread axis
 * @param {number}                  options.trim            Pixels to trim from each segment end so it stops short of the box edge
 * @param {number}                  options.crossAxisCoord  Cross-axis coordinate at which the segments are drawn
 *
 * @returns {string} SVG path `d` attribute (empty string when no segment fits)
 */
export function marriagePath({ sequence, isVertical, halfBox, trim, crossAxisCoord }) {
    const spreadAxis = isVertical ? "x" : "y";
    const ordered = sequence.slice().sort((a, b) => a[spreadAxis] - b[spreadAxis]);
    const parts = [];

    for (let i = 0; i + 1 < ordered.length; i++) {
        const leftBox = ordered[i];
        const rightBox = ordered[i + 1];

        const segmentStart = leftBox[spreadAxis] + halfBox + trim;
        const segmentEnd = rightBox[spreadAxis] - halfBox - trim;
        if (segmentEnd <= segmentStart) continue;

        if (isVertical) {
            parts.push(`M${segmentStart},${crossAxisCoord}L${segmentEnd},${crossAxisCoord}`);
        } else {
            parts.push(`M${crossAxisCoord},${segmentStart}L${crossAxisCoord},${segmentEnd}`);
        }
    }

    return parts.join("");
}
