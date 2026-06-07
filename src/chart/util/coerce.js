/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Shared input-coercion helpers used across the chart widgets. Pure functions,
 * no DOM access — each one turns caller-supplied, potentially malformed input
 * into a safe value the render code can rely on.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */

/**
 * Return `value` when it is a finite, strictly positive number, otherwise the
 * fallback. Used for option fields (width, height, radius …) that must never be
 * zero or negative.
 *
 * @param {unknown} value    The candidate value.
 * @param {number}  fallback The default to use when `value` is unusable.
 *
 * @returns {number}
 */
export function pickPositive(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Clamp a fractional option into `[0, max]`, falling back when the input is not
 * a finite number. Negative values clamp to `0`; values above `max` clamp to
 * `max`. The default ceiling of `0.95` keeps padding-style fractions from eating
 * the whole layout; callers with a tighter domain (e.g. d3-chord's padAngle)
 * pass their own `max`.
 *
 * @param {unknown} value        The candidate fraction.
 * @param {number}  defaultValue The default to use when `value` is not finite.
 * @param {number}  [max]        The upper clamp bound (default `0.95`).
 *
 * @returns {number}
 */
export function pickFraction(value, defaultValue, max = 0.95) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return defaultValue;
    }
    if (value < 0) {
        return 0;
    }
    if (value > max) {
        return max;
    }
    return value;
}

/**
 * Filter a label/value payload down to the rows a category chart can plot:
 * objects carrying a non-empty label and a finite, non-negative value. Order is
 * preserved. When `dropZero` is true, exactly-zero values are removed too — for
 * layouts (bubble packs, radial slices) that cannot place a zero-magnitude item.
 *
 * Two optional non-empty strings on a row are carried through untouched: `sub`,
 * a secondary per-row caption (e.g. the month-radial's date-range sub-label),
 * and `tooltipValue`, a pre-formatted, localised replacement for the bare value
 * in the tooltip (e.g. "81 persons" instead of "81"). A widget reads either off
 * the sanitized row; rows without them stay a bare `{label, value}`.
 *
 * @param {Array<{label: string, value: number, sub?: string, tooltipValue?: string}>|null|undefined} data The raw payload.
 * @param {{dropZero?: boolean}}                                                                       [options] Drop zero-valued rows.
 *
 * @returns {Array<{label: string, value: number, sub?: string, tooltipValue?: string}>}
 */
export function sanitizeLabelValueRows(data, { dropZero = false } = {}) {
    if (!Array.isArray(data)) {
        return [];
    }

    const out = [];
    for (const row of data) {
        if (row === null || typeof row !== "object") {
            continue;
        }
        const label = typeof row.label === "string" ? row.label : String(row.label ?? "");
        const value = Number(row.value);
        if (label === "" || !Number.isFinite(value) || value < 0 || (dropZero && value === 0)) {
            continue;
        }
        const cleaned = { label, value };
        if (typeof row.sub === "string" && row.sub !== "") {
            cleaned.sub = row.sub;
        }
        if (typeof row.tooltipValue === "string" && row.tooltipValue !== "") {
            cleaned.tooltipValue = row.tooltipValue;
        }
        out.push(cleaned);
    }

    return out;
}
