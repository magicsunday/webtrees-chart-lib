/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { path } from "d3-path";

/**
 * Build an SVG `d` attribute for the elbow lines from one source point (parent
 * block) down to N children, emitted as a single consolidated path: source-drop
 * to the elbow row, one spine across the elbow row covering source and every
 * child column, then one short drop per child from the elbow row to the child
 * box edge.
 *
 * Shared geometry (source-drop, spine) is emitted exactly once so the browser
 * doesn't stack multiple strokes on top of each other. With `children.length
 * === 1` the spine collapses to zero length and is skipped automatically.
 *
 * Axis-agnostic via `isVertical`: vertical layouts drop along Y, the elbow row
 * runs along X; horizontal layouts run-out along X, the elbow column runs along
 * Y.
 *
 * @param {object}                       options
 * @param {{x:number,y:number}}          options.source           Where the line emerges from the parent block
 * @param {Array<{x:number,y:number}>}   options.children         Target person-box positions
 * @param {boolean}                      options.isVertical       True for top-bottom / bottom-top layouts
 * @param {number}                       options.halfBoxCross     Half the box dimension on the cross axis (= halfBoxHeight when vertical)
 * @param {number}                       options.halfOffsetCross  Half the inter-row offset on the cross axis (= halfYOffset when vertical)
 * @param {number}                       options.direction        +1 or -1 to flip the cross-axis direction (down/up, right/left)
 *
 * @returns {string} SVG path `d` attribute (empty string when no children)
 */
export function elbowsPath({
    source,
    children,
    isVertical,
    halfBoxCross,
    halfOffsetCross,
    direction,
}) {
    if (!children || children.length === 0) return "";

    const context = path();

    if (isVertical) {
        const elbowY = children[0].y - halfBoxCross * direction - halfOffsetCross * direction;
        const targetY = children[0].y - halfBoxCross * direction;

        // Source drop to the elbow row.
        context.moveTo(source.x, source.y);
        context.lineTo(source.x, elbowY);

        // Single spine across the elbow row, covering source and every child column.
        const xs = children.map((child) => child.x);
        const spineMin = Math.min(source.x, ...xs);
        const spineMax = Math.max(source.x, ...xs);
        if (spineMax > spineMin) {
            context.moveTo(spineMin, elbowY);
            context.lineTo(spineMax, elbowY);
        }

        // One short drop per child from the elbow row to the child box edge.
        for (const child of children) {
            context.moveTo(child.x, elbowY);
            context.lineTo(child.x, targetY);
        }
    } else {
        const elbowX = children[0].x - halfBoxCross * direction - halfOffsetCross * direction;
        const targetX = children[0].x - halfBoxCross * direction;

        context.moveTo(source.x, source.y);
        context.lineTo(elbowX, source.y);

        const ys = children.map((child) => child.y);
        const spineMin = Math.min(source.y, ...ys);
        const spineMax = Math.max(source.y, ...ys);
        if (spineMax > spineMin) {
            context.moveTo(elbowX, spineMin);
            context.lineTo(elbowX, spineMax);
        }

        for (const child of children) {
            context.moveTo(elbowX, child.y);
            context.lineTo(targetX, child.y);
        }
    }

    return context.toString();
}
