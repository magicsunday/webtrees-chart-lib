/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { easeCubicOut } from "d3-ease";
import { interpolate } from "d3-interpolate";
import { select } from "d3-selection";
import { arc as d3Arc, pie as d3Pie } from "d3-shape";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

/**
 * D3-powered donut chart with one <path> per data row, caller-controlled
 * CSS classes, and native <title> tooltips. Sizes to the smaller of
 * width/height so the donut stays square inside a rectangular container.
 *
 * Empty/null/undefined data, all-zero values, and rows whose values are
 * non-finite or negative all render the shared empty-state placeholder
 * (after coercion). Redraw replaces both prior svg and prior placeholder
 * so the widget is idempotent in either direction.
 *
 * Fill is applied via `.style` rather than `.attr` so the data-supplied
 * value overrides any CSS rule for the slice class.
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

        const arc = d3Arc().innerRadius(this._holeSize).outerRadius(this._radius);

        const pie = d3Pie()
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
                this.style.fill = d.data.fill;
            }
        });

        // Grow each slice from zero sweep to its final angle for a
        // quick on-load animation. Initialise `_current` to the
        // start-angle pair so the interpolator has a stable origin.
        slices
            .each(function setInitialAngle(d) {
                this._current = { startAngle: d.startAngle, endAngle: d.startAngle };
            })
            .transition("donut-enter")
            .duration(600)
            .ease(easeCubicOut)
            .attrTween("d", function tweenSlice(d) {
                const interp = interpolate(this._current, d);
                this._current = d;
                return (t) => arc(interp(t));
            });

        const tooltip = createChartTooltip();
        const tooltipHtml = (row) => {
            const value = row.value || 0;
            const share = total > 0 ? Math.round((value / total) * 100) : 0;
            const valueLabel = value.toLocaleString();
            return (
                `<strong>${escapeHtml(row.label)}</strong><br>` +
                `<span class="wt-chart-tooltip__stat">${valueLabel}</span>` +
                (total > 0 ? `<span class="wt-chart-tooltip__meta"> · ${share}%</span>` : "")
            );
        };

        slices
            .on("mouseover", (event, d) => tooltip.show(event, tooltipHtml(d.data)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        // Click → toggle selection. The predicate carries the
        // slice label so the dashboard-bus consumer can derive
        // whatever filter shape it needs.
        const self = this;
        slices
            .attr("tabindex", "0")
            .style("cursor", "pointer")
            .on("click", function onClick(_event, d) {
                const { predicate } = self._emitSelection({ slice: d.data.label });
                self._applySelectionStyles(slices, predicate);
            });

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
     * Toggle the `.is-selected` class on whichever slice matches
     * the current predicate; cleared selection removes the class
     * from every slice. The widget never sets inline opacity for
     * the selection state — dimming is entirely a host-stylesheet
     * concern, which keeps the click visual consistent with the
     * existing hover-dim CSS pattern (typically a `:has(.is-selected)
     * :not(.is-selected)` rule mirroring the `:hover` selectors).
     *
     * @param {import("d3-selection").Selection<SVGPathElement, any, SVGGElement, unknown>} slices
     * @param {object|null} predicate
     */
    _applySelectionStyles(slices, predicate) {
        if (predicate === null) {
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
 * Coerce raw data into a clean array of `{label, value, …}` rows.
 * Drops rows that are not plain objects or whose value is non-finite
 * or negative (treated as 0 by callers means "skip").
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
 * @param {unknown} value
 * @param {number}  fallback
 * @returns {number}
 */
function pickPositive(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
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
