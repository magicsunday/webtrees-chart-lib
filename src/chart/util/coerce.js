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

/** The string fields {@see sanitizeLabelValueRows} carries through unless told otherwise. */
const DEFAULT_PASSTHROUGH = ["sub", "tooltipValue"];

/**
 * Filter a label/value payload down to the rows a category chart can plot:
 * objects carrying a non-empty label and a finite, non-negative value. Order is
 * preserved. When `dropZero` is true, exactly-zero values are removed too — for
 * layouts (bubble packs, radial slices) that cannot place a zero-magnitude item.
 *
 * The fields named in `passthrough` are carried through untouched when they are
 * non-empty strings. The default is `sub`, a secondary per-row caption (e.g. the
 * month-radial's date-range sub-label), and `tooltipValue`, a pre-formatted,
 * localised replacement for the bare value in the tooltip (e.g. "81 persons"
 * instead of "81"). A widget reads them off the sanitized row, and a row without
 * them stays a bare `{label, value}`.
 *
 * @param {Array<Record<string, unknown>>|null|undefined}  data The raw payload.
 * @param {{dropZero?: boolean, passthrough?: string[]}} [options] Drop zero-valued rows, and name the string fields to carry through.
 *
 * @returns {Array<{label: string, value: number, [field: string]: string|number}>}
 */
export function sanitizeLabelValueRows(
    data,
    { dropZero = false, passthrough = DEFAULT_PASSTHROUGH } = {},
) {
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
        /** @type {{label: string, value: number, [field: string]: string|number}} */
        const cleaned = { label, value };
        for (const field of passthrough) {
            if (typeof row[field] === "string" && row[field] !== "") {
                cleaned[field] = row[field];
            }
        }
        out.push(cleaned);
    }

    return out;
}
