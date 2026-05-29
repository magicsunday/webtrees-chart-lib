/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { extent, max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { easeCubicOut } from "d3-ease";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 200,
    margin: { top: 12, right: 24, bottom: 32, left: 40 },
    showLine: true,
};

/**
 * Smooth-area density chart over a continuous `{x, y}` series. Different from
 * {@see LineChart} in two ways: the x-axis is a numeric scale (not
 * categorical), and the focal visual is the filled area under a monotonic curve
 * rather than data points along a line. Designed for distribution shape
 * inspection — sibling age-gap density, marriage-duration density, etc. — where
 * the "shape" matters more than individual buckets.
 *
 * The widget renders both the area fill and (optionally) the line outline on
 * top of it; the consumer styles either via CSS (`.wt-area-density path.area`,
 * `.wt-area-density path.line`). No per-row palette hook is exposed — density
 * charts are single-series by definition, the colour belongs to the host
 * stylesheet, not the data row.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class AreaDensity extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     showLine?: boolean,
     *     xLabel?: string,
     *     yLabel?: string,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._height = pickPositive(this.options.height, DEFAULT_OPTIONS.height);
        this._margin = { ...DEFAULT_OPTIONS.margin, ...(this.options.margin ?? {}) };
        this._showLine =
            typeof this.options.showLine === "boolean"
                ? this.options.showLine
                : DEFAULT_OPTIONS.showLine;
    }

    /**
     * @param {Array<{x: number, y: number, tooltip?: string, tooltipLabel?: string}>|null|undefined} data
     *   Numeric `{x, y}` rows in any order — the widget sorts by
     *   `x` before rendering so caller order does not matter.
     *   Tooltip overrides follow the same convention as the other
     *   widgets in this library.
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
                x: Number(row.x ?? Number.NaN),
                y: Number(row.y ?? 0),
                tooltip: typeof row.tooltip === "string" ? row.tooltip : "",
                tooltipLabel: typeof row.tooltipLabel === "string" ? row.tooltipLabel : "",
            }))
            .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y) && row.y >= 0)
            .sort((a, b) => a.x - b.x);

        if (rows.length < 2 || rows.every((row) => row.y === 0)) {
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

        const xDomain = extent(rows, (row) => row.x);
        const x = scaleLinear().domain(xDomain).range([0, innerWidth]);
        const y = scaleLinear()
            .domain([0, max(rows, (row) => row.y) ?? 1])
            .nice()
            .range([innerHeight, 0]);

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-area-density")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Area density chart");

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        // X-axis: numeric ticks with integer formatting (typical
        // payload is integer age / year). Caller can override via
        // their stylesheet if they want fewer ticks; chart-lib
        // defaults to d3's automatic count.
        const xAxis = axisBottom(x).tickFormat((value) => Number(value).toLocaleString());
        inner
            .append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(xAxis)
            .select(".domain")
            .remove();

        const yAxis = axisLeft(y)
            .ticks(5)
            .tickFormat((value) => Number(value).toLocaleString());
        inner.append("g").attr("class", "y-axis").call(yAxis).select(".domain").remove();

        if (typeof this.options.xLabel === "string" && this.options.xLabel !== "") {
            inner
                .append("text")
                .attr("class", "axis-label x-label")
                .attr("x", innerWidth / 2)
                .attr("y", innerHeight + margin.bottom - 4)
                .attr("text-anchor", "middle")
                .text(this.options.xLabel);
        }

        if (typeof this.options.yLabel === "string" && this.options.yLabel !== "") {
            inner
                .append("text")
                .attr("class", "axis-label y-label")
                .attr(
                    "transform",
                    `rotate(-90) translate(${-innerHeight / 2}, ${-margin.left + 12})`,
                )
                .attr("text-anchor", "middle")
                .text(this.options.yLabel);
        }

        const areaGenerator = d3Area()
            .x((row) => x(row.x))
            .y0(innerHeight)
            .y1((row) => y(row.y))
            .curve(curveMonotoneX);

        const areaPath = inner
            .append("path")
            .datum(rows)
            .attr("class", "area")
            .attr("d", areaGenerator)
            .attr("opacity", 0);

        areaPath.transition("area-enter").duration(500).ease(easeCubicOut).attr("opacity", 1);

        if (this._showLine) {
            const lineGenerator = d3Line()
                .x((row) => x(row.x))
                .y((row) => y(row.y))
                .curve(curveMonotoneX);

            inner
                .append("path")
                .datum(rows)
                .attr("class", "line")
                .attr("fill", "none")
                .attr("d", lineGenerator);
        }

        // Hit-targets for tooltip: invisible circles at each
        // `{x, y}` so hovering anywhere along the curve surfaces
        // the underlying data point. r=4 keeps the target large
        // enough on phone-style touch displays.
        inner
            .append("g")
            .attr("class", "points")
            .selectAll("circle.point")
            .data(rows)
            .enter()
            .append("circle")
            .attr("class", "point")
            .attr("cx", (row) => x(row.x))
            .attr("cy", (row) => y(row.y))
            .attr("r", 4)
            .attr("opacity", 0)
            .attr("tabindex", "0")
            .attr("aria-label", (row) => `${row.x.toLocaleString()}: ${row.y.toLocaleString()}`)
            .on("mouseover", (event, row) => {
                const header = row.tooltipLabel === "" ? row.x.toLocaleString() : row.tooltipLabel;
                const body =
                    row.tooltip === ""
                        ? escapeHtml(row.y.toLocaleString())
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
     * Remove any svg + placeholder this widget rendered earlier so redraw()
     * never stacks.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-area-density, :scope > .chart-empty-state",
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
