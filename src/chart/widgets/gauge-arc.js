/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { path } from "d3-path";
import { select } from "d3-selection";

import BaseWidget from "./base-widget.js";

/**
 * Semicircle gauge — a single rounded-cap stroke whose dash length encodes a
 * percentage value (0–100). The track (the unfilled portion) is stroked with
 * the host token `var(--border-soft)` so the silhouette stays visible at 0 %;
 * the filled portion takes the `accent` option (default `currentColor`).
 *
 * The arc is a top-half semicircle SVG path stroked at 14 px with
 * `stroke-linecap=round` so both ends land on smooth caps. Below the arc sits
 * the headline `value%` as a centred `<text>`. Any surrounding captions
 * (eyebrow label, meta line, caption) are the consumer's own sibling DOM around
 * the widget host, not part of this widget.
 *
 * The widget emits no selection event.
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget ships no
 * opinionated palette beyond the `var(--border-soft)` track token): the root is
 * `svg.wt-gauge-arc` holding two `path` strokes (the track, then the filled
 * arc) and a centred `text.wt-gauge-arc-value` whose first `<tspan>` is the
 * formatted number and whose second `tspan.wt-gauge-arc-suffix` is the `%` sign.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class GaugeArc extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     value?: number,
     *     accent?: string,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.accent = this.options.accent;
        this.emptyMessage = this.options.emptyMessage;
    }

    /**
     * The colour of the filled arc. A non-string or empty value falls back to
     * `currentColor` so the gauge always paints.
     *
     * @returns {string}
     */
    get accent() {
        return this._accent;
    }

    /**
     * @param {string|undefined} value The accent colour (any CSS colour string);
     *   a missing or empty value resets to `currentColor`. The runtime guard
     *   keeps the JSON dispatcher (which assigns untyped values) safe.
     */
    set accent(value) {
        this._accent = typeof value === "string" && value !== "" ? value : "currentColor";
    }

    /**
     * The placeholder text shown when no finite value is supplied. A non-string
     * or empty value falls back to an empty string.
     *
     * @returns {string}
     */
    get emptyMessage() {
        return this._emptyMessage;
    }

    /**
     * @param {string|undefined} value The placeholder text; a missing or empty
     *   value resets to an empty string. The runtime guard keeps the JSON
     *   dispatcher (which assigns untyped values) safe.
     */
    set emptyMessage(value) {
        this._emptyMessage = typeof value === "string" && value !== "" ? value : "";
    }

    /**
     * @param {{value: number}|number|null|undefined} data Percentage 0–100, either as a scalar or wrapped in `{value: N}`.
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const value = sanitizeValue(data);

        if (value === null) {
            return this.renderEmptyState(this.emptyMessage);
        }

        // Geometry: `size = 200`, viewBox `size × size*0.62`, radius
        // `size/2 - 14`. Strokes are 14 px with rounded caps; the
        // unfilled portion stays visible via the track stroke painted
        // first.
        const SIZE = 200;
        const W = SIZE;
        const H = Math.round(SIZE * 0.62);
        const r = SIZE / 2 - 14;
        const cx = SIZE / 2;
        const cy = SIZE / 2 + 10;
        // Top-half semicircle from (cx - r, cy) to (cx + r, cy), built via the
        // d3-path context rather than a hand-assembled `d` string. The arc runs
        // from angle π through 3π/2 (top) to 2π so it bows upward.
        const arcContext = path();
        arcContext.arc(cx, cy, r, Math.PI, 2 * Math.PI);
        const arcPath = arcContext.toString();
        const circumference = Math.PI * r;
        const filledFraction = Math.max(0, Math.min(1, value / 100));
        const dashLen = filledFraction * circumference;

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-gauge-arc")
            .attr("viewBox", `0 0 ${W} ${H}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img");

        svg.append("path")
            .attr("d", arcPath)
            .attr("fill", "none")
            .attr("stroke", "var(--border-soft)")
            .attr("stroke-width", "14")
            .attr("stroke-linecap", "round");

        svg.append("path")
            .attr("d", arcPath)
            .attr("fill", "none")
            .attr("stroke", this._accent)
            .attr("stroke-width", "14")
            .attr("stroke-linecap", "round")
            .attr("stroke-dasharray", `${dashLen} ${circumference}`);

        // Headline `value%` centred over the arc baseline: a larger
        // serif number with a smaller italic `%` suffix that recedes
        // from the bignum read. Any eyebrow label or meta line lives
        // OUTSIDE the SVG as the consumer's sibling DOM. Typography
        // lives in the host stylesheet under `.wt-gauge-arc-value` /
        // `.wt-gauge-arc-suffix`.
        const valueText = svg
            .append("text")
            .attr("x", cx)
            .attr("y", cy - 4)
            .attr("text-anchor", "middle")
            .attr("class", "wt-gauge-arc-value");
        valueText.append("tspan").text(formatValue(value));
        valueText.append("tspan").attr("class", "wt-gauge-arc-suffix").text("%");

        return svg.node();
    }

    /** @private */
    _clearChart() {
        select(this.target).selectAll("svg.wt-gauge-arc").remove();
    }
}

/**
 * Coerce the input to a percentage in [0, 100]. Accepts a bare number or a
 * `{value: N}` wrapper (matches the data-payload shape the partial emits).
 *
 * @param {{value: number}|number|null|undefined} data
 * @returns {number|null}
 */
function sanitizeValue(data) {
    if (data === null || data === undefined) {
        return null;
    }
    let raw;
    if (typeof data === "number") {
        raw = data;
    } else if (typeof data === "object" && data !== null) {
        raw = Number(data.value);
    } else {
        raw = Number(data);
    }
    if (!Number.isFinite(raw)) {
        return null;
    }
    return Math.max(0, Math.min(100, raw));
}

/**
 * One-decimal localised number, falling back to integer when the fractional
 * digit is zero so "100%" doesn't read as "100.0%".
 *
 * @param {number} value
 * @returns {string}
 */
function formatValue(value) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
