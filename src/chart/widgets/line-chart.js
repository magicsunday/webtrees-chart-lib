/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { extent, max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { easeCubicOut } from "d3-ease";
import { scaleLinear, scaleOrdinal, scalePoint } from "d3-scale";
import { schemeTableau10 } from "d3-scale-chromatic";
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
     * @param {Array<{label: string, value: number, tooltip?: string, tooltipLabel?: string}>
     *         | Array<{name: string, data: Array<{x: number, y: number}>, class?: string}>
     *         | null | undefined} data
     *   Auto-detects between two payload shapes:
     *
     *   - Single-series (categorical): rows of `{label, value,
     *     tooltip?, tooltipLabel?}`. The `label` doubles as the
     *     x-axis tick; the `tooltip` overrides the default value
     *     rendering; the `tooltipLabel` overrides the bold header
     *     when present.
     *   - Multi-series (numeric x): rows of `{name, data: [{x,
     *     y}, …], class?}`. Every row that carries a `data` array
     *     triggers the multi-series render path — numeric x scale,
     *     one path.line per series, hit-target circles per point,
     *     a hover-tooltip that surfaces every series value at the
     *     current x, and a legend strip.
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        if (!Array.isArray(data) || data.length === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        // Mode auto-detect: if every row has a `data` array
        // child, treat the payload as a multi-series shape
        // (`[{name, data: [{x, y}]}, …]`); otherwise fall back to
        // the original single-series categorical shape
        // (`[{label, value}, …]`).
        const isMultiSeries = data.every(
            (row) => row !== null && typeof row === "object" && Array.isArray(row.data),
        );

        if (isMultiSeries) {
            return this._drawMultiSeries(data);
        }

        const rows = data
            .filter((row) => row !== null && typeof row === "object")
            .map((row) => ({
                label: String(row.label ?? ""),
                value: Number(row.value ?? 0),
                tooltip: typeof row.tooltip === "string" ? row.tooltip : "",
                tooltipLabel: typeof row.tooltipLabel === "string" ? row.tooltipLabel : "",
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

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

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
        const yAxis = axisLeft(y)
            .ticks(5)
            .tickFormat((value) => Number(value).toLocaleString());

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
            .style("fill", "none")
            .attr("d", lineGenerator)
            .attr("stroke-dasharray", function () {
                // jsdom does not implement getTotalLength; fall back
                // to a no-op dasharray so the path still renders in
                // the test environment.
                return typeof this.getTotalLength === "function" ? this.getTotalLength() : 0;
            })
            .attr("stroke-dashoffset", function () {
                return typeof this.getTotalLength === "function" ? this.getTotalLength() : 0;
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
            .attr("aria-label", (row) => `${row.label}: ${row.value.toLocaleString()}`);

        points
            .on("mouseover", (event, row) => {
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
     * Multi-series render path: numeric x scale, one line per
     * series, colour scale by series name, hover-crosshair
     * surfacing every series value at the current x. Payload is
     * `[{name, data: [{x: number, y: number}, …], class?: string}, …]`.
     *
     * @param {Array<{name: string, data: Array<{x: number, y: number}>, class?: string}>} payload
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    _drawMultiSeries(payload) {
        const series = payload
            .filter((s) => s !== null && typeof s === "object" && Array.isArray(s.data))
            .map((s) => ({
                name: String(s.name ?? ""),
                class: typeof s.class === "string" ? s.class : "",
                data: s.data
                    .filter((row) => row !== null && typeof row === "object")
                    .map((row) => ({
                        x: Number(row.x ?? Number.NaN),
                        y: Number(row.y ?? 0),
                    }))
                    .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y))
                    .sort((a, b) => a.x - b.x),
            }))
            .filter((s) => s.name !== "" && s.data.length > 0);

        if (series.length === 0) {
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

        const allPoints = series.flatMap((s) => s.data);
        const xDomain = extent(allPoints, (point) => point.x);
        const yMax = max(allPoints, (point) => point.y) ?? 1;

        const x = scaleLinear().domain(xDomain).nice().range([0, innerWidth]);
        const y = scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);
        const colour = scaleOrdinal()
            .domain(series.map((s) => s.name))
            .range(schemeTableau10);

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-line-chart wt-line-chart--multi")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Line chart");

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        inner
            .append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(axisBottom(x).tickFormat((value) => Number(value).toLocaleString()));

        inner
            .append("g")
            .attr("class", "y-axis")
            .call(
                axisLeft(y)
                    .ticks(5)
                    .tickFormat((value) => Number(value).toLocaleString()),
            );

        const lineGenerator = d3Line()
            .x((point) => x(point.x))
            .y((point) => y(point.y))
            .curve(curveMonotoneX);

        const seriesGroups = inner
            .append("g")
            .attr("class", "series-lines")
            .selectAll("g.series")
            .data(series)
            .enter()
            .append("g")
            .attr("class", (s) => (s.class === "" ? "series" : `series ${s.class}`))
            .attr("data-series-name", (s) => s.name);

        seriesGroups
            .append("path")
            .attr("class", "line")
            .style("fill", "none")
            .style("stroke", (s) => colour(s.name) ?? "")
            .attr("d", (s) => lineGenerator(s.data));

        // Hit-targets per data point so hovering anywhere along a
        // line surfaces the underlying value. Invisible by default
        // but tab-focusable so keyboard users get the same readout.
        seriesGroups
            .selectAll("circle.point")
            .data((s) => s.data.map((point) => ({ ...point, name: s.name })))
            .enter()
            .append("circle")
            .attr("class", "point")
            .attr("cx", (point) => x(point.x))
            .attr("cy", (point) => y(point.y))
            .attr("r", 4)
            .style("fill", (point) => colour(point.name) ?? "")
            .style("opacity", 0)
            .attr("tabindex", "0")
            .attr(
                "aria-label",
                (point) => `${point.name} ${point.x.toLocaleString()}: ${point.y.toLocaleString()}`,
            )
            .on("mouseover", (event, point) => {
                const xValueRows = series
                    .map((s) => {
                        const match = s.data.find((row) => row.x === point.x);
                        return match === undefined
                            ? null
                            : `<span class="wt-chart-tooltip__row">${escapeHtml(s.name)}: ${escapeHtml(match.y.toLocaleString())}</span>`;
                    })
                    .filter((row) => row !== null)
                    .join("<br>");
                tooltip.show(
                    event,
                    `<strong>${escapeHtml(point.x.toLocaleString())}</strong><br>${xValueRows}`,
                );
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        // Legend strip below the chart.
        const legend = svg.append("g").attr("class", "line-legend");
        let xOffset = margin.left;
        const yOffset = height - 4;
        for (const s of series) {
            const group = legend.append("g").attr("transform", `translate(${xOffset}, ${yOffset})`);
            group
                .append("rect")
                .attr("class", `legend-swatch${s.class === "" ? "" : ` ${s.class}`}`)
                .attr("width", 10)
                .attr("height", 10)
                .attr("y", -10)
                .style("fill", colour(s.name) ?? "");
            group
                .append("text")
                .attr("class", "legend-label")
                .attr("x", 14)
                .attr("y", -1)
                .attr("dominant-baseline", "alphabetic")
                .text(s.name);
            xOffset += 10 + 4 + s.name.length * 7 + 16;
        }

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
