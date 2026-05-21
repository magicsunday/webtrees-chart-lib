/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { extent, max, min } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { easeCubicOut } from "d3-ease";
import { scaleLinear, scaleOrdinal } from "d3-scale";
import { schemeTableau10 } from "d3-scale-chromatic";
import { select } from "d3-selection";
import { area, curveBasis, stack, stackOffsetSilhouette, stackOrderInsideOut } from "d3-shape";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_MARGIN = { top: 4, right: 16, bottom: 28, left: 16 };
const DEFAULT_HEIGHT = 240;

/**
 * Silhouette stream-graph showing per-decade frequencies of stacked
 * categorical bands (e.g. top-N given names across a tree). Each
 * band is one category; the band's vertical thickness in a column
 * shows that category's count for the decade.
 *
 * Empty/null/undefined data or a series without any names/decades
 * renders the shared empty-state placeholder via BaseWidget.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class StreamGraph extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._height = pickPositive(this.options.height, DEFAULT_HEIGHT);
        this._margin = { ...DEFAULT_MARGIN, ...(this.options.margin ?? {}) };
    }

    /**
     * @param {{
     *     decades: Array<number>,
     *     names:   Array<string>,
     *     series:  Object<string, Object<number, number>>
     * }|null|undefined} data
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        if (
            !data ||
            !Array.isArray(data.decades) ||
            data.decades.length === 0 ||
            !Array.isArray(data.names) ||
            data.names.length === 0
        ) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const height = this._height;
        const margin = this._margin;
        const width = Math.max(
            360,
            pickPositive(this.options.width, this.target.clientWidth) || 900,
        );
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // Transform into the dense row-per-decade shape d3.stack expects.
        const rows = data.decades.map((decade) => {
            const row = { decade };
            data.names.forEach((name) => {
                row[name] = data.series[name]?.[decade] || 0;
            });
            return row;
        });

        const series = stack()
            .keys(data.names)
            .offset(stackOffsetSilhouette)
            .order(stackOrderInsideOut)(rows);

        const xScale = scaleLinear()
            .domain(extent(rows, (row) => row.decade))
            .range([0, innerWidth]);

        // Add a small headroom above + below the silhouette envelope
        // so the outermost bands don't touch the SVG edges.
        const yLower = min(series, (band) => min(band, (point) => point[0])) ?? 0;
        const yUpper = max(series, (band) => max(band, (point) => point[1])) ?? 0;
        const yPad = Math.max((yUpper - yLower) * 0.08, 1);
        const yScale = scaleLinear()
            .domain([yLower - yPad, yUpper + yPad])
            .range([innerHeight, 0]);

        const colour = scaleOrdinal().domain(data.names).range(schemeTableau10);

        const areaPath = area()
            .x((point) => xScale(point.data.decade))
            .y0((point) => yScale(point[0]))
            .y1((point) => yScale(point[1]))
            .curve(curveBasis);

        // Flat baseline path for the on-load animation.
        const yMid = yScale((yLower + yUpper) / 2);
        const flatPath = area()
            .x((point) => xScale(point.data.decade))
            .y0(yMid)
            .y1(yMid)
            .curve(curveBasis);

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-stream-graph")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Stream graph");

        // Centre inner content vertically inside the SVG. The bottom
        // margin holds the x-axis tick labels; without a top
        // counterpart the rendered <g> bounding box drifts downward
        // by half the asymmetry. A small upward shim brings the bbox
        // back to centre, derived from the margins so a future caller
        // that swaps in different margins still gets a centred chart.
        const verticalCentringShim = Math.round((margin.bottom - margin.top) / 2);
        const inner = svg
            .append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top - verticalCentringShim})`);

        const bandTotals = new Map(
            series.map((band) => [
                band.key,
                band.reduce((sum, point) => sum + (point[1] - point[0]), 0),
            ]),
        );

        const peakDecade = (band) => {
            let bestDecade = band[0]?.data?.decade ?? null;
            let bestSize = -Infinity;
            band.forEach((point) => {
                const size = point[1] - point[0];
                if (size > bestSize) {
                    bestSize = size;
                    bestDecade = point.data.decade;
                }
            });
            return bestDecade;
        };

        const bands = inner
            .selectAll("path.band")
            .data(series)
            .enter()
            .append("path")
            .attr("class", "band")
            .attr("data-name", (band) => band.key)
            .attr("fill", (band) => colour(band.key))
            .attr("opacity", 0)
            .attr("d", flatPath)
            .attr("tabindex", "0")
            .attr("aria-label", (band) => {
                const total = Math.round(bandTotals.get(band.key) ?? 0);
                return `${band.key}: ${total} individuals, peak in the ${peakDecade(band)}s`;
            });

        bands
            .transition("stream-graph-enter")
            .duration(900)
            .delay((_, index) => index * 40)
            .ease(easeCubicOut)
            .attr("opacity", 0.85)
            .attr("d", areaPath);

        const bandTooltipHtml = (band) => {
            const total = Math.round(bandTotals.get(band.key) ?? 0);
            const peak = peakDecade(band);
            return (
                `<strong>${escapeHtml(band.key)}</strong><br>` +
                `<span class="wt-chart-tooltip__stat">${total} individual${total === 1 ? "" : "s"}</span><br>` +
                `<span class="wt-chart-tooltip__meta">peak in the ${peak}s</span>`
            );
        };

        bands
            .on("mouseover", (event, band) => tooltip.show(event, bandTooltipHtml(band)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide())
            .on("focus", (event, band) => {
                // Keyboard focus has no cursor; pin to the band's top edge.
                const bbox = event.target.getBoundingClientRect();
                tooltip.show(
                    { clientX: bbox.left + bbox.width / 2, clientY: bbox.top + 12 },
                    bandTooltipHtml(band),
                );
            })
            .on("blur", () => tooltip.hide());

        // Click → toggle selection on the band's series key. The
        // predicate's `name` matches StreamGraph's payload key so
        // dashboard-bus consumers can derive whatever filter shape
        // they need.
        const self = this;
        bands.style("cursor", "pointer").on("click", function onClick(_event, band) {
            const { predicate } = self._emitSelection({ name: band.key });
            self._applyStreamSelectionStyles(bands, predicate);
        });

        inner
            .append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(
                axisBottom(xScale)
                    .ticks(Math.min(rows.length, 8))
                    .tickFormat((decade) => `${decade}s`),
            );

        // Hide the y axis: a stream graph reads as relative magnitudes;
        // absolute counts live in the band tooltips.
        inner.append("g").attr("class", "y-axis").call(axisLeft(yScale).ticks(0).tickSize(0));

        return svg.node();
    }

    /**
     * Remove any svg + empty-state placeholder this widget rendered
     * earlier so redraw() never stacks or leaves cross-state remnants.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-stream-graph, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }

    /**
     * Toggle `.is-selected` on the band matching the predicate's
     * series key, fading the rest to 0.5 opacity. Cleared
     * selection restores the default.
     *
     * @param {import("d3-selection").Selection<SVGPathElement, {key: string}, SVGGElement, unknown>} bands
     * @param {object|null} predicate
     */
    _applyStreamSelectionStyles(bands, predicate) {
        if (predicate === null) {
            bands.classed("is-selected", false).style("opacity", 1);
            return;
        }
        bands
            .classed("is-selected", (band) => band.key === predicate.name)
            .style("opacity", (band) => (band.key === predicate.name ? 1 : 0.5));
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
