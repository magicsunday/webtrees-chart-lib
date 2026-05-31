/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { interpolate } from "d3-interpolate";
import { select } from "d3-selection";
import { arc as d3Arc, pie as d3Pie } from "d3-shape";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { pickPositive } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

/**
 * D3-powered donut chart with one <path> per data row, caller-controlled CSS
 * classes, and native <title> tooltips. Sizes to the smaller of width/height so
 * the donut stays square inside a rectangular container.
 *
 * Empty/null/undefined data, all-zero values, and rows whose values are
 * non-finite or negative all render the shared empty-state placeholder (after
 * coercion). Redraw replaces both prior svg and prior placeholder so the widget
 * is idempotent in either direction.
 *
 * Fill is applied via `.style` rather than `.attr` so the data-supplied value
 * overrides any CSS rule for the slice class.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class DonutChart extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     holeSize?: number,
     *     margin?: number,
     *     width?: number,
     *     height?: number,
     *     centerLabel?: string,
     *     centerValue?: string,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        const { width, height } = this.dimensions({ width: 250, height: 250 });
        this._side = Math.min(width, height);
        this._margin = pickPositive(this.options.margin, 1);
        this._radius = Math.max(0, (this._side >> 1) - this._margin);
        this._holeSize = pickHoleSize(this.options.holeSize, this._radius);
        this._centerLabel =
            typeof this.options.centerLabel === "string" ? this.options.centerLabel : "";
        this._centerValue =
            typeof this.options.centerValue === "string" ? this.options.centerValue : "";
    }

    /**
     * @param {Array<{label: string, value: number, class?: string, fill?: string}>|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const safeRows = sanitizeRows(data);
        const total = safeRows.reduce((acc, row) => acc + row.value, 0);

        if (safeRows.length === 0 || total <= 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        /** @typedef {{label: string, value: number, class?: string, fill?: string}} DonutRow */
        /** @typedef {import("d3-shape").PieArcDatum<DonutRow>} DonutSlice */
        /** @typedef {SVGPathElement & { _current: DonutSlice }} DonutSliceNode */
        const arc = /** @type {import("d3-shape").Arc<unknown, DonutSlice>} */ (
            /** @type {unknown} */ (d3Arc().innerRadius(this._holeSize).outerRadius(this._radius))
        );

        const pie = /** @type {import("d3-shape").Pie<unknown, DonutRow>} */ (
            /** @type {unknown} */ (d3Pie())
        )
            .padAngle(1 / Math.max(this._radius, 1))
            .sort(null)
            .value((row) => row.value);

        const svg = select(this.target)
            .append("svg")
            .attr("class", "donut-chart")
            .attr("width", this._side)
            .attr("height", this._side)
            .attr("viewBox", `${-this._side / 2} ${-this._side / 2} ${this._side} ${this._side}`)
            .attr("style", "max-width: 100%; height: auto;");

        const slices = svg
            .append("g")
            .selectAll("path")
            .data(pie(safeRows))
            .join("path")
            .attr("class", (d) => (d.data.class ? `slice ${d.data.class}` : "slice"));

        slices.each(function (d) {
            if (d.data.fill !== undefined && d.data.fill !== null) {
                /** @type {SVGPathElement} */ (this).style.fill = d.data.fill;
            }
        });

        // Grow each slice from zero sweep to its final angle. Initialise
        // `_current` to the slice's full datum with the end angle collapsed onto
        // the start angle, so the interpolator has a stable zero-sweep origin,
        // and set the initial keyframe to that same zero-sweep (invisible) arc.
        // _runEntry then tweens inline, holds for reveal-on-scroll, or jumps to
        // the final arc under reduced motion.
        slices
            .each(function setInitialAngle(d) {
                /** @type {DonutSliceNode} */ (this)._current = { ...d, endAngle: d.startAngle };
            })
            .attr("d", (d) => arc({ ...d, endAngle: d.startAngle }));

        this._runEntry((animate) => {
            this._enterTween(
                slices,
                animate,
                "donut-enter",
                600,
                (sel) =>
                    sel
                        .attr("d", (d) => arc(d))
                        .each(function setFinalAngle(d) {
                            /** @type {DonutSliceNode} */ (this)._current = d;
                        }),
                (transition) =>
                    transition.attrTween("d", function tweenSlice(d) {
                        const interp = interpolate(
                            /** @type {DonutSliceNode} */ (this)._current,
                            d,
                        );
                        /** @type {DonutSliceNode} */ (this)._current = d;
                        return (t) => arc(interp(t));
                    }),
            );
        });

        const tooltip = createChartTooltip();
        const tooltipHtml = (row) => {
            const value = row.value || 0;
            const share = total > 0 ? (value / total) * 100 : 0;
            const shareLabel = share.toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
            });
            const header =
                typeof row.tooltipLabel === "string" && row.tooltipLabel !== ""
                    ? row.tooltipLabel
                    : row.label;
            const body =
                typeof row.tooltipBody === "string" && row.tooltipBody !== ""
                    ? row.tooltipBody
                    : value.toLocaleString();
            const bodyWithShare = total > 0 ? `${body} · ${shareLabel}%` : body;
            return (
                `<strong>${escapeHtml(header)}</strong><br>` +
                `<span class="wt-chart-tooltip__stat">${escapeHtml(bodyWithShare)}</span>`
            );
        };

        slices
            .on("mouseover", (event, d) => tooltip.show(event, tooltipHtml(d.data)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        // Click → toggle selection. The predicate carries the
        // slice label so the dashboard-bus consumer can derive
        // whatever filter shape it needs. The d3-selection is
        // cached so `setSelection` (called by the bus when a
        // sibling widget emits) can re-apply highlight styles
        // without rebuilding the chart.
        this._slices = slices;
        const self = this;
        slices
            .attr("tabindex", "0")
            .style("cursor", "pointer")
            .on("click", function onClick(_event, d) {
                const { predicate } = self._emitSelection({ slice: d.data.label });
                self._applySelection(predicate);
            });

        // Centre value + label (optional). Rendered last so they
        // paint above the slices. The value is the larger serif
        // headline, the label a small uppercased caption underneath
        // — mirrors the design2 `.gs-donut-value` / `.gs-donut-
        // label` pair.
        // Typography (font-family / font-size / colour / letter-
        // spacing / casing) lives in the host stylesheet under
        // `.donut-center-value` / `.donut-center-label`. Inline
        // styles would beat the host's CSS specificity, so keep
        // only positional attrs here.
        const fallbackValue = this._centerValue === "" ? total.toLocaleString() : this._centerValue;
        svg.append("text")
            .attr("class", "donut-center-value")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("y", this._centerLabel === "" ? 0 : -8)
            .text(fallbackValue);

        if (this._centerLabel !== "") {
            svg.append("text")
                .attr("class", "donut-center-label")
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("y", 18)
                .text(this._centerLabel);
        }

        return svg.node();
    }

    /**
     * Remove any svg and any placeholder this widget rendered earlier so
     * redraw() never stacks or leaves cross-state remnants.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.donut-chart, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }

    /**
     * Toggle the `.is-selected` class on whichever slice matches the current
     * predicate; cleared selection removes the class from every slice. The
     * widget never sets inline opacity for the selection state — dimming is
     * entirely a host-stylesheet concern, which keeps the click visual
     * consistent with the existing hover-dim CSS pattern (typically a
     * `:has(.is-selected) :not(.is-selected)` rule mirroring the `:hover`
     * selectors).
     *
     * Recognised predicate shape: `{slice: <label>}`. A predicate without
     * `slice` (e.g. one emitted by a sibling widget on a dimension this donut
     * doesn't carry) clears the highlight so the donut never displays a stale
     * selection from an unrelated click.
     *
     * @param {object|null} predicate
     * @returns {void}
     */
    _applySelection(predicate) {
        const slices = this._slices;
        if (slices === undefined || slices === null) {
            return;
        }
        if (predicate === null || typeof predicate !== "object" || !("slice" in predicate)) {
            slices.classed("is-selected", false);
            return;
        }
        slices.classed("is-selected", (d) => d.data.label === predicate.slice);
    }

    /**
     * @returns {string}
     */
    _emptyMessage() {
        return typeof this.options.emptyMessage === "string"
            ? this.options.emptyMessage
            : "No data available";
    }
}

/**
 * Coerce raw data into a clean array of `{label, value, …}` rows. Drops rows
 * that are not plain objects or whose value is non-finite or negative (treated
 * as 0 by callers means "skip").
 *
 * @param {unknown} data
 * @returns {Array<{label: string, value: number, class?: string, fill?: string}>}
 */
function sanitizeRows(data) {
    if (!Array.isArray(data)) {
        return [];
    }
    const out = [];
    for (const row of data) {
        if (row === null || typeof row !== "object") {
            continue;
        }
        const value = Number.isFinite(row.value) && row.value > 0 ? row.value : 0;
        out.push({
            ...row,
            label: typeof row.label === "string" ? row.label : String(row.label ?? ""),
            value,
        });
    }
    return out.filter((row) => row.value > 0);
}

/**
 * Hole size accepts 0 (= pie chart), so the guard differs from pickPositive.
 * Negative / NaN / Infinity / strings fall back to the donut default.
 *
 * @param {unknown} value
 * @param {number}  radius
 * @returns {number}
 */
function pickHoleSize(value, radius) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return value;
    }
    return radius - radius / 10;
}
