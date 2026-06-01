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
 * 12-slice radial chart. Each wedge represents one of twelve slots and its
 * outward extension encodes the slot's value. A base inner + outer ring plus
 * four quadrant gridlines frame the chart, and the peak slot's label sits in
 * the centre. Only the first twelve rows of the payload are plotted.
 *
 * The widget renders pure SVG via d3 — no entrance animation. Hovering a wedge
 * surfaces its label + value through the shared chart tooltip. The widget emits
 * no selection event.
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget fills the
 * wedges with the `accent` option and strokes the rings/gridlines with the host
 * `var(--border-soft)` token): the root is `svg.msc-month-radial` holding a
 * wrapper `g.msc-month-radial-inner`. Inside it a `g.msc-month-radial-grid` group
 * holds the two `circle` rings and four quadrant `line` gridlines (sharing the
 * inherited `var(--border-soft)` stroke); a `g.msc-month-radial-slices` group
 * carries the shared centre transform and one `path.msc-month-radial-slice` per
 * wedge; and a `g.msc-month-radial-labels` group holds a
 * `g.msc-month-radial-perimeter` sub-group (one `text.msc-month-radial-lab` per
 * wedge, sharing the inherited muted fill) plus the centred two-line caption —
 * `text.msc-month-radial-center` (the peak slot's label) over
 * `text.msc-month-radial-sub` (the `centerLabel`).
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
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.size = this.options.size;
        this.accent = this.options.accent;
        this.centerLabel = this.options.centerLabel;
        this._defaultEmptyMessage = "";
        this.emptyMessage = this.options.emptyMessage;
    }

    /**
     * The outer pixel size of the square chart viewport. A non-finite or
     * non-positive value falls back to 260.
     *
     * @returns {number}
     */
    get size() {
        return this._size;
    }

    /**
     * @param {number|undefined} value The chart size in pixels; a non-finite or
     *   non-positive value resets to 260. The runtime guard keeps the JSON
     *   dispatcher (which assigns untyped values) safe.
     */
    set size(value) {
        this._size = Number.isFinite(value) && value > 0 ? value : 260;
    }

    /**
     * The colour of the filled wedges. A non-string or empty value falls back to
     * `currentColor` so the wedges always paint.
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
     * The sub-caption shown beneath the peak label in the centre. A non-string
     * or empty value falls back to `Peak`.
     *
     * @returns {string}
     */
    get centerLabel() {
        return this._centerLabel;
    }

    /**
     * @param {string|undefined} value The centre sub-caption; a missing or empty
     *   value resets to `Peak`. The runtime guard keeps the JSON dispatcher
     *   (which assigns untyped values) safe.
     */
    set centerLabel(value) {
        this._centerLabel = typeof value === "string" && value !== "" ? value : "Peak";
    }

    /**
     * @param {Array<{label: string, value: number}>|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const safe = sanitizeLabelValueRows(data);

        if (safe.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const pad = 56;
        const vb = this._size + pad * 2;
        const cx = this._size / 2 + pad;
        const cy = this._size / 2 + pad;
        const labelPad = 18;
        const rOuter = this._size / 2 - labelPad;
        const rInner = 48;

        // Only the first twelve rows occupy slots; the scale and the
        // peak caption are measured over exactly what is drawn.
        const shown = safe.slice(0, 12);
        const max = shown.reduce((m, d) => (d.value > m ? d.value : m), 0);
        const peak = shown.reduce((p, d) => (d.value > p.value ? d : p), shown[0]);

        const svg = select(this.target)
            .append("svg")
            .attr("class", "msc-month-radial")
            .attr("viewBox", `0 0 ${vb} ${vb}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img");

        // Outer wrapper grouping the rings/gridlines, slices, and labels into
        // their own nested <g>s rather than appending flat onto the svg root.
        const root = svg.append("g").attr("class", "msc-month-radial-inner");

        // Base rings + quadrant gridlines share the soft border stroke (and the
        // no-fill / unit stroke-width); set them once on the grid group and let
        // the circles and lines inherit, instead of repeating per element.
        const grid = root
            .append("g")
            .attr("class", "msc-month-radial-grid")
            .attr("fill", "none")
            .attr("stroke-width", 1)
            .style("stroke", "var(--border-soft)");

        for (const r of [rOuter, rInner]) {
            grid.append("circle").attr("cx", cx).attr("cy", cy).attr("r", r);
        }

        for (const a of QUADRANT_ANGLES) {
            const p1 = polar(cx, cy, a, rInner);
            const p2 = polar(cx, cy, a, rOuter);
            grid.append("line").attr("x1", p1.x).attr("y1", p1.y).attr("x2", p2.x).attr("y2", p2.y);
        }

        // Slice wedges. They all share the centre translate, so it is hoisted to
        // the slices group and each path carries only its own arc geometry.
        const sliceArc = d3Arc().innerRadius(rInner);
        const accent = this._accent;
        const tooltip = createChartTooltip();

        root.append("g")
            .attr("class", "msc-month-radial-slices")
            .attr("transform", `translate(${cx}, ${cy})`)
            .selectAll("path.msc-month-radial-slice")
            .data(shown)
            .enter()
            .append("path")
            .attr("class", "msc-month-radial-slice")
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
                        `<span class="msc-chart-tooltip__stat">${escapeHtml(d.value.toLocaleString())}</span>`,
                );
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseout", () => tooltip.hide());

        // Labels group: the perimeter wedge captions share the muted ink fill
        // (hoisted to their sub-group); the centre caption and its sub-line keep
        // their own fills.
        const labels = root.append("g").attr("class", "msc-month-radial-labels");

        const perimeter = labels
            .append("g")
            .attr("class", "msc-month-radial-perimeter")
            .style("fill", "var(--ink-2)");

        // Perimeter labels, one per wedge.
        shown.forEach((d, i) => {
            const angle = i * DEGREES_PER_SLICE + DEGREES_PER_SLICE / 2;
            const { x, y } = polar(cx, cy, angle, rOuter + labelPad);
            const cosA = Math.cos(((angle - 90) * Math.PI) / 180);
            const anchor = cosA > 0.3 ? "start" : cosA < -0.3 ? "end" : "middle";

            perimeter
                .append("text")
                .attr("x", x)
                .attr("y", y)
                .attr("text-anchor", anchor)
                .attr("dominant-baseline", "middle")
                .attr("class", "msc-month-radial-lab")
                .text(d.label);
        });

        // Centre caption — two stacked lines vertically centred on (cx, cy).
        // Setting dominant-baseline=middle pins each line by its centre, then
        // the line-half offsets (±10) split the block evenly around the
        // donut's geometric centre.
        labels
            .append("text")
            .attr("x", cx)
            .attr("y", cy - 10)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("class", "msc-month-radial-center")
            .style("fill", "var(--ink)")
            .text(peak.label);

        labels
            .append("text")
            .attr("x", cx)
            .attr("y", cy + 10)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("class", "msc-month-radial-sub")
            .style("fill", "var(--ink-2)")
            .text(this._centerLabel);

        return svg.node();
    }

    /** @private */
    _clearChart() {
        select(this.target).selectAll("svg.msc-month-radial").remove();
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
