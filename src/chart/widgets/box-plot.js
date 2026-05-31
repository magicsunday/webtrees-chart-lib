/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { ascending, max as d3Max, min as d3Min, quantile } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { scaleBand, scaleLinear } from "d3-scale";
import { select } from "d3-selection";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { pickFraction, pickPositive } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 280,
    margin: { top: 12, right: 24, bottom: 32, left: 48 },
    orientation: "vertical",
    boxPadding: 0.3,
    whiskerMultiplier: 1.5,
};

const ORIENTATIONS = new Set(["vertical", "horizontal"]);

/**
 * Box-and-whisker chart that summarises each category's value distribution as
 * quartiles + whisker bounds + outliers. Carries strictly more information than
 * a single mean-trend line — the median, IQR width and outlier cloud all show
 * up at a glance.
 *
 * Quartile computation lives inside the widget so the caller ships raw sample
 * arrays per category, not pre-aggregated statistics. The whisker length
 * follows the standard 1.5× IQR convention (configurable via
 * `whiskerMultiplier`); samples beyond a whisker render as outlier dots.
 *
 * Tooltip on each box surfaces median + IQR + sample count so the visual can be
 * read without mental arithmetic. The widget emits no selection event.
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget ships no
 * opinionated palette): `.wt-box-plot` (root svg) wraps one inner `<g>` holding
 * the category axis (`.x-axis` / `.y-axis`, whose ticks each carry a
 * `text.sample-size` count), the gridded value axis (`.y-axis--grid` /
 * `.x-axis--grid`), and the `.boxes` group. Each cohort is a `g.cohort` (plus
 * any caller-supplied `class`) holding `rect.box` (the IQR box), the median —
 * either a single `line.median` or, around the centred `text.median-value`, a
 * `line.median.median--left` / `line.median.median--right` pair —
 * `line.whisker` with `line.whisker-cap.whisker-cap--low` / `--high`, faint
 * `line.box-guide.box-guide--p25` / `--p75` hover guides, `circle.outlier`
 * dots, and an invisible `rect.hover-target` carrying the tabindex + aria-label.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class BoxPlot extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     orientation?: "vertical" | "horizontal",
     *     boxPadding?: number,
     *     whiskerMultiplier?: number,
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
        this._boxPadding = pickFraction(this.options.boxPadding, DEFAULT_OPTIONS.boxPadding);
        this._whiskerMultiplier = pickPositive(
            this.options.whiskerMultiplier,
            DEFAULT_OPTIONS.whiskerMultiplier,
        );
    }

    /**
     * @param {Array<{category: string, tooltipLabel?: string, values: number[], class?: string}>|null|undefined} data
     *   One row per category. `values` is the raw sample array;
     *   the widget sorts + quartiles internally. `tooltipLabel`
     *   (optional) carries a long-form heading for tooltip +
     *   aria-label while `category` stays short for the axis
     *   tick; missing `tooltipLabel` falls back to `category`.
     *   Categories with fewer than four samples render as a
     *   degenerate box (just the median + sample dots) so a
     *   sparse cohort still shows up rather than being silently
     *   dropped.
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        if (!Array.isArray(data) || data.length === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const cohorts = data
            .filter((row) => row !== null && typeof row === "object" && Array.isArray(row.values))
            .map((row) => ({
                category: String(row.category ?? ""),
                tooltipLabel:
                    typeof row.tooltipLabel === "string" && row.tooltipLabel !== ""
                        ? row.tooltipLabel
                        : String(row.category ?? ""),
                class: typeof row.class === "string" ? row.class : "",
                values: row.values
                    .map((value) => Number(value))
                    .filter((value) => Number.isFinite(value))
                    .sort(ascending),
            }))
            .filter((row) => row.category !== "" && row.values.length > 0)
            .map((row) => {
                const stats = this._computeStats(row.values);
                return { ...row, ...stats };
            });

        if (cohorts.length === 0) {
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
            .domain(cohorts.map((row) => row.category))
            .range(isVertical ? [0, innerWidth] : [0, innerHeight])
            .padding(this._boxPadding);

        const valueExtent = [
            d3Min(cohorts, (row) => row.min) ?? 0,
            d3Max(cohorts, (row) => row.max) ?? 1,
        ];

        const linear = scaleLinear()
            .domain(valueExtent)
            .nice()
            .range(isVertical ? [innerHeight, 0] : [0, innerWidth]);

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-box-plot")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Box plot chart");

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        // Category axis (X for vertical, Y for horizontal). Drop
        // the D3 baseline (path.domain) but keep the per-tick stub
        // lines so the cohort boundaries read as anchored ticks
        // (CSS controls their colour, mirroring the line-chart
        // x-axis treatment).
        const categoryAxisGroup = inner
            .append("g")
            .attr("class", isVertical ? "x-axis" : "y-axis")
            .attr("transform", isVertical ? `translate(0, ${innerHeight})` : "translate(0, 0)")
            .call(isVertical ? axisBottom(categorical) : axisLeft(categorical));
        categoryAxisGroup.select(".domain").remove();

        // Append the sample-size label as a sibling of each tick's
        // existing category text — keeps the n= number anchored to
        // the axis (not the box) so hover dimming of a cohort does
        // not visually drag the count with it. Matched to the
        // cohort by category name via the tick's datum. Absolute
        // positioning via `y` + `dominant-baseline`; `dy` is not
        // re-applied here so re-renders cannot drift.
        const safeCohorts = Array.isArray(cohorts) ? cohorts : [];
        const cohortByCategory = new Map(
            safeCohorts
                .filter((row) => row !== null && typeof row === "object")
                .map((row) => [String(row.category ?? ""), row]),
        );
        categoryAxisGroup
            .selectAll(".tick")
            .append("text")
            .attr("class", "sample-size")
            .attr("text-anchor", isVertical ? "middle" : "end")
            .attr("dominant-baseline", isVertical ? "hanging" : "middle")
            .attr("x", isVertical ? 0 : -8)
            .attr("y", isVertical ? 22 : 16)
            .text((category) => {
                const row = cohortByCategory.get(String(category ?? ""));
                const count = Array.isArray(row?.values) ? row.values.length : 0;

                return count > 0 ? `n=${count}` : "";
            });

        // Value axis. `tickSize(-innerWidth)` (or `-innerHeight` for
        // the horizontal orientation) turns each tick line into a
        // gridline that spans the plot area, giving the eye an
        // anchor for reading box positions; the baseline path is
        // still dropped because grid + card border already frame
        // the chart.
        const gridSpan = isVertical ? -innerWidth : -innerHeight;
        const valueAxisGroup = inner
            .append("g")
            .attr("class", isVertical ? "y-axis y-axis--grid" : "x-axis x-axis--grid")
            .attr("transform", isVertical ? "translate(0, 0)" : `translate(0, ${innerHeight})`)
            .call(
                (isVertical ? axisLeft(linear) : axisBottom(linear))
                    .ticks(5)
                    .tickSize(gridSpan)
                    .tickPadding(8)
                    .tickFormat((value) => Number(value).toLocaleString()),
            );
        valueAxisGroup.select(".domain").remove();

        const boxes = inner
            .append("g")
            .attr("class", "boxes")
            .selectAll("g.cohort")
            .data(cohorts)
            .enter()
            .append("g")
            .attr("class", (row) => (row.class === "" ? "cohort" : `cohort ${row.class}`))
            .attr("transform", (row) =>
                isVertical
                    ? `translate(${categorical(row.category) ?? 0}, 0)`
                    : `translate(0, ${categorical(row.category) ?? 0})`,
            );

        const boxThickness = categorical.bandwidth();
        const centreLine = boxThickness / 2;

        if (isVertical) {
            // Per-cohort hover guides — two faint dashed gridlines
            // that extend the box's P25 / P75 edges across the
            // plot area. Each cohort's group carries its own pair
            // calibrated so the lines reach both plot edges in
            // group-local coordinates. Default transparent; CSS
            // raises opacity when the parent cohort is hovered or
            // selected.
            boxes
                .append("line")
                .attr("class", "box-guide box-guide--p25")
                .attr("x1", (row) => -(categorical(row.category) ?? 0))
                .attr("x2", (row) => innerWidth - (categorical(row.category) ?? 0))
                .attr("y1", (row) => linear(row.q1))
                .attr("y2", (row) => linear(row.q1));

            boxes
                .append("line")
                .attr("class", "box-guide box-guide--p75")
                .attr("x1", (row) => -(categorical(row.category) ?? 0))
                .attr("x2", (row) => innerWidth - (categorical(row.category) ?? 0))
                .attr("y1", (row) => linear(row.q3))
                .attr("y2", (row) => linear(row.q3));

            // Whiskers.
            boxes
                .append("line")
                .attr("class", "whisker")
                .attr("x1", centreLine)
                .attr("x2", centreLine)
                .attr("y1", (row) => linear(row.whiskerLow))
                .attr("y2", (row) => linear(row.whiskerHigh));

            // Whisker caps.
            boxes
                .append("line")
                .attr("class", "whisker-cap whisker-cap--low")
                .attr("x1", centreLine - boxThickness / 4)
                .attr("x2", centreLine + boxThickness / 4)
                .attr("y1", (row) => linear(row.whiskerLow))
                .attr("y2", (row) => linear(row.whiskerLow));

            boxes
                .append("line")
                .attr("class", "whisker-cap whisker-cap--high")
                .attr("x1", centreLine - boxThickness / 4)
                .attr("x2", centreLine + boxThickness / 4)
                .attr("y1", (row) => linear(row.whiskerHigh))
                .attr("y2", (row) => linear(row.whiskerHigh));

            // IQR box.
            boxes
                .append("rect")
                .attr("class", "box")
                .attr("x", 0)
                .attr("width", boxThickness)
                .attr("y", (row) => linear(row.q3))
                .attr("height", (row) => Math.max(1, linear(row.q1) - linear(row.q3)));

            // Median numeric label centred on the median line.
            // Rendered first so getBBox is available for the
            // line-split width measurement below.
            const medianTexts = boxes
                .append("text")
                .attr("class", "median-value")
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", centreLine)
                .attr("y", (row) => linear(row.median))
                .text((row) => row.median.toLocaleString());

            // Median line split into two segments: left of the
            // numeric label and right of it. Gap is measured from
            // the rendered text's bounding box when the host
            // environment can measure SVG geometry (browsers
            // return real widths; jsdom returns a zero-width
            // DOMRect), otherwise falls back to a glyph-count
            // approximation against the rendered locale string at
            // ~6 px per digit. When the rendered label is wider
            // than the band itself, draw a single full-width line
            // and let the text paint over it — splitting would
            // collapse both segments to zero length.
            medianTexts.each(function (row) {
                const bbox = typeof this.getBBox === "function" ? this.getBBox() : null;
                const halfWidth =
                    bbox !== null && bbox.width > 0
                        ? bbox.width / 2
                        : (row.median.toLocaleString().length * 6) / 2;
                const gap = 3;
                const cutLeft = Math.max(0, centreLine - halfWidth - gap);
                const cutRight = Math.min(boxThickness, centreLine + halfWidth + gap);
                const yMedian = linear(row.median);
                const parent = select(/** @type {SVGGElement} */ (this.parentNode));

                if (cutLeft <= 0 && cutRight >= boxThickness) {
                    parent
                        .insert("line", "text.median-value")
                        .attr("class", "median")
                        .attr("x1", 0)
                        .attr("x2", boxThickness)
                        .attr("y1", yMedian)
                        .attr("y2", yMedian);

                    return;
                }

                parent
                    .insert("line", "text.median-value")
                    .attr("class", "median median--left")
                    .attr("x1", 0)
                    .attr("x2", cutLeft)
                    .attr("y1", yMedian)
                    .attr("y2", yMedian);
                parent
                    .insert("line", "text.median-value")
                    .attr("class", "median median--right")
                    .attr("x1", cutRight)
                    .attr("x2", boxThickness)
                    .attr("y1", yMedian)
                    .attr("y2", yMedian);
            });

            // Outlier dots.
            boxes
                .selectAll("circle.outlier")
                .data((row) => row.outliers.map((value) => ({ row, value })))
                .enter()
                .append("circle")
                .attr("class", "outlier")
                .attr("cx", centreLine)
                .attr("cy", (entry) => linear(entry.value))
                .attr("r", 3);
        } else {
            boxes
                .append("line")
                .attr("class", "whisker")
                .attr("y1", centreLine)
                .attr("y2", centreLine)
                .attr("x1", (row) => linear(row.whiskerLow))
                .attr("x2", (row) => linear(row.whiskerHigh));

            boxes
                .append("line")
                .attr("class", "whisker-cap whisker-cap--low")
                .attr("y1", centreLine - boxThickness / 4)
                .attr("y2", centreLine + boxThickness / 4)
                .attr("x1", (row) => linear(row.whiskerLow))
                .attr("x2", (row) => linear(row.whiskerLow));

            boxes
                .append("line")
                .attr("class", "whisker-cap whisker-cap--high")
                .attr("y1", centreLine - boxThickness / 4)
                .attr("y2", centreLine + boxThickness / 4)
                .attr("x1", (row) => linear(row.whiskerHigh))
                .attr("x2", (row) => linear(row.whiskerHigh));

            boxes
                .append("rect")
                .attr("class", "box")
                .attr("y", 0)
                .attr("height", boxThickness)
                .attr("x", (row) => linear(row.q1))
                .attr("width", (row) => Math.max(1, linear(row.q3) - linear(row.q1)));

            boxes
                .append("line")
                .attr("class", "median")
                .attr("y1", 0)
                .attr("y2", boxThickness)
                .attr("x1", (row) => linear(row.median))
                .attr("x2", (row) => linear(row.median));

            // Median numeric label centred on the median line.
            // The horizontal orientation draws a single full-height
            // line behind the label; consumer CSS can carry a
            // background-coloured paint-order stroke under the
            // glyph if a visual break is desired.
            boxes
                .append("text")
                .attr("class", "median-value")
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", (row) => linear(row.median))
                .attr("y", centreLine)
                .text((row) => row.median.toLocaleString());

            boxes
                .selectAll("circle.outlier")
                .data((row) => row.outliers.map((value) => ({ row, value })))
                .enter()
                .append("circle")
                .attr("class", "outlier")
                .attr("cy", centreLine)
                .attr("cx", (entry) => linear(entry.value))
                .attr("r", 3);
        }

        // Hover hit-target — invisible rect covering the box +
        // whisker extent so tooltip surfaces from anywhere in the
        // cohort lane.
        boxes
            .append("rect")
            .attr("class", "hover-target")
            .attr("fill", "transparent")
            .attr("tabindex", "0")
            .attr(
                "aria-label",
                (row) =>
                    `${row.tooltipLabel}: Median ${row.median.toLocaleString()}, P25 ${row.q1.toLocaleString()}, P75 ${row.q3.toLocaleString()}, n=${row.values.length}`,
            )
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", isVertical ? boxThickness : innerWidth)
            .attr("height", isVertical ? innerHeight : boxThickness)
            .on("mouseover", (event, row) => {
                tooltip.show(
                    event,
                    `<strong>${escapeHtml(row.tooltipLabel)}</strong><br>` +
                        `<span class="wt-chart-tooltip__stat">${escapeHtml(`Median ${row.median.toLocaleString()}`)}</span><br>` +
                        `<span class="wt-chart-tooltip__sub">${escapeHtml(`P25 ${row.q1.toLocaleString()} · P75 ${row.q3.toLocaleString()} · n=${row.values.length}`)}</span>`,
                );
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        return svg.node();
    }

    /**
     * Compute the quartile + whisker + outlier breakdown for one cohort. Values
     * arrive pre-sorted in ascending order.
     *
     * @param {number[]} sorted  Ascending sample array
     *
     * @returns {{
     *     min: number,
     *     max: number,
     *     median: number,
     *     q1: number,
     *     q3: number,
     *     whiskerLow: number,
     *     whiskerHigh: number,
     *     outliers: number[]
     * }}
     */
    _computeStats(sorted) {
        const q1 = quantile(sorted, 0.25) ?? sorted[0];
        const median = quantile(sorted, 0.5) ?? sorted[0];
        const q3 = quantile(sorted, 0.75) ?? sorted[sorted.length - 1];
        const iqr = q3 - q1;
        const lowerFence = q1 - this._whiskerMultiplier * iqr;
        const upperFence = q3 + this._whiskerMultiplier * iqr;
        const inFence = sorted.filter((v) => v >= lowerFence && v <= upperFence);
        const whiskerLow = inFence.length > 0 ? inFence[0] : sorted[0];
        const whiskerHigh =
            inFence.length > 0 ? inFence[inFence.length - 1] : sorted[sorted.length - 1];
        const outliers = sorted.filter((v) => v < lowerFence || v > upperFence);
        return {
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median,
            q1,
            q3,
            whiskerLow,
            whiskerHigh,
            outliers,
        };
    }

    /**
     * Remove any svg + placeholder this widget rendered earlier so redraw()
     * never stacks.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-box-plot, :scope > .chart-empty-state",
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
