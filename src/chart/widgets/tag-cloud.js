/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";

import BaseWidget from "./base-widget.js";

const DEFAULT_MIN_FONT = 10;
const DEFAULT_MAX_FONT = 48;

/**
 * Simple flow-layout tag cloud. No d3-cloud dependency — that package
 * adds ~50 KB and forces a layout pass; for genealogy-statistics use
 * cases (<= ~20 surnames or given names) native CSS flow with linear
 * font-size scaling is enough.
 *
 * Sanitised input: rows that are null/non-object are dropped, values
 * are coerced to 0 when non-finite and rows with value <= 0 are
 * filtered out. Labels are written via textContent so HTML never
 * parses, and the native title attribute carries "label: value" for
 * tooltip-on-hover.
 *
 * Equal-value datasets render at maxFont (linear scale would divide by
 * zero domain). Min/maxFont options that are non-finite fall back to
 * defaults; if the caller swaps them, the absolute floor/ceiling is
 * computed via Math.min/max so output stays clamped within the pair.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class TagCloud extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     minFont?: number,
     *     maxFont?: number,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._minFont = pickFiniteNumber(this.options.minFont, DEFAULT_MIN_FONT);
        this._maxFont = pickFiniteNumber(this.options.maxFont, DEFAULT_MAX_FONT);
    }

    /**
     * @param {Array<{label?: string, value: number}>|null|undefined} data
     * @returns {HTMLDivElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const rows = sanitizeRows(data);
        if (rows.length === 0) {
            return this.renderEmptyState(
                typeof this.options.emptyMessage === "string"
                    ? this.options.emptyMessage
                    : "No data available",
            );
        }

        const [domainMin, domainMax] = extent(rows, (row) => row.value);
        const rangeMin = Math.min(this._minFont, this._maxFont);
        const rangeMax = Math.max(this._minFont, this._maxFont);
        const scale =
            domainMin === domainMax
                ? () => rangeMax
                : scaleLinear().domain([domainMin, domainMax]).range([rangeMin, rangeMax]);

        const wrapper = document.createElement("div");
        wrapper.className = "tag-cloud";

        for (const row of rows) {
            const span = document.createElement("span");
            span.textContent = row.label;
            span.style.fontSize = `${scale(row.value)}px`;
            span.setAttribute("title", `${row.label}: ${row.value.toLocaleString()}`);
            wrapper.appendChild(span);
        }

        this.target.appendChild(wrapper);
        return wrapper;
    }

    /**
     * Remove any cloud and any placeholder this widget rendered earlier
     * so redraw is idempotent in both directions.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > .tag-cloud, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }
}

/**
 * @param {unknown} value
 * @param {number}  fallback
 * @returns {number}
 */
function pickFiniteNumber(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Drop null/non-object entries and coerce missing labels to empty string.
 * Non-finite values become 0 and are then filtered (scale needs > 0).
 *
 * @param {unknown} data
 * @returns {Array<{label: string, value: number}>}
 */
function sanitizeRows(data) {
    if (!Array.isArray(data)) {
        return [];
    }
    const out = [];
    for (const row of data) {
        if (row === null || typeof row !== "object") {
            continue;
        }
        const value = Number.isFinite(row.value) && row.value > 0 ? row.value : 0;
        if (value <= 0) {
            continue;
        }
        out.push({
            label: typeof row.label === "string" ? row.label : String(row.label ?? ""),
            value,
        });
    }
    return out;
}
