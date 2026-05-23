/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { select } from "d3-selection";
import { arc as d3Arc } from "d3-shape";

import BaseWidget from "./base-widget.js";

const TAU = Math.PI * 2;
const HALF = Math.PI;

/**
 * Semicircle gauge — a single arc whose fill encodes a percentage
 * value (0–100). The unfilled portion of the same arc tracks
 * `--border-soft` so the gauge silhouette stays visible at 0 %.
 *
 * Below the arc sits the headline `value%` and an optional `label`
 * caption (consumer templates that want richer meta lines can render
 * extra captions in their own markup around the widget host —
 * GaugeArc itself only owns the arc + headline + label).
 *
 * Pure d3-shape arcs, no animation, no tooltip lifecycle.
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
     *     label?: string,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._accent = typeof this.options.accent === "string" && this.options.accent !== ""
            ? this.options.accent
            : "currentColor";
        this._label = typeof this.options.label === "string" ? this.options.label : "";
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

        const W = 240;
        const H = 150;
        const cx = W / 2;
        const cy = H - 12;
        const rOuter = 100;
        const rInner = 76;

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-stat-gauge")
            .attr("viewBox", `0 0 ${W} ${H}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img");

        const baseArc = d3Arc()
            .innerRadius(rInner)
            .outerRadius(rOuter)
            .startAngle(-HALF)
            .endAngle(HALF);

        const filledFraction = Math.max(0, Math.min(1, value / 100));
        const filledArc = d3Arc()
            .innerRadius(rInner)
            .outerRadius(rOuter)
            .startAngle(-HALF)
            .endAngle(-HALF + TAU * 0.5 * filledFraction);

        svg.append("path")
            .attr("transform", `translate(${cx}, ${cy})`)
            .attr("d", baseArc())
            .style("fill", "var(--border-soft)");

        svg.append("path")
            .attr("transform", `translate(${cx}, ${cy})`)
            .attr("d", filledArc())
            .style("fill", this._accent);

        // Headline percentage inside the arc. The value sits at
        // 30 % of the inner radius above the baseline, the small
        // label tag at 10 % — derived from `rInner` so the offsets
        // track viewBox / radius changes instead of hand-tuned
        // pixel deltas.
        const valueOffset = Math.round(rInner * 0.30);
        const labelOffset = Math.round(rInner * 0.10);

        svg.append("text")
            .attr("x", cx)
            .attr("y", cy - valueOffset)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("class", "wt-stat-gauge-val")
            .style("fill", "var(--ink)")
            .style("font-family", "var(--serif)")
            .style("font-size", "34px")
            .text(`${formatValue(value)}%`);

        if (this._label !== "") {
            svg.append("text")
                .attr("x", cx)
                .attr("y", cy - labelOffset)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("class", "wt-stat-gauge-label")
                .style("fill", "var(--ink-2)")
                .style("font-family", "var(--sans)")
                .style("font-size", "10px")
                .style("letter-spacing", "0.14em")
                .style("text-transform", "uppercase")
                .text(this._label);
        }

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
