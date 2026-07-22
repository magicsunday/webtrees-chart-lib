/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { pickPositiveInt } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

/**
 * Plain-HTML categorical timeline: one labelled row per item, each drawn as a
 * stem running from the axis start to a dot, the dot sitting at the item's
 * place on a shared horizontal value axis. HTML beats SVG here — labels wrap
 * natively and the only data-driven inline styles are the stem `width` and the
 * dot `left` percentage, so there is no getBBox/measure step and the layout
 * stays responsive without a redraw.
 *
 * Data contract — `draw(rows)` takes `Array<{label: string, value: number,
 * active?: boolean, meta?: string}>`: `label` captions the row, `value`
 * positions the dot on the axis, the optional `active` flag pins the row to the
 * axis end and marks it for emphasis (e.g. "still in use"), and the optional
 * `meta` string is a secondary caption (e.g. an occurrence count). Inactive rows
 * need a finite `value`; active rows do not (they always sit at the end). Rows
 * are rendered in the order given — the caller decides the sort.
 *
 * Options — `valueMin` / `valueMax` pin the axis domain (each defaults to the
 * extent of the inactive rows' values), `activeLabel` is the primary caption
 * shown for active rows in place of a formatted value, `maxItems` caps the row
 * count, and `formatter` (value → display string) renders the inactive rows'
 * primary caption and the two axis ticks. The domain is collapsed-safe: when it
 * has no width every inactive dot sits at the centre.
 *
 * Strings are written via textContent so HTML in labels, meta or formatter
 * output renders as text, never parsed. The widget emits no selection event and
 * paints no colour — the consumer's stylesheet owns every hue.
 *
 * Styling hooks: the root is a `div.msc-name-timeline` holding a
 * `div.msc-name-timeline-axis` (two `span` ends) and an
 * `ol.msc-name-timeline-rows`. Each item is a `li.msc-name-timeline-row`
 * (gaining `is-active` when flagged) with a `span.msc-name-timeline-label`, a
 * `span.msc-name-timeline-track` wrapping a `span.msc-name-timeline-line` (its
 * inline `width`) and a `span.msc-name-timeline-dot` (its inline `left`), and a
 * `span.msc-name-timeline-meta` holding a `span.msc-name-timeline-primary` and,
 * when `meta` is present, a `span.msc-name-timeline-secondary`. Empty data
 * renders the shared `.chart-empty-state` placeholder instead.
 *
 * Entrance: when motion is allowed the root gains `.msc-name-timeline--animate`;
 * the consumer stylesheet holds each stem + dot at their initial keyframe while
 * that flag is present without `.is-revealed`, and transitions them to the
 * resting state once `.is-revealed` is added. The widget adds `.is-revealed`
 * inline by default, or defers it to `playEntry()` when the consumer set
 * `animateOnReveal` (reveal-on-scroll). Reduced-motion users never get the flag,
 * so they see the resting state with no transition.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class NameTimeline extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     valueMin?: number,
     *     valueMax?: number,
     *     activeLabel?: string,
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
        this.valueMin = this.options.valueMin;
        this.valueMax = this.options.valueMax;
        this.activeLabel = this.options.activeLabel;
        this.maxItems = this.options.maxItems;
        this.formatter = this.options.formatter;
    }

    /**
     * The lower bound of the value axis, or `undefined` to derive it from the
     * inactive rows' smallest value at draw time.
     *
     * @returns {number|undefined}
     */
    get valueMin() {
        return this._valueMin;
    }

    /**
     * @param {number|undefined} value An explicit axis minimum; a non-finite
     *   value clears the override. The runtime guard keeps the JSON dispatcher
     *   (which assigns untyped values) safe.
     */
    set valueMin(value) {
        this._valueMin = typeof value === "number" && Number.isFinite(value) ? value : undefined;
    }

    /**
     * The upper bound of the value axis, or `undefined` to derive it from the
     * inactive rows' largest value at draw time.
     *
     * @returns {number|undefined}
     */
    get valueMax() {
        return this._valueMax;
    }

    /**
     * @param {number|undefined} value An explicit axis maximum; a non-finite
     *   value clears the override. The runtime guard keeps the JSON dispatcher
     *   safe.
     */
    set valueMax(value) {
        this._valueMax = typeof value === "number" && Number.isFinite(value) ? value : undefined;
    }

    /**
     * The primary caption shown for active rows in place of a formatted value.
     * Defaults to the empty string (no caption).
     *
     * @returns {string}
     */
    get activeLabel() {
        return this._activeLabel;
    }

    /**
     * @param {string|undefined} value The active-row caption; a non-string value
     *   resets to the empty string. The runtime guard keeps the JSON dispatcher
     *   safe.
     */
    set activeLabel(value) {
        this._activeLabel = typeof value === "string" ? value : "";
    }

    /**
     * The maximum number of rows to render after sanitisation. A non-positive or
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
     * The function turning a row value into its axis-caption string. The neutral
     * default is `String` (a plain integer, no locale grouping); a caller may
     * pass its own via `options.formatter`.
     *
     * @returns {(value: number) => string}
     */
    get formatter() {
        return this._formatter;
    }

    /**
     * @param {((value: number) => string)|undefined} value The value formatter; a
     *   non-function value resets to the `String` default. The runtime guard
     *   keeps the JSON dispatcher (which assigns untyped values) safe.
     */
    set formatter(value) {
        this._formatter = typeof value === "function" ? value : String;
    }

    /**
     * @param {Array<{label?: string, value?: number, active?: boolean, meta?: string}>|null|undefined} data
     * @returns {HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const rows = sanitizeRows(data, this._maxItems);
        if (rows.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const [min, max] = resolveDomain(rows, this._valueMin, this._valueMax);

        const root = document.createElement("div");
        root.className = "msc-name-timeline";
        root.append(this._buildAxis(min, max), this._buildRows(rows, min, max));

        this.target.appendChild(root);

        // Entrance: the consumer stylesheet holds each row's stem + dot at their
        // initial keyframe while `.msc-name-timeline--animate` is present without
        // `.is-revealed`, then transitions to the resting state once revealed.
        // `_runEntry` decides WHEN: inline immediately (default), held until
        // `playEntry()` (reveal-on-scroll), or skipped (reduced motion). The flag
        // is added only when motion is allowed, so reduced-motion users keep the
        // resting state with no held keyframe.
        if (!this._prefersReducedMotion()) {
            root.classList.add("msc-name-timeline--animate");
        }

        this._runEntry((animate) => {
            if (!animate) {
                // Reduced motion / held-then-skipped: drop the flag so the
                // resting state shows at once with no transition.
                root.classList.remove("msc-name-timeline--animate");

                return;
            }

            // Force the held initial keyframe to paint before flipping to the
            // revealed state, so an inline entry transitions from it instead of
            // snapping straight to the resting state.
            void root.offsetWidth;
            root.classList.add("is-revealed");
        });

        return root;
    }

    /**
     * Build the two-ended axis caption strip.
     *
     * @param {number} min
     * @param {number} max
     * @returns {HTMLDivElement}
     */
    _buildAxis(min, max) {
        const axis = document.createElement("div");
        axis.className = "msc-name-timeline-axis";
        axis.setAttribute("aria-hidden", "true");

        const start = document.createElement("span");
        start.textContent = this._formatter(min);
        const end = document.createElement("span");
        end.textContent = this._formatter(max);

        axis.append(start, end);
        return axis;
    }

    /**
     * Build the row list.
     *
     * @param {Array<{label: string, value: number, active: boolean, meta: string}>} rows
     * @param {number} min
     * @param {number} max
     * @returns {HTMLOListElement}
     */
    _buildRows(rows, min, max) {
        const list = document.createElement("ol");
        list.className = "msc-name-timeline-rows";

        for (const row of rows) {
            const left = row.active ? 100 : positionPercent(row.value, min, max);

            const item = document.createElement("li");
            item.className = "msc-name-timeline-row";
            if (row.active) {
                item.classList.add("is-active");
            }

            const label = document.createElement("span");
            label.className = "msc-name-timeline-label";
            label.textContent = row.label;

            const track = document.createElement("span");
            track.className = "msc-name-timeline-track";

            const line = document.createElement("span");
            line.className = "msc-name-timeline-line";
            line.style.width = `${left}%`;

            const dot = document.createElement("span");
            dot.className = "msc-name-timeline-dot";
            dot.style.left = `${left}%`;

            track.append(line, dot);

            const meta = document.createElement("span");
            meta.className = "msc-name-timeline-meta";

            const primary = document.createElement("span");
            primary.className = "msc-name-timeline-primary";
            primary.textContent = row.active ? this._activeLabel : this._formatter(row.value);
            meta.appendChild(primary);

            if (row.meta !== "") {
                const secondary = document.createElement("span");
                secondary.className = "msc-name-timeline-secondary";
                secondary.textContent = row.meta;
                meta.appendChild(secondary);
            }

            item.append(label, track, meta);
            list.appendChild(item);
        }

        return list;
    }

    /**
     * Remove any timeline this widget rendered earlier plus any empty-state
     * placeholder so redraw is idempotent in both directions.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > div.msc-name-timeline, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }
}

/**
 * Drop null/non-object entries; keep a row when it is active (pinned to the
 * axis end, value optional) or carries a finite value. Coerce missing labels
 * and meta to empty string, value to a number, and active to a boolean. Trim to
 * maxItems after filtering so the list always shows real rows.
 *
 * @param {unknown} data
 * @param {number}  maxItems
 * @returns {Array<{label: string, value: number, active: boolean, meta: string}>}
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
        const active = row.active === true;
        if (!active && !Number.isFinite(row.value)) {
            continue;
        }
        out.push({
            label: typeof row.label === "string" ? row.label : String(row.label ?? ""),
            value: Number.isFinite(row.value) ? row.value : 0,
            active,
            meta: typeof row.meta === "string" ? row.meta : "",
        });
        if (out.length >= maxItems) {
            break;
        }
    }
    return out;
}

/**
 * Resolve the axis domain from the option overrides, falling back to the extent
 * of the inactive rows' values (active rows are pinned to the end and do not
 * stretch the axis). A collapsed domain (no width after overrides) is widened by
 * one unit on each side so dots land at the centre instead of dividing by zero.
 *
 * @param {Array<{value: number, active: boolean}>} rows
 * @param {number|undefined}                        overrideMin
 * @param {number|undefined}                        overrideMax
 * @returns {[number, number]}
 */
function resolveDomain(rows, overrideMin, overrideMax) {
    let min = overrideMin;
    let max = overrideMax;

    if (min === undefined || max === undefined) {
        let dataMin = Number.POSITIVE_INFINITY;
        let dataMax = Number.NEGATIVE_INFINITY;
        for (const row of rows) {
            if (row.active) {
                continue;
            }
            dataMin = Math.min(dataMin, row.value);
            dataMax = Math.max(dataMax, row.value);
        }
        // All-active (or empty inactive) datasets carry no extent; fall back to
        // a unit domain so the collapse guard below centres everything.
        if (!Number.isFinite(dataMin)) {
            dataMin = 0;
            dataMax = 0;
        }
        min = min ?? dataMin;
        max = max ?? dataMax;
    }

    if (min >= max) {
        return [min - 1, max + 1];
    }
    return [min, max];
}

/**
 * Position a value as a percentage within [min, max], clamped to [0, 100] and
 * rounded to at most one decimal place.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {string}
 */
function positionPercent(value, min, max) {
    const ratio = (value - min) / (max - min);
    const clamped = Math.min(1, Math.max(0, ratio));
    const rounded = Math.round(clamped * 1000) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
