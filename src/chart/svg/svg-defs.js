/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * @import { Selection } from "d3-selection"
 */

/**
 * Wraps the SVG <defs> element and exposes append, select, and get helpers
 * so callers (Gradient, Text, Marriage, PngExport, ...) can register path,
 * clipPath, linearGradient, and filter definitions without holding a raw D3
 * selection themselves.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class SvgDefs {
    /**
     * @param {Selection<SVGSVGElement, unknown, HTMLElement, unknown>} svg The D3 selection of the parent <svg> element
     */
    constructor(svg) {
        // Create the <svg:defs> element
        this._element = svg.append("defs");
    }

    /**
     * Returns the <defs> D3 selection.
     *
     * @return {Selection<SVGDefsElement, unknown, HTMLElement, unknown>}
     */
    get() {
        return this._element;
    }

    /**
     * Selects the first child of <defs> matching the selector.
     *
     * @param {string} select CSS selector
     *
     * @return {Selection<SVGElement, unknown, HTMLElement, unknown>}
     */
    select(select) {
        return this._element.select(select);
    }

    /**
     * Selects all children of <defs> matching the selector.
     *
     * @param {string} select CSS selector
     *
     * @return {Selection<SVGElement, unknown, SVGDefsElement, unknown>}
     */
    selectAll(select) {
        return this._element.selectAll(select);
    }

    /**
     * Appends a new child element to <defs> and returns its D3 selection.
     *
     * @param {string} name Tag name (e.g. "path", "linearGradient", "filter")
     *
     * @return {Selection<SVGElement, unknown, HTMLElement, unknown>}
     */
    append(name) {
        return this._element.append(name);
    }
}
