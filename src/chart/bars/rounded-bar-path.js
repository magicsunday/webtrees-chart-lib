/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { path } from "d3-path";

/**
 * Build an SVG `d` for a bar whose INNER edge stays square and whose OUTER edge
 * has both corners rounded — the shape shared by the diverging bar chart (bars
 * grow left / right out of a centre gutter), the mirror histogram (bars grow up
 * / down off a centre axis) and the bar chart (bars grow up off the baseline).
 *
 * Direction-agnostic via `direction`: `left` / `right` grow along X from a
 * vertical gutter line at `base`, with `cross` the bar's top edge and
 * `thickness` its height; `up` / `down` grow along Y from a horizontal axis at
 * `base`, with `cross` the bar's left edge and `thickness` its width. The inner
 * edge sitting flush on `base` is always left square so adjacent bars read as
 * anchored to the shared gutter / axis.
 *
 * A non-positive `length` yields a 1px rounded stub pinned at `base` so an empty
 * category still reads as present; a positive length below `minLength` is
 * floored so a single count stays visible next to a dominant one. The corner
 * radius clamps to the bar's effective length and to half its thickness so it
 * never overruns a short or thin bar.
 *
 * @param {object}                       options
 * @param {"left"|"right"|"up"|"down"}   options.direction   Grow direction off the gutter / axis
 * @param {number}                       options.base        Inner-edge coordinate on the grow axis (square edge)
 * @param {number}                       options.length      Outward length in px (<= 0 or not finite → 1px placeholder stub)
 * @param {number}                       options.cross       Cross-axis start: bar top for left/right, bar left for up/down
 * @param {number}                       options.thickness   Bar thickness on the cross axis
 * @param {number}                       [options.radius]    Maximum outer-corner radius (default 5)
 * @param {number}                       [options.minLength] Floor applied to any positive length (default 2)
 *
 * @returns {string} SVG path `d`
 */
export function roundedBarPath({
    direction,
    base,
    length,
    cross,
    thickness,
    radius = 5,
    minLength = 2,
}) {
    const horizontal = direction === "left" || direction === "right";
    const forward = direction === "right" || direction === "down";
    const p = path();

    // A non-positive (or non-finite) length becomes a 1px placeholder stub pinned
    // at the gutter / axis, so an empty category still reads instead of emitting
    // a NaN-coordinate path. It goes through the same rounded outline as every
    // other bar, so no separate flat path exists.
    const effective = Number.isFinite(length) && length > 0 ? Math.max(length, minLength) : 1;
    const r = Math.min(radius, effective, thickness / 2);
    const outer = forward ? base + effective : base - effective;
    // The edge running out from the inner corner stops `r` short of the outer
    // corner so arcTo can round it toward the outer edge; the sign of that
    // setback flips with the grow direction.
    const beforeCorner = forward ? outer - r : outer + r;

    if (horizontal) {
        p.moveTo(base, cross);
        p.lineTo(beforeCorner, cross);
        p.arcTo(outer, cross, outer, cross + thickness, r);
        p.lineTo(outer, cross + thickness - r);
        p.arcTo(outer, cross + thickness, base, cross + thickness, r);
        p.lineTo(base, cross + thickness);
    } else {
        p.moveTo(cross, base);
        p.lineTo(cross, beforeCorner);
        p.arcTo(cross, outer, cross + r, outer, r);
        p.lineTo(cross + thickness - r, outer);
        p.arcTo(cross + thickness, outer, cross + thickness, beforeCorner, r);
        p.lineTo(cross + thickness, base);
    }
    p.closePath();

    return p.toString();
}
