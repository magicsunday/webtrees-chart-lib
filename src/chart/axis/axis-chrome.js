/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Removal of the chrome d3-axis renders by default — the baseline path and the
 * per-tick stub lines — as two independent operations, so each widget drops
 * exactly the parts it does not want. Axis construction itself (scale, tick
 * count, tick format) stays per-widget; only the removal is shared.
 *
 * Both are applied through d3's `selection.call`, which passes the selection as
 * the first argument and returns it, so they chain off the `.call(axis)` that
 * renders the axis.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */

/**
 * Remove the baseline path (`path.domain`) d3-axis draws along the axis. Every
 * axis in this package drops it: no widget's design uses that path, and the
 * ones that do want a visible rule either draw their own or let a `tickSize`
 * grid carry it.
 *
 * @param {import("d3-selection").Selection<SVGGElement, unknown, null, undefined>} axisGroup The rendered axis group.
 *
 * @returns {void}
 */
export function stripAxisDomainPath(axisGroup) {
    axisGroup.select(".domain").remove();
}

/**
 * Remove the per-tick stub lines, leaving the tick labels standing.
 *
 * @param {import("d3-selection").Selection<SVGGElement, unknown, null, undefined>} axisGroup The rendered axis group.
 *
 * @returns {void}
 */
export function stripAxisTickLines(axisGroup) {
    axisGroup.selectAll(".tick line").remove();
}
