/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { select } from "d3-selection";

import BaseWidget from "./base-widget.js";

/**
 * Semicircle gauge — a single rounded-cap stroke whose dash length
 * encodes a percentage value (0–100). Track (unfilled portion)
 * paints `--border-soft` so the silhouette stays visible at 0 %.
 *
 * The arc is a top-half semicircle SVG path stroked at 14 px with
 * `stroke-linecap=round` so both ends land on smooth caps — direct
 * port of the design2 `<GaugeArc>` React widget.
 *
 * Below the arc sits the headline `value%` rendered as serif 56 px
 * with an italic ink-2 `%` suffix. Consumer templates render extra
 * captions (eyebrow label, mono meta, muted caption) as sibling
 * DOM elements via the GaugeArc partial.
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
        this._accent = typeof this.options.accent === "string" && this.options.accent !== ""
            ? this.options.accent
            : "currentColor";
    }

    /**
     * @param {{value: number}|number|null|undefined} data Percentage 0–100, either as a scalar or wrapped in `{value: N}`.
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const value = sanitizeValue(data);

        if (value === null) {
            return this.renderEmptyState(this._emptyMessage());
        }

        // Design2 default `size = 200`, viewBox `size × size*0.62`,
        // radius `size/2 - 14`. Strokes are 14 px with rounded caps;
        // unfilled portion stays visible via the cream track painted
        // first.
        const SIZE = 200;
        const W = SIZE;
        const H = Math.round(SIZE * 0.62);
        const r = SIZE / 2 - 14;
        const cx = SIZE / 2;
        const cy = SIZE / 2 + 10;
        const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
        const circumference = Math.PI * r;
        const filledFraction = Math.max(0, Math.min(1, value / 100));
        const dashLen = filledFraction * circumference;

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-stat-gauge")
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

        // Headline `value%` centred over the arc baseline. Serif
        // 56 px value (mirrors design2 .gs-gauge-val), italic 24 px
        // ink-2 `%` suffix that recedes from the bignum read.
        // Eyebrow label ("documented" / "Lacy 1989") + mono meta
        // ("326 of 2,156") live OUTSIDE the SVG as sibling DOM
        // (see GaugeArc.phtml).
        const valueText = svg.append("text")
            .attr("x", cx)
            .attr("y", cy - 4)
            .attr("text-anchor", "middle")
            .attr("class", "wt-stat-gauge-val")
            .attr("fill", "var(--ink)")
            .style("font-family", "var(--serif)")
            .style("font-size", "56px")
            .style("letter-spacing", "-0.02em");
        valueText.append("tspan").text(formatValue(value));
        valueText.append("tspan")
            .attr("class", "wt-stat-gauge-suf")
            .attr("fill", "var(--ink-2)")
            .style("font-family", "var(--serif)")
            .style("font-size", "24px")
            .style("font-style", "italic")
            .style("letter-spacing", "0")
            .text("%");

        return svg.node();
    }

    /** @private */
    _clearChart() {
        select(this.target).selectAll("svg.wt-stat-gauge").remove();
    }

    /** @private */
    _emptyMessage() {
        return typeof this.options.emptyMessage === "string" && this.options.emptyMessage !== ""
            ? this.options.emptyMessage
            : "";
    }
}

/**
 * Coerce the input to a percentage in [0, 100]. Accepts a bare
 * number or a `{value: N}` wrapper (matches the data-payload shape
 * the partial emits).
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
 * One-decimal localised number, falling back to integer when the
 * fractional digit is zero so "100%" doesn't read as "100.0%".
 *
 * @param {number} value
 * @returns {string}
 */
function formatValue(value) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
