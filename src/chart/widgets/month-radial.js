/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { path as d3Path } from "d3-path";
import { select } from "d3-selection";
import { arc as d3Arc } from "d3-shape";

import { truncateToFit } from "../../text/truncate-name.js";
import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { pickPositive, sanitizeLabelValueRows } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

const DEGREES_PER_SLICE = 360 / 12;
const QUADRANT_ANGLES = [0, 90, 180, 270];

// Monotonic counter giving each rendered chart's curved-label arc paths a unique
// id, so two month-radial charts on the same page never share a `<defs>` path id.
let arcLabelSeq = 0;

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
 * `text.msc-month-radial-sub` (the `centerLabel`). Each caption line is
 * truncated to the inner ring and carries a `<title>` with the full text when
 * it is clipped.
 *
 * Perimeter labels are always written curved along each slice's arc (fan-chart
 * style): the svg holds a `<defs>` of zero-width arc paths, and the
 * `g.msc-month-radial-perimeter` group holds one `text.msc-month-radial-lab` per
 * wedge, each wrapping a `<textPath>` bent along its slice's arc in a thin band
 * just outside the ring. Lower-half arcs are drawn in reverse so the text stays
 * upright; an over-long line is truncated to the arc length and keeps its full
 * text in a `<title>`.
 *
 * A row may carry two optional non-empty strings: `sub` adds a second curved
 * line `text.msc-month-radial-sublab` (e.g. a date range) on a concentric arc,
 * with the name taking the line that reads "above" it on each half; and
 * `tooltipValue` replaces the bare value in the hover tooltip with a localised
 * string (e.g. "81 persons"). The `sub`, when present, is also appended to the
 * tooltip.
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
     *     width?: number,
     *     height?: number,
     *     margin?: {top?: number, right?: number, bottom?: number, left?: number},
     *     accent?: string,
     *     centerLabel?: string,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options, { emptyMessage: "" });
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.size = this.options.size;
        this.accent = this.options.accent;
        this.centerLabel = this.options.centerLabel;
    }

    /**
     * The default square box diameter (the ring zone plus its label reserve)
     * used when neither an explicit `width`/`height` override nor a responsive
     * host size applies. A non-finite or non-positive value falls back to 260.
     * For per-side positioning use `width`/`height` + `margin` instead.
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
     * @param {Array<{label: string, value: number, sub?: string, tooltipValue?: string}>|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const safe = sanitizeLabelValueRows(data);

        if (safe.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        // The svg fills a width × height box. `size` sets the default SQUARE box
        // (its historical ring-zone-plus-label-reserve diameter) when neither an
        // explicit width/height override nor a responsive host size applies, and
        // height falls back to the resolved width so an unconstrained chart stays
        // square. `pad` is the internal label reserve kept clear around the plot
        // so the perimeter captions never clip; the shared per-side `margin` then
        // insets the box and positions the plot within it — a symmetric margin
        // (the default) keeps it centred, an asymmetric margin shifts it. The
        // labels are written curved along the ring (see below), so the reserve
        // only needs to clear the label band — one line, or two when any wedge
        // carries a `sub` — which keeps the plot large.
        const hasSub = safe.slice(0, 12).some((d) => typeof d.sub === "string" && d.sub !== "");
        const pad = hasSub ? 34 : 24;
        const width = pickPositive(this._width, this.target.clientWidth) || this._size + pad * 2;
        const height = pickPositive(this._height, this.target.clientHeight) || width;
        const margin = this._margin;
        const availW = Math.max(0, width - margin.left - margin.right);
        const availH = Math.max(0, height - margin.top - margin.bottom);
        const cx = margin.left + availW / 2;
        const cy = margin.top + availH / 2;
        const rOuter = Math.max(0, Math.min(availW, availH) / 2 - pad);
        // The centre hole. Capped at 54 but never allowed within 20px of the
        // outer ring, so a small responsive box can't push the inner radius past
        // the outer one (which would nest the rings backwards and invert the
        // value-encoded slice extent).
        const rInner = Math.min(54, Math.max(0, rOuter - 20));

        // Only the first twelve rows occupy slots; the scale and the
        // peak caption are measured over exactly what is drawn.
        const shown = safe.slice(0, 12);
        const max = shown.reduce((m, d) => (d.value > m ? d.value : m), 0);
        const peak = shown.reduce((p, d) => (d.value > p.value ? d : p), shown[0]);

        const svg = select(this.target)
            .append("svg")
            .attr("class", "msc-month-radial")
            .attr("viewBox", `0 0 ${width} ${height}`)
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
                const sub =
                    typeof d.sub === "string" && d.sub !== ""
                        ? `<span class="msc-chart-tooltip__sub">${escapeHtml(d.sub)}</span><br>`
                        : "";
                // The consumer may supply a localised, pluralised value string
                // (e.g. "81 persons"); fall back to the bare formatted number.
                const stat =
                    typeof d.tooltipValue === "string" && d.tooltipValue !== ""
                        ? d.tooltipValue
                        : d.value.toLocaleString();
                tooltip.show(
                    event,
                    `<strong>${escapeHtml(d.label)}</strong><br>` +
                        sub +
                        `<span class="msc-chart-tooltip__stat">${escapeHtml(stat)}</span>`,
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

        // Labels are written curved ALONG each slice's arc (fan-chart style),
        // not horizontally beside it: a zero-width arc path per line in <defs>,
        // each carrying a <textPath>, in a thin band just outside the outer ring.
        // Keeping the text on the ring rather than out on a spoke lets the plot
        // fill the box. Arcs whose mid-angle is on the lower half are drawn
        // end→start so the text reads upright instead of upside down. A wedge
        // with a `sub` gets a second (e.g. date-range) line; the name then takes
        // the arc that reads "above" the sub on each half (outer radius up top,
        // inner radius at the bottom). An over-long line is truncated to the arc
        // length and keeps its full text in a `<title>`.
        const defs = svg.append("defs");
        const arcSeq = arcLabelSeq++;
        const ringGap = 7;
        const lineSpacing = 13;
        const innerLineR = rOuter + ringGap;
        const outerLineR = rOuter + ringGap + lineSpacing;
        const radPerSlice = (DEGREES_PER_SLICE * Math.PI) / 180;
        // Trim a little off each end so a label never touches its slice edges.
        const arcGap = radPerSlice * 0.08;
        // Slice angles run 0 = top; d3-path arcs run 0 = +x axis, a −90° shift.
        const HALF_PI = Math.PI / 2;

        shown.forEach((d, i) => {
            const a0 = i * radPerSlice;
            const a1 = (i + 1) * radPerSlice;
            const mid = (a0 + a1) / 2;
            // Upside down on the lower half (mid between 3 and 9 o'clock).
            const flip = mid > Math.PI / 2 && mid < (3 * Math.PI) / 2;
            const sub = typeof d.sub === "string" ? d.sub : "";

            const line = (radius, text, className, key) => {
                const id = `msc-month-radial-arc-${arcSeq}-${i}-${key}`;
                // A single clean arc at `radius` for the text to follow, built
                // through the d3-path context (like gauge-arc / bar-chart) rather
                // than a hand-assembled `d` string. `path.arc` measures angles
                // from the +x axis, so the slice angles (0 = top) shift by −90°.
                // A lower-half label is drawn anticlockwise (end→start) so its
                // text reads upright instead of upside down; either way the arc is
                // a single sweep, so startOffset 50% + text-anchor middle centre
                // the label on the slice.
                const sA = a0 + arcGap - HALF_PI;
                const eA = a1 - arcGap - HALF_PI;
                const ctx = d3Path();
                if (flip) {
                    ctx.arc(cx, cy, radius, eA, sA, true);
                } else {
                    ctx.arc(cx, cy, radius, sA, eA, false);
                }
                defs.append("path").attr("id", id).attr("d", ctx.toString());

                const textElement = perimeter
                    .append("text")
                    .attr("class", className)
                    .attr("dominant-baseline", "central");
                const textPath = textElement
                    .append("textPath")
                    .attr("href", `#${id}`)
                    .attr("startOffset", "50%")
                    .attr("text-anchor", "middle")
                    .text(text);

                // Available arc length for the trimmed span at this radius. When a
                // clipped label is shortened, the full text goes in a `<title>` on
                // the `<text>` element (not the `<textPath>`), so browsers surface
                // it as the native hover tooltip.
                const avail = Math.max(0, (a1 - a0 - 2 * arcGap) * radius);
                if (truncateToFit(textPath, avail) !== text) {
                    textElement.append("title").text(text);
                }
            };

            if (sub === "") {
                // One line, centred between the two-line radii.
                line(rOuter + ringGap + lineSpacing / 2, d.label, "msc-month-radial-lab", "n");
            } else {
                line(flip ? innerLineR : outerLineR, d.label, "msc-month-radial-lab", "n");
                line(flip ? outerLineR : innerLineR, sub, "msc-month-radial-sublab", "s");
            }
        });

        // Centre caption — two stacked lines vertically centred on (cx, cy).
        // Setting dominant-baseline=middle pins each line by its centre, then
        // the line-half offsets (±10) split the block evenly around the
        // donut's geometric centre. Each line is truncated to the inner ring so
        // an overlong caption (a long peak label or a verbose `centerLabel`
        // translation) never spills past the donut hole; when it is clipped, a
        // `<title>` child keeps the full text reachable on hover / for a11y.
        // The two caption lines sit one line-height (`lineOffsetY`) above and
        // below the centre.
        const lineOffsetY = 10;
        // Hold the caption width a touch under the inner diameter so a clipped
        // line clears the ring instead of grazing the slices.
        const centreMaxWidth = Math.max(0, rInner * 2 - 10);

        const centreLine = (full, dy, className, fill) => {
            const text = labels
                .append("text")
                .attr("x", cx)
                .attr("y", cy + dy)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("class", className)
                .style("fill", fill)
                .text(full);

            if (truncateToFit(text, centreMaxWidth) !== full) {
                text.append("title").text(full);
            }
        };

        centreLine(peak.label, -lineOffsetY, "msc-month-radial-center", "var(--ink)");
        centreLine(this._centerLabel, lineOffsetY, "msc-month-radial-sub", "var(--ink-2)");

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
