/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { extent, max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { easeCubicOut } from "d3-ease";
import { scaleLinear, scalePoint } from "d3-scale";
import { select } from "d3-selection";
import { area as d3Area, line as d3Line, curveMonotoneX } from "d3-shape";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 240,
    margin: { top: 12, right: 24, bottom: 32, left: 40 },
    showArea: true,
    xLabelEvery: 1,
};

/**
 * Single-series line chart for ordinal time-axis data (decade
 * histograms, century counts, year-cohort series). The payload is
 * a list of `{label, value}` rows in display order; the widget
 * uses a point-scale on the x-axis so categorical labels (e.g.
 * "1850s") stay readable. Optional area fill under the line for
 * the typical "growth" visual.
 *
 * Hovering any point surfaces a chart-lib tooltip with the label
 * and the value formatted via `toLocaleString()`.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class LineChart extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     showArea?: boolean,
     *     xLabelEvery?: number,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._height = pickPositive(this.options.height, DEFAULT_OPTIONS.height);
        this._margin = { ...DEFAULT_OPTIONS.margin, ...(this.options.margin ?? {}) };
        this._showArea =
            typeof this.options.showArea === "boolean"
                ? this.options.showArea
                : DEFAULT_OPTIONS.showArea;
        this._xLabelEvery = Math.max(
            1,
            Math.floor(pickPositive(this.options.xLabelEvery, DEFAULT_OPTIONS.xLabelEvery)),
        );
    }

    /**
     * @param {Array<{label: string, value: number}>|null|undefined} data
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
            }))
            .filter((row) => row.label !== "" && Number.isFinite(row.value) && row.value >= 0);

        if (rows.length === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const height = this._height;
        const margin = this._margin;
        const width = Math.max(
            240,
            pickPositive(this.options.width, this.target.clientWidth) || 600,
        );
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        const x = scalePoint()
            .domain(rows.map((row) => row.label))
            .range([0, innerWidth])
            .padding(0.5);

        const y = scaleLinear()
            .domain([0, max(rows, (row) => row.value) ?? 1])
            .nice()
            .range([innerHeight, 0]);

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-line-chart")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Line chart");

        const inner = svg
            .append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top})`);

        // X-axis: show every Nth label so dense series stay readable.
        const xLabelEvery = this._xLabelEvery;
        const xAxis = axisBottom(x).tickFormat((label, index) =>
            index % xLabelEvery === 0 ? label : "",
        );

        inner
            .append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(xAxis);

        // Y-axis: integer-friendly ticks.
        const yAxis = axisLeft(y).ticks(5).tickFormat((value) => Number(value).toLocaleString());

        inner.append("g").attr("class", "y-axis").call(yAxis);

        const lineGenerator = d3Line()
            .x((row) => x(row.label) ?? 0)
            .y((row) => y(row.value))
            .curve(curveMonotoneX);

        if (this._showArea) {
            const areaGenerator = d3Area()
                .x((row) => x(row.label) ?? 0)
                .y0(innerHeight)
                .y1((row) => y(row.value))
                .curve(curveMonotoneX);

            inner
                .append("path")
                .datum(rows)
                .attr("class", "area")
                .attr("d", areaGenerator)
                .attr("opacity", 0)
                .transition("line-enter")
                .duration(500)
                .ease(easeCubicOut)
                .attr("opacity", 0.25);
        }

        inner
            .append("path")
            .datum(rows)
            .attr("class", "line")
            .attr("fill", "none")
            .attr("d", lineGenerator)
            .attr("stroke-dasharray", function () {
                return this.getTotalLength();
            })
            .attr("stroke-dashoffset", function () {
                return this.getTotalLength();
            })
            .transition("line-enter")
            .duration(600)
            .ease(easeCubicOut)
            .attr("stroke-dashoffset", 0);

        const points = inner
            .append("g")
            .attr("class", "points")
            .selectAll("circle.point")
            .data(rows)
            .enter()
            .append("circle")
            .attr("class", "point")
            .attr("cx", (row) => x(row.label) ?? 0)
            .attr("cy", (row) => y(row.value))
            .attr("r", 3)
            .attr("tabindex", "0")
            .attr(
                "aria-label",
                (row) => `${row.label}: ${row.value.toLocaleString()}`,
            );

        points
            .on("mouseover", (event, row) => {
                tooltip.show(
                    event,
                    `<strong>${escapeHtml(row.label)}</strong><br>` +
                        `<span class="wt-chart-tooltip__stat">${escapeHtml(row.value.toLocaleString())}</span>`,
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
            ":scope > svg.wt-line-chart, :scope > .chart-empty-state",
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
