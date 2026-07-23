/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { extent, max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { curveMonotoneX, area as d3Area, line as d3Line } from "d3-shape";
import "d3-transition";

import { createChartTooltip, tooltipHeader, tooltipLines, tooltipStat } from "../tooltip.js";
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
 * rather than data points along a line. Designed for any single-variable
 * distribution where the overall shape matters more than individual buckets.
 *
 * The widget renders both the area fill and (optionally) the line outline on
 * top of it; the consumer styles either via CSS
 * (`path.msc-area-density-area`, `path.msc-area-density-line`). No per-row
 * palette hook is exposed — density charts are single-series by definition, the
 * colour belongs to the host stylesheet, not the data row.
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget ships no
 * opinionated palette): `.msc-area-density` (root svg) wraps one inner `<g>`
 * holding the axis groups `.msc-area-density-x-axis` /
 * `.msc-area-density-y-axis`, the optional axis labels
 * `text.msc-area-density-axis-label.msc-area-density-x-label` /
 * `.msc-area-density-y-label`, the filled `path.msc-area-density-area`, the
 * optional `path.msc-area-density-line` outline, and a
 * `<g class="msc-area-density-points">` group of invisible
 * `circle.msc-area-density-point` hit-targets.
 *
 * The widget emits no selection event.
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
     *     margin?: {top?: number, right?: number, bottom?: number, left?: number},
     *     showLine?: boolean,
     *     xLabel?: string,
     *     yLabel?: string,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options, {
            margin: DEFAULT_OPTIONS.margin,
            ariaLabel: "Area density chart",
        });
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.showLine = this.options.showLine;
        this.xLabel = this.options.xLabel;
        this.yLabel = this.options.yLabel;
    }

    /**
     * Whether the line outline is drawn on top of the filled area.
     *
     * @returns {boolean}
     */
    get showLine() {
        return this._showLine;
    }

    /**
     * @param {boolean|undefined} value Whether to draw the line outline; a
     *   non-boolean value resets to the default. The runtime guard keeps the
     *   JSON dispatcher (which assigns untyped values) safe.
     */
    set showLine(value) {
        this._showLine = typeof value === "boolean" ? value : DEFAULT_OPTIONS.showLine;
    }

    /**
     * The x-axis label text, or an empty string to omit the label.
     *
     * @returns {string}
     */
    get xLabel() {
        return this._xLabel;
    }

    /**
     * @param {string|undefined} value The x-axis label; a non-string value
     *   resets to an empty string (no label). The runtime guard keeps the JSON
     *   dispatcher (which assigns untyped values) safe.
     */
    set xLabel(value) {
        this._xLabel = typeof value === "string" ? value : "";
    }

    /**
     * The y-axis label text, or an empty string to omit the label.
     *
     * @returns {string}
     */
    get yLabel() {
        return this._yLabel;
    }

    /**
     * @param {string|undefined} value The y-axis label; a non-string value
     *   resets to an empty string (no label). The runtime guard keeps the JSON
     *   dispatcher (which assigns untyped values) safe.
     */
    set yLabel(value) {
        this._yLabel = typeof value === "string" ? value : "";
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
        this._clearRoot("svg.msc-area-density");

        if (!Array.isArray(data) || data.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
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
            return this.renderEmptyState(this._emptyMessage);
        }

        const margin = this._margin;
        const height = this._resolveHeight(DEFAULT_OPTIONS.height);
        const width = this._resolveWidth(600, 240);
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
            .attr("class", "msc-area-density")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel);

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        // X-axis: numeric ticks with integer formatting (typical
        // payload is an integer measure). Caller can override via
        // their stylesheet if they want fewer ticks; chart-lib
        // defaults to d3's automatic count.
        const xAxis = axisBottom(x).tickFormat((value) => Number(value).toLocaleString());
        inner
            .append("g")
            .attr("class", "msc-area-density-x-axis")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(xAxis)
            .select(".domain")
            .remove();

        const yAxis = axisLeft(y)
            .ticks(5)
            .tickFormat((value) => Number(value).toLocaleString());
        inner
            .append("g")
            .attr("class", "msc-area-density-y-axis")
            .call(yAxis)
            .select(".domain")
            .remove();

        if (this._xLabel !== "") {
            inner
                .append("text")
                .attr("class", "msc-area-density-axis-label msc-area-density-x-label")
                .attr("x", innerWidth / 2)
                .attr("y", innerHeight + margin.bottom - 4)
                .attr("text-anchor", "middle")
                .text(this._xLabel);
        }

        if (this._yLabel !== "") {
            inner
                .append("text")
                .attr("class", "msc-area-density-axis-label msc-area-density-y-label")
                .attr(
                    "transform",
                    `rotate(-90) translate(${-innerHeight / 2}, ${-margin.left + 12})`,
                )
                .attr("text-anchor", "middle")
                .text(this._yLabel);
        }

        /** @typedef {{x: number, y: number, tooltip: string, tooltipLabel: string}} DensityPoint */
        const areaGenerator = /** @type {import("d3-shape").Area<DensityPoint>} */ (d3Area())
            .x((row) => x(row.x))
            .y0(innerHeight)
            .y1((row) => y(row.y))
            .curve(curveMonotoneX);

        const areaPath = inner
            .append("path")
            .datum(rows)
            .attr("class", "msc-area-density-area")
            .attr("d", (points) => areaGenerator(points))
            .attr("opacity", 0);

        // Entry: the density area fades in. Initial keyframe (opacity 0) set
        // above; _runEntry animates inline, holds for reveal-on-scroll, or jumps
        // to the final opacity under reduced motion.
        this._runEntry((animate) => {
            this._enter(areaPath, animate, "area-enter", 500).attr("opacity", 1);
        });

        if (this._showLine) {
            const lineGenerator = /** @type {import("d3-shape").Line<DensityPoint>} */ (d3Line())
                .x((row) => x(row.x))
                .y((row) => y(row.y))
                .curve(curveMonotoneX);

            inner
                .append("path")
                .datum(rows)
                .attr("class", "msc-area-density-line")
                .attr("fill", "none")
                .attr("d", (points) => lineGenerator(points));
        }

        // Hit-targets for tooltip: invisible circles at each
        // `{x, y}` so hovering anywhere along the curve surfaces
        // the underlying data point. r=4 keeps the target large
        // enough on phone-style touch displays.
        inner
            .append("g")
            .attr("class", "msc-area-density-points")
            .selectAll("circle.msc-area-density-point")
            .data(rows)
            .enter()
            .append("circle")
            .attr("class", "msc-area-density-point")
            .attr("cx", (row) => x(row.x))
            .attr("cy", (row) => y(row.y))
            .attr("r", 4)
            .attr("opacity", 0)
            .attr("tabindex", "0")
            .attr("aria-label", (row) => `${row.x.toLocaleString()}: ${row.y.toLocaleString()}`)
            .on("mouseover", (event, row) => {
                const header = row.tooltipLabel === "" ? row.x.toLocaleString() : row.tooltipLabel;
                const body = row.tooltip === "" ? row.y.toLocaleString() : row.tooltip;
                tooltip.show(event, tooltipLines(tooltipHeader(header), tooltipStat(body)));
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        return svg.node();
    }
}
