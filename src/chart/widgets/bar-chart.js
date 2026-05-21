/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { brushX } from "d3-brush";
import { easeCubicOut } from "d3-ease";
import { scaleBand, scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 240,
    margin: { top: 12, right: 24, bottom: 32, left: 40 },
    orientation: "vertical",
    brush: false,
    barPadding: 0.2,
};

const ORIENTATIONS = new Set(["vertical", "horizontal"]);

/**
 * Bar / histogram widget for categorical `{label, value}` rows.
 * Renders either vertical or horizontal bars; an optional d3-brush
 * lets the consumer drag-select a sub-range and react via the
 * `selectionChanged` CustomEvent on the host target.
 *
 * The widget is deliberately presentation-only: payload arrives
 * pre-aggregated from the consumer (PHP / Stats repo / chart-lib
 * caller) and the bars render in the order they arrive. Bars carry
 * an optional per-row `class` (for CSS palette hooks) and a
 * `tooltip` body that, when set, takes precedence over the default
 * `value.toLocaleString()` rendering — same conventions as
 * {@see LineChart}.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class BarChart extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     orientation?: "vertical" | "horizontal",
     *     brush?: boolean,
     *     barPadding?: number,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._height = pickPositive(this.options.height, DEFAULT_OPTIONS.height);
        this._margin = { ...DEFAULT_OPTIONS.margin, ...(this.options.margin ?? {}) };
        this._orientation = ORIENTATIONS.has(this.options.orientation)
            ? this.options.orientation
            : DEFAULT_OPTIONS.orientation;
        this._brushEnabled =
            typeof this.options.brush === "boolean" ? this.options.brush : DEFAULT_OPTIONS.brush;
        this._barPadding = pickFraction(this.options.barPadding, DEFAULT_OPTIONS.barPadding);
    }

    /**
     * @param {Array<{label: string, value: number, class?: string, tooltip?: string, tooltipLabel?: string}>|null|undefined} data
     *   Categorical rows in display order. `class` is applied as
     *   the `class` attribute on the `<rect>` element so consumer
     *   CSS can colour individual bars. `tooltip` overrides the
     *   default value rendering inside the chart-lib tooltip.
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        if (!Array.isArray(data) || data.length === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const rows = data
            .filter((row) => row !== null && typeof row === "object")
            .map((row) => ({
                label: String(row.label ?? ""),
                value: Number(row.value ?? 0),
                class: typeof row.class === "string" ? row.class : "",
                tooltip: typeof row.tooltip === "string" ? row.tooltip : "",
                tooltipLabel: typeof row.tooltipLabel === "string" ? row.tooltipLabel : "",
            }))
            .filter((row) => row.label !== "" && Number.isFinite(row.value) && row.value >= 0);

        if (rows.length === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const margin = this._margin;
        const height = this._height;
        const width = Math.max(
            240,
            pickPositive(this.options.width, this.target.clientWidth) || 600,
        );
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        const isVertical = this._orientation === "vertical";

        const categorical = scaleBand()
            .domain(rows.map((row) => row.label))
            .range(isVertical ? [0, innerWidth] : [0, innerHeight])
            .padding(this._barPadding);

        const valueMax = max(rows, (row) => row.value) ?? 1;
        const linear = scaleLinear()
            .domain([0, valueMax])
            .nice()
            .range(isVertical ? [innerHeight, 0] : [0, innerWidth]);

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-bar-chart")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Bar chart");

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        // Category axis (X for vertical, Y for horizontal).
        const categoryAxis = isVertical ? axisBottom(categorical) : axisLeft(categorical);

        inner
            .append("g")
            .attr("class", isVertical ? "x-axis" : "y-axis")
            .attr("transform", isVertical ? `translate(0, ${innerHeight})` : "translate(0, 0)")
            .call(categoryAxis);

        // Value axis: integer-friendly ticks.
        const valueAxis = (isVertical ? axisLeft(linear) : axisBottom(linear))
            .ticks(5)
            .tickFormat((value) => Number(value).toLocaleString());

        inner
            .append("g")
            .attr("class", isVertical ? "y-axis" : "x-axis")
            .attr("transform", isVertical ? "translate(0, 0)" : `translate(0, ${innerHeight})`)
            .call(valueAxis);

        const bars = inner
            .append("g")
            .attr("class", "bars")
            .selectAll("rect.bar")
            .data(rows)
            .enter()
            .append("rect")
            .attr("class", (row) => (row.class === "" ? "bar" : `bar ${row.class}`))
            .attr("tabindex", "0")
            .attr("aria-label", (row) => `${row.label}: ${row.value.toLocaleString()}`);

        if (isVertical) {
            bars.attr("x", (row) => categorical(row.label) ?? 0)
                .attr("width", categorical.bandwidth())
                .attr("y", innerHeight)
                .attr("height", 0)
                .transition("bar-enter")
                .duration(500)
                .ease(easeCubicOut)
                .attr("y", (row) => linear(row.value))
                .attr("height", (row) => innerHeight - linear(row.value));
        } else {
            bars.attr("y", (row) => categorical(row.label) ?? 0)
                .attr("height", categorical.bandwidth())
                .attr("x", 0)
                .attr("width", 0)
                .transition("bar-enter")
                .duration(500)
                .ease(easeCubicOut)
                .attr("width", (row) => linear(row.value));
        }

        bars.on("mouseover", (event, row) => {
            const header = row.tooltipLabel === "" ? row.label : row.tooltipLabel;
            const body =
                row.tooltip === ""
                    ? escapeHtml(row.value.toLocaleString())
                    : escapeHtml(row.tooltip);
            tooltip.show(
                event,
                `<strong>${escapeHtml(header)}</strong><br>` +
                    `<span class="wt-chart-tooltip__stat">${body}</span>`,
            );
        })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        // Click → toggle selection on the row label. Mirrors the
        // DonutChart contract so the dashboard-bus consumer can
        // bind one onSelectionChanged callback against both.
        const self = this;
        bars.style("cursor", "pointer").on("click", function onClick(_event, row) {
            const { predicate } = self._emitSelection({ label: row.label });
            self._applyBarSelectionStyles(bars, predicate);
        });

        if (this._brushEnabled) {
            this._attachBrush(inner, categorical, rows, isVertical, innerWidth, innerHeight);
        }

        return svg.node();
    }

    /**
     * Toggle the `.is-selected` class on whichever bar matches the
     * current predicate; cleared selection removes the class from
     * every bar. Visual dim of the non-selected bars is a host-
     * stylesheet concern via `:has(.is-selected) :not(.is-selected)`,
     * mirroring the existing hover-dim CSS.
     *
     * @param {import("d3-selection").Selection<SVGRectElement, {label: string}, SVGGElement, unknown>} bars
     * @param {object|null} predicate
     */
    _applyBarSelectionStyles(bars, predicate) {
        if (predicate === null) {
            bars.classed("is-selected", false);
            return;
        }
        bars.classed("is-selected", (row) => row.label === predicate.label);
    }

    /**
     * Attach a d3-brush along the categorical axis. The brush
     * emits a `selectionChanged` CustomEvent on the host element
     * with `detail = { labels: string[] }` so the consumer can
     * cross-filter without depending on d3 internals.
     *
     * @param {import("d3-selection").Selection<SVGGElement, unknown, null, undefined>} inner
     * @param {import("d3-scale").ScaleBand<string>} categorical
     * @param {Array<{label: string}>} rows
     * @param {boolean} isVertical
     * @param {number} innerWidth
     * @param {number} innerHeight
     */
    _attachBrush(inner, categorical, rows, isVertical, innerWidth, innerHeight) {
        const brushAxisLength = isVertical ? innerWidth : innerHeight;
        const target = this.target;

        const brush = brushX().extent([
            [0, 0],
            isVertical ? [innerWidth, innerHeight] : [innerHeight, innerWidth],
        ]);

        brush.on("end", (event) => {
            if (event.selection === null) {
                target.dispatchEvent(
                    new CustomEvent("selectionChanged", {
                        detail: { labels: [] },
                    }),
                );
                return;
            }

            const [lo, hi] = event.selection;
            const selectedLabels = rows
                .map((row) => row.label)
                .filter((label) => {
                    const start = categorical(label);
                    if (typeof start !== "number") {
                        return false;
                    }
                    const end = start + categorical.bandwidth();
                    return end > lo && start < hi;
                });

            target.dispatchEvent(
                new CustomEvent("selectionChanged", {
                    detail: { labels: selectedLabels },
                }),
            );
        });

        const brushLayer = inner.append("g").attr("class", "bar-brush");

        if (!isVertical) {
            // For horizontal bars the brush runs along the value
            // axis (visually horizontal), so the categorical-axis
            // length is `innerHeight`; rotate the brush group to
            // align with the categorical axis.
            brushLayer.attr("transform", `rotate(90) translate(0, -${brushAxisLength})`);
        }

        brushLayer.call(brush);
    }

    /**
     * Remove any svg + placeholder this widget rendered earlier so
     * redraw() never stacks.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-bar-chart, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
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
 * @param {unknown} value
 * @param {number}  fallback
 *
 * @returns {number}
 */
function pickPositive(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Clamp a fraction option into `[0, 0.95]`. Padding values outside
 * that range either dissolve the bars (0.95+ leaves nothing visible)
 * or clip them. Falls back to `defaultValue` for non-numeric input.
 *
 * @param {unknown} value
 * @param {number}  defaultValue
 *
 * @returns {number}
 */
function pickFraction(value, defaultValue) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return defaultValue;
    }
    if (value < 0) {
        return 0;
    }
    if (value > 0.95) {
        return 0.95;
    }
    return value;
}
