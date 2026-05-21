/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { max as d3Max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { easeCubicOut } from "d3-ease";
import { scaleBand, scaleLinear, scaleOrdinal } from "d3-scale";
import { schemeTableau10 } from "d3-scale-chromatic";
import { select } from "d3-selection";
import { stack } from "d3-shape";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 280,
    margin: { top: 12, right: 24, bottom: 32, left: 48 },
    barPadding: 0.2,
    legend: true,
};

/**
 * Stacked bar chart for compositional payloads. Each category
 * carries a stack of series-keyed values that sum to the bar
 * height; the layout uses d3-shape's `stack()` so segment
 * ordering matches the order series arrive in.
 *
 * Tooltip surfaces both the hovered segment's value AND the
 * category's total, which is what the user actually wants to
 * see when comparing across categories ("4 divorces in 1900s
 * for ages 20-29, 27 divorces total in 1900s").
 *
 * Per-series colour comes from the `series[i].class` field when
 * provided (CSS class hook), otherwise falls back to a small
 * categorical palette. Colour palette is not opinionated — the
 * caller is expected to layer their own design tokens via the
 * CSS class hook on hot paths.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class StackedBar extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     barPadding?: number,
     *     legend?: boolean,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._height = pickPositive(this.options.height, DEFAULT_OPTIONS.height);
        this._margin = { ...DEFAULT_OPTIONS.margin, ...(this.options.margin ?? {}) };
        this._barPadding = pickFraction(this.options.barPadding, DEFAULT_OPTIONS.barPadding);
        this._legend =
            typeof this.options.legend === "boolean" ? this.options.legend : DEFAULT_OPTIONS.legend;
    }

    /**
     * @param {{
     *     categories: string[],
     *     series: Array<{name: string, data: number[], class?: string}>
     * }|null|undefined} data
     *   `categories` is the x-axis label list in display order.
     *   `series[i].data[j]` is the value of series `i` for
     *   category `j`. Each series may carry a CSS `class` so the
     *   consumer can theme segments via the host stylesheet
     *   instead of mutating the widget's palette.
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const validated = this._validate(data);
        if (validated === null) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const { categories, tooltipLabels, series } = validated;
        const height = this._height;
        // Reserve a legend band under the x-axis when the legend
        // is on; matches the LineChart multi-series convention.
        const legendBandHeight = 20;
        const margin = {
            ...this._margin,
            bottom: this._margin.bottom + (this._legend ? legendBandHeight : 0),
        };
        const width = Math.max(
            240,
            pickPositive(this.options.width, this.target.clientWidth) || 600,
        );
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // d3-shape's stack works off an array of row objects keyed
        // by series name; transpose `series[i].data[j]` into one
        // row per category.
        const rows = categories.map((label, index) => {
            const row = { label };
            for (const s of series) {
                row[s.name] = Number(s.data[index] ?? 0);
            }
            return row;
        });

        const keys = series.map((s) => s.name);
        const stackLayout = stack().keys(keys)(rows);
        const totals = rows.map((row) =>
            keys.reduce((sum, key) => sum + (Number(row[key]) || 0), 0),
        );
        const valueMax = d3Max(totals) ?? 1;

        const x = scaleBand().domain(categories).range([0, innerWidth]).padding(this._barPadding);

        const y = scaleLinear().domain([0, valueMax]).nice().range([innerHeight, 0]);

        const colour = scaleOrdinal()
            .domain(keys)
            .range(
                series.map((s, index) =>
                    typeof s.class === "string" && s.class !== ""
                        ? null
                        : schemeTableau10[index % schemeTableau10.length],
                ),
            );

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-stacked-bar")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Stacked bar chart");

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        inner
            .append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(axisBottom(x));

        inner
            .append("g")
            .attr("class", "y-axis")
            .call(
                axisLeft(y)
                    .ticks(5)
                    .tickFormat((value) => Number(value).toLocaleString()),
            );

        const seriesGroups = inner
            .append("g")
            .attr("class", "stacks")
            .selectAll("g.series")
            .data(stackLayout)
            .enter()
            .append("g")
            .attr("class", (_d, index) => {
                const seriesEntry = series[index];
                const cssClass =
                    typeof seriesEntry?.class === "string" && seriesEntry.class !== ""
                        ? ` ${seriesEntry.class}`
                        : "";
                return `series${cssClass}`;
            })
            .attr("data-series-name", (_d, index) => series[index]?.name ?? "")
            .attr("fill", (d) => colour(d.key) ?? "");

        seriesGroups
            .selectAll("rect.segment")
            .data((d) => d)
            .enter()
            .append("rect")
            .attr("class", "segment")
            .attr("x", (segment) => x(segment.data.label) ?? 0)
            .attr("width", x.bandwidth())
            .attr("y", innerHeight)
            .attr("height", 0)
            .attr("tabindex", "0")
            .attr("aria-label", function (segment) {
                const seriesNode = this.parentNode;
                const seriesName = seriesNode?.getAttribute("data-series-name") ?? "";
                const value = segment[1] - segment[0];
                return `${segment.data.label} / ${seriesName}: ${value.toLocaleString()}`;
            })
            .transition("stack-enter")
            .duration(500)
            .ease(easeCubicOut)
            .attr("y", (segment) => y(segment[1]))
            .attr("height", (segment) => y(segment[0]) - y(segment[1]));

        // Hover handlers re-bind from the parent so we can read the
        // series-name attribute the d3.attr() function above already
        // wrote — keeps the segment->series mapping local to the DOM.
        inner.selectAll("rect.segment").on("mouseover", function (event, segment) {
            const seriesName = this.parentNode?.getAttribute("data-series-name") ?? "";
            const value = segment[1] - segment[0];
            const categoryIndex = categories.indexOf(segment.data.label);
            const total = totals[categoryIndex] ?? 0;
            const share = total > 0 ? Math.round((value / total) * 100) : 0;
            const header = tooltipLabels[categoryIndex] ?? segment.data.label;
            tooltip.show(
                event,
                `<strong>${escapeHtml(header)}</strong><br>` +
                    `<span class="wt-chart-tooltip__row">${escapeHtml(seriesName)}: ${escapeHtml(value.toLocaleString())} (${share}%)</span><br>` +
                    `<span class="wt-chart-tooltip__sub">${escapeHtml(total.toLocaleString())} total in this category</span>`,
            );
        });

        inner
            .selectAll("rect.segment")
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        if (this._legend) {
            this._renderLegend(svg, series, colour, width, height, margin);
        }

        return svg.node();
    }

    /**
     * Validate the input payload into a normalised
     * `{categories, series}` shape, or return null to signal
     * the empty-state path.
     *
     * @param {unknown} data
     *
     * @returns {{categories: string[], tooltipLabels: string[], series: Array<{name: string, data: number[], class?: string}>}|null}
     */
    _validate(data) {
        if (data === null || data === undefined || typeof data !== "object") {
            return null;
        }
        const categories = Array.isArray(data.categories)
            ? data.categories.filter((label) => typeof label === "string" && label !== "")
            : [];
        const seriesIn = Array.isArray(data.series) ? data.series : [];

        if (categories.length === 0 || seriesIn.length === 0) {
            return null;
        }

        // `tooltipLabels` mirrors the LineChart contract: a parallel
        // array of long-form headers shown in the tooltip while the
        // shorter `categories` stay on the x-axis. Missing entries
        // fall back to the matching category so callers can opt in
        // per chart.
        const tooltipLabels = categories.map((label, index) => {
            const candidate = Array.isArray(data.tooltipLabels)
                ? data.tooltipLabels[index]
                : undefined;
            return typeof candidate === "string" && candidate !== "" ? candidate : label;
        });

        const series = seriesIn
            .filter((s) => s !== null && typeof s === "object" && Array.isArray(s.data))
            .map((s) => ({
                name: String(s.name ?? ""),
                class: typeof s.class === "string" ? s.class : "",
                data: categories.map((_, index) => {
                    const value = Number(s.data[index] ?? 0);
                    return Number.isFinite(value) && value >= 0 ? value : 0;
                }),
            }))
            .filter((s) => s.name !== "");

        if (series.length === 0) {
            return null;
        }

        const anyValue = series.some((s) => s.data.some((value) => value > 0));
        if (!anyValue) {
            return null;
        }

        return { categories, tooltipLabels, series };
    }

    /**
     * Render a compact legend below the chart. Each item carries
     * a colour swatch matching the corresponding series so the
     * stacking order remains discoverable without hovering.
     *
     * @param {import("d3-selection").Selection<SVGSVGElement, unknown, null, undefined>} svg
     * @param {Array<{name: string, class?: string}>} series
     * @param {import("d3-scale").ScaleOrdinal<string, string>} colour
     * @param {number} width
     * @param {number} height
     * @param {{top: number, right: number, bottom: number, left: number}} margin
     */
    _renderLegend(svg, series, colour, width, height, margin) {
        const legend = svg.append("g").attr("class", "stack-legend");
        const swatchSize = 10;
        const labelGap = 4;
        const itemSpacing = 16;
        const rowHeight = swatchSize + 4;
        let xOffset = margin.left;
        // Place the legend in the reserved bottom band — below the
        // x-axis tick labels rather than above the chart. The
        // `-swatchSize / 2` shifts the swatch's vertical centre to
        // the band's centreline so the labels and swatches share
        // a single optical baseline.
        let yOffset = height - 4 - swatchSize / 2;

        for (const entry of series) {
            const group = legend.append("g").attr("transform", `translate(${xOffset}, ${yOffset})`);
            group
                .append("rect")
                .attr("class", `legend-swatch${entry.class === "" ? "" : ` ${entry.class}`}`)
                .attr("width", swatchSize)
                .attr("height", swatchSize)
                .attr("y", -swatchSize / 2)
                .attr("fill", colour(entry.name) ?? "");
            group
                .append("text")
                .attr("x", swatchSize + labelGap)
                .attr("y", 0)
                .attr("dominant-baseline", "middle")
                .attr("class", "legend-label")
                .text(entry.name);
            // Approximate text width: SVG cannot measure text without
            // a DOM layout pass, so use a conservative 7 px / char
            // advance plus the swatch + gap. This is a best-effort
            // wrap heuristic; the host stylesheet can tighten the
            // legend with letter-spacing if the result is too sparse.
            const labelWidth = swatchSize + labelGap + entry.name.length * 7;
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
            ":scope > svg.wt-stacked-bar, :scope > .chart-empty-state",
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
