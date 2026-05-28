/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { easeCubicOut } from "d3-ease";
import { scaleLinear, scaleOrdinal, scalePoint } from "d3-scale";
import { schemeTableau10 } from "d3-scale-chromatic";
import { select } from "d3-selection";
import { area as d3Area, curveMonotoneX, line as d3Line } from "d3-shape";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 240,
    margin: { top: 12, right: 24, bottom: 32, left: 40 },
    showArea: true,
    multiSeriesArea: false,
    xLabelEvery: 1,
    yUnit: "",
};

/**
 * Line chart over a categorical x-axis. Payload mirrors the
 * {@see StackedBar} shape one level deep — same `{categories,
 * series}` top-level keys — but per series LineChart reads
 * `series[i].values: number[]` where StackedBar reads
 * `series[i].data: number[]`. A consumer that wants to swap
 * widget types renames that one field; everything else carries
 * over.
 *
 * Every series renders one path; tooltips surface the full
 * series-by-series value list at the hovered category.
 *
 * Single-series callers pass `series` with exactly one entry —
 * the area-under-line fill stays on (typical "growth" visual),
 * the legend is suppressed. Multi-series callers pass two or
 * more entries — the area fill is suppressed (visually noisy
 * when stacked) and a legend strip lands below the chart.
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
     *     multiSeriesArea?: boolean,
     *     xLabelEvery?: number,
     *     yUnit?: string,
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
        this._multiSeriesArea =
            typeof this.options.multiSeriesArea === "boolean"
                ? this.options.multiSeriesArea
                : DEFAULT_OPTIONS.multiSeriesArea;
        this._xLabelEvery = Math.max(
            1,
            Math.floor(pickPositive(this.options.xLabelEvery, DEFAULT_OPTIONS.xLabelEvery)),
        );
        this._yUnit =
            typeof this.options.yUnit === "string" ? this.options.yUnit : DEFAULT_OPTIONS.yUnit;
    }

    /**
     * @param {{
     *     categories: string[],
     *     series: Array<{
     *         name: string,
     *         values: number[],
     *         class?: string,
     *         tooltips?: string[],
     *         tooltipLabels?: string[]
     *     }>
     * }|null|undefined} data
     *   - `categories` is the x-axis label list in display order.
     *   - `series[i].values[j]` is the y value of series `i` at
     *     category `j` — the array length must match the
     *     categories list (missing trailing entries are treated
     *     as zero).
     *   - `series[i].class` is an optional CSS hook on the
     *     series group so consumer styling can override the
     *     palette colour.
     *   - `series[i].tooltips[j]` overrides the default value
     *     rendering inside the chart-lib tooltip (e.g. "4
     *     births" pre-pluralised at the PHP boundary).
     *   - `series[i].tooltipLabels[j]` overrides the bold
     *     header when present (e.g. the bare category "17th"
     *     becomes "17th century" in the tooltip).
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const validated = this._validate(data);
        if (validated === null) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const { categories, series } = validated;
        const isMultiSeries = series.length > 1;

        const height = this._height;
        // Multi-series renders a legend strip under the x-axis;
        // give it its own band by widening the bottom margin so
        // legend swatches don't overlap the tick labels.
        const legendBandHeight = 20;
        const margin = {
            ...this._margin,
            bottom: this._margin.bottom + (isMultiSeries ? legendBandHeight : 0),
        };
        const width = Math.max(
            240,
            pickPositive(this.options.width, this.target.clientWidth) || 600,
        );
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        const x = scalePoint().domain(categories).range([0, innerWidth]).padding(0.5);

        const yMax = max(series.flatMap((s) => s.values)) ?? 1;
        const y = scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);

        const colour = scaleOrdinal()
            .domain(series.map((s) => s.name))
            .range(schemeTableau10);

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", isMultiSeries ? "wt-line-chart wt-line-chart--multi" : "wt-line-chart")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Line chart");

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        // X-axis: show every Nth tick so dense series stay readable.
        const xLabelEvery = this._xLabelEvery;
        const xAxis = axisBottom(x).tickFormat((label, index) =>
            index % xLabelEvery === 0 ? label : "",
        );
        inner
            .append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(xAxis)
            .select(".domain")
            .remove();

        // Y-axis: integer-friendly ticks. `tickSize(-innerWidth)`
        // extends each tick mark across the plot area, turning the
        // axis into a gridline strip; CSS picks the dashed style
        // up from `.y-axis .tick line`. The domain path D3 renders
        // by default is dropped — grid-lines + card border carry
        // the framing the path was duplicating.
        const yAxis = axisLeft(y)
            .ticks(5)
            .tickSize(-innerWidth)
            .tickPadding(8)
            .tickFormat((value) => Number(value).toLocaleString());
        inner
            .append("g")
            .attr("class", "y-axis y-axis--grid")
            .call(yAxis)
            .select(".domain")
            .remove();

        const lineGenerator = d3Line()
            .x((point) => x(point.label) ?? 0)
            .y((point) => y(point.value))
            .curve(curveMonotoneX);

        // Single-series gets an area fill under the line ("growth"
        // visual). Multi-series suppresses it by default to avoid
        // visual noise when bands overlap; opt in via the
        // `multiSeriesArea` flag for side-by-side comparison
        // charts where the area visual reinforces the trend (e.g.
        // father → son vs. mother → daughter passdown).
        const showArea = this._showArea && (!isMultiSeries || this._multiSeriesArea);
        const areaGenerator = d3Area()
            .x((point) => x(point.label) ?? 0)
            .y0(innerHeight)
            .y1((point) => y(point.value))
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

        // Resolves the inline series colour for either the area
        // fill or the line stroke. Single-series and class-themed
        // series both let CSS own the colour ({@code null}
        // return); only multi-series WITHOUT a class token falls
        // back to the d3 ordinal scale so area + line stay in
        // sync. The closure preserves the d3 `.style(fn)` binding
        // where `this` is the path DOM node.
        const resolveSeriesColour = (pathNode) => {
            if (!isMultiSeries) {
                return null;
            }
            const parent = pathNode.parentNode;
            if (parent !== null && parent.classList.length > 1) {
                return null;
            }
            const name = parent?.getAttribute("data-series-name") ?? "";
            return colour(name) ?? "";
        };

        if (showArea) {
            // Multi-series area fills sit on top of each other, so
            // their opacity has to stay low enough that the lower
            // band still reads through the upper one. 0.14 mirrors
            // the design mockup's <AreaLine multiSeries> reference.
            const areaTargetOpacity = isMultiSeries ? 0.14 : 0.25;
            seriesGroups
                .append("path")
                .datum((s) => this._materialisePoints(s, categories))
                .attr("class", "area")
                .style("fill", function () {
                    return resolveSeriesColour(this);
                })
                .attr("d", areaGenerator)
                .attr("opacity", 0)
                .transition("line-enter")
                .duration(500)
                .ease(easeCubicOut)
                .attr("opacity", areaTargetOpacity);
        }

        seriesGroups
            .append("path")
            .datum((s) => this._materialisePoints(s, categories))
            .attr("class", "line")
            .style("fill", "none")
            .style("stroke", function () {
                return resolveSeriesColour(this);
            })
            .attr("d", lineGenerator)
            .attr("stroke-dasharray", function () {
                // jsdom does not implement getTotalLength; fall
                // back to a no-op dasharray so the path still
                // renders in the test environment.
                return typeof this.getTotalLength === "function" ? this.getTotalLength() : 0;
            })
            .attr("stroke-dashoffset", function () {
                return typeof this.getTotalLength === "function" ? this.getTotalLength() : 0;
            })
            .transition("line-enter")
            .duration(600)
            .ease(easeCubicOut)
            .attr("stroke-dashoffset", 0);

        // Hit-target circles per data point.
        seriesGroups
            .selectAll("circle.point")
            .data((s) => this._materialisePoints(s, categories))
            .enter()
            .append("circle")
            .attr("class", "point")
            .attr("cx", (point) => x(point.label) ?? 0)
            .attr("cy", (point) => y(point.value))
            .attr("r", 3)
            .attr("tabindex", "0")
            .attr("aria-label", (point) => `${point.label}: ${point.value.toLocaleString()}`)
            .on("mouseover", (event, point) => {
                const header = point.tooltipLabel === "" ? point.label : point.tooltipLabel;
                if (isMultiSeries) {
                    // Multi-series tooltip: one row per series at
                    // the hovered category. Per-series
                    // `tooltips[index]` overrides win when provided
                    // (so callers can ship "% — N of M …" prose);
                    // otherwise the row falls back to the raw
                    // value plus the optional `yUnit` suffix
                    // ("23.5 %" / "120 yr") so a percentage chart
                    // doesn't read as a bare number.
                    const yUnit = this._yUnit;
                    const rows = series
                        .map((s) => {
                            const index = categories.indexOf(point.label);
                            const override =
                                Array.isArray(s.tooltips) && typeof s.tooltips[index] === "string"
                                    ? s.tooltips[index]
                                    : "";
                            if (override !== "") {
                                return `<span class="wt-chart-tooltip__row">${escapeHtml(s.name)}: ${escapeHtml(override)}</span>`;
                            }
                            const v = s.values[index] ?? 0;
                            return `<span class="wt-chart-tooltip__row">${escapeHtml(s.name)}: ${escapeHtml(v.toLocaleString() + yUnit)}</span>`;
                        })
                        .join("<br>");
                    tooltip.show(event, `<strong>${escapeHtml(header)}</strong><br>${rows}`);
                    return;
                }
                // Single-series: prefer the per-point tooltip
                // override when supplied, otherwise the bare value
                // plus the optional `yUnit` suffix so a single
                // percentage chart reads as "23.5 %" rather than a
                // bare number — symmetric with the multi-series
                // branch above.
                const body =
                    point.tooltip === ""
                        ? escapeHtml(point.value.toLocaleString() + this._yUnit)
                        : escapeHtml(point.tooltip);
                tooltip.show(
                    event,
                    `<strong>${escapeHtml(header)}</strong><br>` +
                        `<span class="wt-chart-tooltip__stat">${body}</span>`,
                );
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        if (isMultiSeries) {
            this._renderLegend(svg, series, colour, width, height, margin);
        }

        return svg.node();
    }

    /**
     * Validate the input payload into a normalised
     * `{categories, series}` shape, or return null to signal the
     * empty-state path.
     *
     * @param {unknown} data
     *
     * @returns {{categories: string[], series: Array<{name: string, values: number[], class: string, tooltips: string[], tooltipLabels: string[]}>}|null}
     */
    _validate(data) {
        if (data === null || data === undefined || typeof data !== "object") {
            return null;
        }
        const categories = Array.isArray(data.categories)
            ? data.categories
                  .filter((label) => typeof label === "string" && label !== "")
                  .map((label) => String(label))
            : [];
        const rawSeries = Array.isArray(data.series) ? data.series : [];

        if (categories.length === 0 || rawSeries.length === 0) {
            return null;
        }

        const series = rawSeries
            .filter((s) => s !== null && typeof s === "object" && Array.isArray(s.values))
            .map((s) => ({
                name: String(s.name ?? ""),
                class: typeof s.class === "string" ? s.class : "",
                values: categories.map((_, index) => {
                    const value = Number(s.values[index] ?? 0);
                    return Number.isFinite(value) && value >= 0 ? value : 0;
                }),
                tooltips: Array.isArray(s.tooltips)
                    ? categories.map((_, index) =>
                          typeof s.tooltips[index] === "string" ? s.tooltips[index] : "",
                      )
                    : categories.map(() => ""),
                tooltipLabels: Array.isArray(s.tooltipLabels)
                    ? categories.map((_, index) =>
                          typeof s.tooltipLabels[index] === "string" ? s.tooltipLabels[index] : "",
                      )
                    : categories.map(() => ""),
            }))
            .filter((s) => s.name !== "");

        if (series.length === 0) {
            return null;
        }

        const anyValue = series.some((s) => s.values.some((value) => value > 0));
        if (!anyValue) {
            return null;
        }

        return { categories, series };
    }

    /**
     * Inflate a single series into a list of point objects keyed
     * by category label, ready for d3-shape's line/area generators.
     *
     * @param {{name: string, values: number[], tooltips: string[], tooltipLabels: string[]}} s
     * @param {string[]} categories
     *
     * @returns {Array<{label: string, value: number, tooltip: string, tooltipLabel: string}>}
     */
    _materialisePoints(s, categories) {
        return categories.map((label, index) => ({
            label,
            value: s.values[index] ?? 0,
            tooltip: s.tooltips[index] ?? "",
            tooltipLabel: s.tooltipLabels[index] ?? "",
        }));
    }

    /**
     * Compact legend below the chart for multi-series payloads.
     * Each entry gets a colour swatch plus the series name.
     *
     * @param {import("d3-selection").Selection<SVGSVGElement, unknown, null, undefined>} svg
     * @param {Array<{name: string, class: string}>} series
     * @param {import("d3-scale").ScaleOrdinal<string, string>} colour
     * @param {number} width
     * @param {number} height
     * @param {{top: number, right: number, bottom: number, left: number}} margin
     */
    _renderLegend(svg, series, colour, width, height, margin) {
        const legend = svg.append("g").attr("class", "line-legend");
        const swatchSize = 10;
        const labelGap = 4;
        // Spacing between adjacent legend items. The previous 16 px
        // value crowded labels that carry wide glyphs (em-dash,
        // arrow, ×) — "Father → son" + "Mother → daughter" run into
        // each other because the 7 px-per-char heuristic
        // underestimates the arrow's advance. 28 px keeps the
        // breathing room readable even when the heuristic falls
        // short by 2-3 characters.
        const itemSpacing = 28;
        const rowHeight = swatchSize + 4;
        let xOffset = margin.left;
        let yOffset = height - 4;

        for (const s of series) {
            const group = legend.append("g").attr("transform", `translate(${xOffset}, ${yOffset})`);
            const swatch = group
                .append("rect")
                .attr("class", `legend-swatch${s.class === "" ? "" : ` ${s.class}`}`)
                .attr("width", swatchSize)
                .attr("height", swatchSize)
                .attr("y", -swatchSize);
            // Class-themed swatches let CSS pick the fill so the
            // legend stays in sync with the line colour.
            if (s.class === "") {
                swatch.style("fill", colour(s.name) ?? "");
            }
            group
                .append("text")
                .attr("class", "legend-label")
                .attr("x", swatchSize + labelGap)
                .attr("y", -swatchSize / 2)
                .attr("dominant-baseline", "middle")
                .text(s.name);
            // Approximate text-advance via 7 px / character; same
            // best-effort heuristic as StackedBar. Host stylesheets
            // can tighten with `letter-spacing` if the result is
            // too sparse.
            const labelWidth = swatchSize + labelGap + s.name.length * 7;
            xOffset += labelWidth + itemSpacing;
            if (xOffset > width - margin.right) {
                xOffset = margin.left;
                yOffset += rowHeight;
            }
        }
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
