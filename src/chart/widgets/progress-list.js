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
 * Data contract — `draw(rows)` takes `Array<{label: string, value: number,
 * total?: number}>`: `label` captions the row, `value` drives the bar fill, and
 * the optional per-row `total` makes the bar `value/total` (otherwise it is
 * `value/dataset-max`). Options — `maxItems` (row cap) and `formatter`
 * (value → display string), each with a native get/set accessor.
 *
 * Rows whose value is non-finite or non-positive are dropped during
 * sanitisation. Bar width is value/total per row when total is present,
 * otherwise value/dataset-max. Empty data and all-zero datasets render the
 * shared empty-state placeholder.
 *
 * Strings are written via textContent so HTML in labels or formatter output
 * renders as text, never parsed. The widget emits no selection event.
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget ships no
 * opinionated palette): the root is a `ul.msc-progress-list`; each row is an `<li>`
 * holding a `span.msc-progress-list-label`, a `span.msc-progress-list-bar` track wrapping its
 * `span.msc-progress-list-bar-fill` (its inline `width` is the only value the widget
 * sets — colour and height stay with the host), and a `span.msc-progress-list-value`.
 * Empty / all-zero data renders the shared `.chart-empty-state` placeholder
 * instead.
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
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.maxItems = this.options.maxItems;
        this.formatter = this.options.formatter;
    }

    /**
     * The maximum number of rows rendered after sanitisation. A non-positive or
     * non-finite value falls back to `Number.POSITIVE_INFINITY` so the whole
     * dataset shows.
     *
     * @returns {number}
     */
    get maxItems() {
        return this._maxItems;
    }

    /**
     * @param {number|undefined} value The row cap; a missing or non-positive
     *   value resets to `Number.POSITIVE_INFINITY` (no cap). The runtime guard
     *   keeps the JSON dispatcher (which assigns untyped values) safe.
     */
    set maxItems(value) {
        this._maxItems = pickPositiveInt(value, Number.POSITIVE_INFINITY);
    }

    /**
     * The function turning a row value into its display string. Defaults to a
     * localised number formatter.
     *
     * @returns {(value: number) => string}
     */
    get formatter() {
        return this._formatter;
    }

    /**
     * @param {((value: number) => string)|undefined} value The value formatter; a
     *   non-function value resets to the default localised number formatter. The
     *   runtime guard keeps the JSON dispatcher (which assigns untyped values)
     *   safe.
     */
    set formatter(value) {
        this._formatter = typeof value === "function" ? value : defaultFormatter;
    }

    /**
     * @param {Array<{label?: string, value: number, total?: number}>|null|undefined} data
     * @returns {HTMLUListElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const rows = sanitizeRows(data, this._maxItems);
        if (rows.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const datasetMax = rows.reduce((max, row) => Math.max(max, row.value), 0);

        const ul = document.createElement("ul");
        ul.className = "msc-progress-list";

        for (const row of rows) {
            const denominator = row.total && row.total > 0 ? row.total : datasetMax;
            const pct = denominator > 0 ? Math.min(100, (row.value / denominator) * 100) : 0;

            const li = document.createElement("li");

            const label = document.createElement("span");
            label.className = "msc-progress-list-label";
            label.textContent = row.label;

            const bar = document.createElement("span");
            bar.className = "msc-progress-list-bar";
            const barFill = document.createElement("span");
            barFill.className = "msc-progress-list-bar-fill";
            barFill.style.width = `${formatPercent(pct)}%`;
            bar.appendChild(barFill);

            const value = document.createElement("span");
            value.className = "msc-progress-list-value";
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
            ":scope > ul.msc-progress-list, :scope > .chart-empty-state",
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
