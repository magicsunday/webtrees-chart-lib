/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { select } from "d3-selection";
import { arc as d3Arc } from "d3-shape";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { sanitizeLabelValueRows } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

const DEGREES_PER_SLICE = 360 / 12;
const QUADRANT_ANGLES = [0, 90, 180, 270];

/**
 * 12-slice radial clock chart. Each wedge represents one slot (typically a
 * month or a zodiac sign); the wedge's outward extension encodes its value. A
 * base inner + outer ring plus four quadrant gridlines frame the chart, and the
 * peak slot's label sits in the centre.
 *
 * The widget renders pure SVG via d3 — no JS animation, no tooltip lifecycle.
 * Hover surfaces the raw count via a native `<title>` element on each wedge.
 *
 * Empty / null / undefined data renders the shared empty-state placeholder.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class MonthRadial extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     size?: number,
     *     accent?: string,
     *     centerLabel?: string,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._size =
            Number.isFinite(this.options.size) && this.options.size > 0 ? this.options.size : 260;
        this._accent =
            typeof this.options.accent === "string" && this.options.accent !== ""
                ? this.options.accent
                : "currentColor";
        this._centerLabel =
            typeof this.options.centerLabel === "string" && this.options.centerLabel !== ""
                ? this.options.centerLabel
                : "Peak";
    }

    /**
     * @param {Array<{label: string, value: number}>|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const safe = sanitizeLabelValueRows(data);

        if (safe.length === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const pad = 56;
        const vb = this._size + pad * 2;
        const cx = this._size / 2 + pad;
        const cy = this._size / 2 + pad;
        const labelPad = 18;
        const rOuter = this._size / 2 - labelPad;
        const rInner = 48;

        const max = safe.reduce((m, d) => (d.value > m ? d.value : m), 0);
        const peak = safe.reduce((p, d) => (d.value > p.value ? d : p), safe[0]);

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-stat-radial-svg")
            .attr("viewBox", `0 0 ${vb} ${vb}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img");

        // Base rings
        for (const r of [rOuter, rInner]) {
            svg.append("circle")
                .attr("cx", cx)
                .attr("cy", cy)
                .attr("r", r)
                .attr("fill", "none")
                .style("stroke", "var(--border-soft)")
                .attr("stroke-width", 1);
        }

        // Quadrant gridlines (season markers)
        for (const a of QUADRANT_ANGLES) {
            const p1 = polar(cx, cy, a, rInner);
            const p2 = polar(cx, cy, a, rOuter);
            svg.append("line")
                .attr("x1", p1.x)
                .attr("y1", p1.y)
                .attr("x2", p2.x)
                .attr("y2", p2.y)
                .style("stroke", "var(--border-soft)");
        }

        // Slice wedges
        const sliceArc = d3Arc().innerRadius(rInner);
        const accent = this._accent;
        const tooltip = createChartTooltip();

        svg.selectAll("path.wt-stat-radial-slice")
            .data(safe.slice(0, 12))
            .enter()
            .append("path")
            .attr("class", "wt-stat-radial-slice")
            .attr("transform", `translate(${cx}, ${cy})`)
            .attr("d", (d, i) => {
                const a0 = i * DEGREES_PER_SLICE * (Math.PI / 180);
                const a1 = (i + 1) * DEGREES_PER_SLICE * (Math.PI / 180);
                const ext = rInner + (max ? (d.value / max) * (rOuter - rInner - 4) : 0);
                return sliceArc({
                    startAngle: a0,
                    endAngle: a1,
                    outerRadius: ext,
                    innerRadius: rInner,
                });
            })
            .style("fill", accent)
            .style("opacity", 0.85)
            .style("cursor", "default")
            .on("mouseover", (event, d) => {
                tooltip.show(
                    event,
                    `<strong>${escapeHtml(d.label)}</strong><br>` +
                        `<span class="wt-chart-tooltip__stat">${escapeHtml(d.value.toLocaleString())}</span>`,
                );
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseout", () => tooltip.hide());

        // Month / sign labels around the perimeter
        safe.slice(0, 12).forEach((d, i) => {
            const angle = i * DEGREES_PER_SLICE + DEGREES_PER_SLICE / 2;
            const { x, y } = polar(cx, cy, angle, rOuter + labelPad);
            const cosA = Math.cos(((angle - 90) * Math.PI) / 180);
            const anchor = cosA > 0.3 ? "start" : cosA < -0.3 ? "end" : "middle";

            svg.append("text")
                .attr("x", x)
                .attr("y", y)
                .attr("text-anchor", anchor)
                .attr("dominant-baseline", "middle")
                .attr("class", "wt-stat-radial-lab")
                .style("fill", "var(--ink-2)")
                .text(d.label);
        });

        // Centre caption — two stacked lines vertically centred on (cx, cy).
        // Setting dominant-baseline=middle pins each line by its centre, then
        // the line-half offsets (±10) split the block evenly around the
        // donut's geometric centre.
        svg.append("text")
            .attr("x", cx)
            .attr("y", cy - 10)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("class", "wt-stat-radial-center")
            .style("fill", "var(--ink)")
            .text(peak.label);

        svg.append("text")
            .attr("x", cx)
            .attr("y", cy + 10)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("class", "wt-stat-radial-sub")
            .style("fill", "var(--ink-2)")
            .text(this._centerLabel);

        return svg.node();
    }

    /** @private */
    _clearChart() {
        select(this.target).selectAll("svg.wt-stat-radial-svg").remove();
    }

    /** @private */
    _emptyMessage() {
        return typeof this.options.emptyMessage === "string" && this.options.emptyMessage !== ""
            ? this.options.emptyMessage
            : "";
    }
}

/**
 * Project a polar coordinate (angle in degrees, radius) onto Cartesian (x, y)
 * centred at (cx, cy). Angles use clock convention: 0° = top, increasing
 * clockwise.
 *
 * @param {number} cx
 * @param {number} cy
 * @param {number} angleDeg
 * @param {number} r
 * @returns {{x: number, y: number}}
 */
function polar(cx, cy, angleDeg, r) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r };
}
