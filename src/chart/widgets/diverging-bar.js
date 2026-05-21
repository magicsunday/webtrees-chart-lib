/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { max as d3Max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { easeCubicOut } from "d3-ease";
import { scaleBand, scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 240,
    margin: { top: 12, right: 24, bottom: 32, left: 80 },
    barPadding: 0.2,
};

/**
 * Horizontal diverging bar chart for symmetric distributions
 * around a central zero. Each row carries an explicit `sign`
 * (`-1` or `+1`) that drives layout — the value itself stays
 * positive, the caller controls which side the bar grows toward.
 *
 * Typical consumer is the couple age-gap histogram in the
 * statistics module: bands `-30..-25`, `-25..-20`, …, `0`, …,
 * `+25..+30` where the value is always a positive count and the
 * sign tells the widget whether the band sits left of zero
 * (husband-younger) or right (husband-older).
 *
 * Bars carry the per-row `sign` as a CSS class hook
 * (`positive` / `negative`) so the consumer can theme the two
 * sides via the `--chart-diverging-positive` /
 * `--chart-diverging-negative` design tokens without rebuilding
 * the data.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class DivergingBar extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     barPadding?: number,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._height = pickPositive(this.options.height, DEFAULT_OPTIONS.height);
        this._margin = { ...DEFAULT_OPTIONS.margin, ...(this.options.margin ?? {}) };
        this._barPadding = pickFraction(this.options.barPadding, DEFAULT_OPTIONS.barPadding);
    }

    /**
     * @param {Array<{label: string, value: number, sign: -1|1, tooltip?: string, tooltipLabel?: string}>|null|undefined} data
     *   Categorical rows in display order. `value` must be
     *   non-negative; the caller's `sign` (-1 or +1) controls
     *   which side of the zero baseline the bar grows toward.
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
                sign: row.sign === -1 ? -1 : 1,
                tooltip: typeof row.tooltip === "string" ? row.tooltip : "",
                tooltipLabel: typeof row.tooltipLabel === "string" ? row.tooltipLabel : "",
            }))
            .filter((row) => row.label !== "" && Number.isFinite(row.value) && row.value >= 0);

        if (rows.length === 0 || rows.every((row) => row.value === 0)) {
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

        const categorical = scaleBand()
            .domain(rows.map((row) => row.label))
            .range([0, innerHeight])
            .padding(this._barPadding);

        const valueMax = d3Max(rows, (row) => row.value) ?? 1;
        const linear = scaleLinear().domain([-valueMax, valueMax]).nice().range([0, innerWidth]);

        const zero = linear(0);
        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-diverging-bar")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Diverging bar chart");

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        // Category axis on the left.
        inner.append("g").attr("class", "y-axis").call(axisLeft(categorical));

        // Value axis along the bottom, symmetric around zero.
        inner
            .append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(
                axisBottom(linear)
                    .ticks(7)
                    .tickFormat((value) => Math.abs(Number(value)).toLocaleString()),
            );

        // Zero baseline emphasised for the visual centre.
        inner
            .append("line")
            .attr("class", "zero-axis")
            .attr("x1", zero)
            .attr("x2", zero)
            .attr("y1", 0)
            .attr("y2", innerHeight);

        const bars = inner
            .append("g")
            .attr("class", "bars")
            .selectAll("rect.bar")
            .data(rows)
            .enter()
            .append("rect")
            .attr("class", (row) => `bar ${row.sign === 1 ? "positive" : "negative"}`)
            .attr("tabindex", "0")
            .attr(
                "aria-label",
                (row) => `${row.label}: ${row.sign === -1 ? "-" : ""}${row.value.toLocaleString()}`,
            );

        bars.attr("y", (row) => categorical(row.label) ?? 0)
            .attr("height", categorical.bandwidth())
            .attr("x", zero)
            .attr("width", 0)
            .transition("bar-enter")
            .duration(500)
            .ease(easeCubicOut)
            .attr("x", (row) => (row.sign === 1 ? zero : linear(-row.value)))
            .attr("width", (row) => Math.abs(linear(row.sign * row.value) - zero));

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

        return svg.node();
    }

    /**
     * Remove any svg + placeholder this widget rendered earlier so
     * redraw() never stacks.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-diverging-bar, :scope > .chart-empty-state",
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
