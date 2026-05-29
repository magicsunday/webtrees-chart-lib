/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import BaseWidget from "./base-widget.js";

/**
 * Plain-HTML labelled progress-bar list. SVG would be overkill for label + bar
 * + value, and HTML lets long labels respect native wrap + clamp
 * (overflow-wrap: anywhere) without the nowrap+max-width truncation trap.
 *
 * Rows whose value is non-finite or non-positive are dropped during
 * sanitisation. Bar width is value/total per row when total is present,
 * otherwise value/dataset-max. Empty data and all-zero datasets render the
 * shared empty-state placeholder.
 *
 * Strings are written via textContent so HTML in labels or formatter output
 * renders as text, never parsed.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class ProgressList extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     maxItems?: number,
     *     formatter?: (value: number) => string,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._maxItems = pickPositiveInt(this.options.maxItems, Number.POSITIVE_INFINITY);
        this._formatter =
            typeof this.options.formatter === "function"
                ? this.options.formatter
                : defaultFormatter;
    }

    /**
     * @param {Array<{label?: string, value: number, total?: number}>|null|undefined} data
     * @returns {HTMLUListElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const rows = sanitizeRows(data, this._maxItems);
        if (rows.length === 0) {
            return this.renderEmptyState(
                typeof this.options.emptyMessage === "string"
                    ? this.options.emptyMessage
                    : "No data available",
            );
        }

        const datasetMax = rows.reduce((max, row) => Math.max(max, row.value), 0);

        const ul = document.createElement("ul");
        ul.className = "progress-list";

        for (const row of rows) {
            const denominator = row.total && row.total > 0 ? row.total : datasetMax;
            const pct = denominator > 0 ? Math.min(100, (row.value / denominator) * 100) : 0;

            const li = document.createElement("li");

            const label = document.createElement("span");
            label.className = "progress-label";
            label.textContent = row.label;

            const bar = document.createElement("span");
            bar.className = "progress-bar";
            const barFill = document.createElement("span");
            barFill.className = "progress-bar-fill";
            barFill.style.width = `${formatPercent(pct)}%`;
            bar.appendChild(barFill);

            const value = document.createElement("span");
            value.className = "progress-value";
            value.textContent = this._formatter(row.value);

            li.append(label, bar, value);
            ul.appendChild(li);
        }

        this.target.appendChild(ul);
        return ul;
    }

    /**
     * Remove any list this widget rendered earlier plus any empty-state
     * placeholder so redraw is idempotent in both directions.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > ul.progress-list, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function defaultFormatter(value) {
    return value.toLocaleString();
}

/**
 * @param {unknown} value
 * @param {number}  fallback
 * @returns {number}
 */
function pickPositiveInt(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    return fallback;
}

/**
 * Drop null/non-object entries, coerce non-finite values to 0 then filter,
 * coerce missing labels to empty string. Trim to maxItems after filtering so
 * the list always shows real rows.
 *
 * @param {unknown} data
 * @param {number}  maxItems
 * @returns {Array<{label: string, value: number, total?: number}>}
 */
function sanitizeRows(data, maxItems) {
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
            ...row,
            label: typeof row.label === "string" ? row.label : String(row.label ?? ""),
            value,
        });
        if (out.length >= maxItems) {
            break;
        }
    }
    return out;
}

/**
 * Format a percentage with at most one decimal place, trimming trailing zero.
 *
 * @param {number} pct
 * @returns {string}
 */
function formatPercent(pct) {
    const rounded = Math.round(pct * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
