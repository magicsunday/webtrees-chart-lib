/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { extent, max } from "d3-array";
import { axisBottom } from "d3-axis";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { pickPositive } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 130,
    // Symmetric padding; the dot row sits at the top, the year axis below it.
    margin: { top: 12, right: 16, bottom: 12, left: 16 },
};

// Dot diameter scales linearly with the magnitude between these bounds; the
// magnitude is printed inside the dot, so even the smallest mark stays legible.
const DIAMETER_MIN = 14;
const DIAMETER_SPAN = 30;
const MAX_RADIUS = (DIAMETER_MIN + DIAMETER_SPAN) / 2;

// Gap from the largest dot's lower edge down to the year-axis tick labels.
const AXIS_GAP = 8;

/**
 * Event-timeline widget for a sparse set of `{year, value}` marks laid out
 * along a horizontal year axis. Each mark is a dot positioned by its year, its
 * diameter scaled by the magnitude, with the magnitude printed inside the dot;
 * a few round-year ticks anchor the time axis below. Built for a handful of
 * events spread across a wide span of years — a year-keyed timeline of
 * occurrences, not a dense series. Per-dot year captions are intentionally
 * omitted so closely-spaced years never collide; the consumer pairs the chart
 * with a textual list when the exact years need spelling out.
 *
 * The widget is presentation-only: the payload arrives pre-aggregated from the
 * consumer and each mark renders where its year places it. A mark carries an
 * optional per-row `class` (a CSS palette hook) and a `tooltip` / `tooltipLabel`
 * pair that, when set, overrides the default `year` header and `value`
 * body — the same conventions as {@see BarChart} and {@see LineChart}.
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget ships no
 * opinionated palette): `.msc-event-timeline` (root svg) wraps one inner `<g>`.
 * The horizontal rule the dots sit on is `line.msc-event-timeline-baseline`. The
 * dots live in `<g class="msc-event-timeline-dots">` as `circle.msc-event-timeline-dot`
 * elements, each also carrying the per-row `class` string when supplied and
 * painted with the `accent` colour; the magnitude printed inside each dot is a
 * `text.msc-event-timeline-count`. The year axis is a
 * `<g class="msc-event-timeline-axis">` whose tick labels are years (the d3
 * baseline path and tick stubs are dropped at render time).
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class EventTimeline extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     accent?: string,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options, {
            margin: DEFAULT_OPTIONS.margin,
            ariaLabel: "Event timeline",
        });
        // Paint-bearing widget: activate the accent accessor so the dots take
        // the caller's colour (default `currentColor`).
        this.accent = this.options.accent;
    }

    /**
     * @param {Array<{year: number, value: number, class?: string, tooltip?: string, tooltipLabel?: string}>|null|undefined} data
     *   Year-keyed marks in any order. `class` is applied as an extra class on
     *   the `<circle>` so consumer CSS can colour individual dots. `tooltip`
     *   overrides the default magnitude rendering, `tooltipLabel` the default
     *   year header, inside the chart-lib tooltip.
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        if (!Array.isArray(data) || data.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const marks = data
            .filter((row) => row !== null && typeof row === "object")
            .map((row) => ({
                year: Number(row.year ?? Number.NaN),
                value: Number(row.value ?? 0),
                class: typeof row.class === "string" ? row.class : "",
                tooltip: typeof row.tooltip === "string" ? row.tooltip : "",
                tooltipLabel: typeof row.tooltipLabel === "string" ? row.tooltipLabel : "",
            }))
            .filter(
                (row) => Number.isFinite(row.year) && Number.isFinite(row.value) && row.value > 0,
            )
            .sort((a, b) => a.year - b.year);

        if (marks.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const height =
            pickPositive(this._height, this.target.clientHeight) || DEFAULT_OPTIONS.height;
        const width = Math.max(240, pickPositive(this._width, this.target.clientWidth) || 600);
        const margin = this._margin;
        const innerWidth = width - margin.left - margin.right;

        // A single year (or several marks in the same year) has no extent, so
        // pad the domain symmetrically; otherwise the dot(s) would collapse to
        // one edge. The range is inset by the largest radius so an edge dot is
        // never clipped against the plot border.
        const [minYear, maxYear] = extent(marks, (row) => row.year);
        const domain = minYear === maxYear ? [minYear - 1, maxYear + 1] : [minYear, maxYear];
        const x = scaleLinear()
            .domain(domain)
            .range([MAX_RADIUS, Math.max(MAX_RADIUS, innerWidth - MAX_RADIUS)]);

        const valueMax = max(marks, (row) => row.value) ?? 1;
        const radiusOf = (value) => (DIAMETER_MIN + (value / valueMax) * DIAMETER_SPAN) / 2;

        const baselineY = MAX_RADIUS + 4;
        const axisY = baselineY + MAX_RADIUS + AXIS_GAP;

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "msc-event-timeline")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel);

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        // The timeline rule the dots sit on, drawn first so the dots overlay it.
        inner
            .append("line")
            .attr("class", "msc-event-timeline-baseline")
            .attr("x1", 0)
            .attr("x2", innerWidth)
            .attr("y1", baselineY)
            .attr("y2", baselineY);

        // Round-year tick axis. The d3 baseline path and tick stubs are dropped;
        // only the year labels remain so closely-spaced marks read against a
        // stable scale instead of per-dot captions that would collide.
        const axisGroup = inner
            .append("g")
            .attr("class", "msc-event-timeline-axis")
            .attr("transform", `translate(0, ${axisY})`)
            .call(
                axisBottom(x)
                    .ticks(5)
                    // Blank any fractional tick d3 emits when the year span is
                    // small (a single- or few-year domain), so only whole years
                    // ever label the axis.
                    .tickFormat((value) => (Number.isInteger(value) ? `${value}` : "")),
            );
        axisGroup.select(".domain").remove();
        axisGroup.selectAll(".tick line").remove();

        const dots = inner
            .append("g")
            .attr("class", "msc-event-timeline-dots")
            .selectAll("circle.msc-event-timeline-dot")
            .data(marks)
            .enter()
            .append("circle")
            .attr("class", (row) =>
                row.class === "" ? "msc-event-timeline-dot" : `msc-event-timeline-dot ${row.class}`,
            )
            .attr("cx", (row) => x(row.year))
            .attr("cy", baselineY)
            .attr("fill", this._accent)
            .attr("tabindex", "0")
            .attr("aria-label", (row) => `${row.year}: ${row.value.toLocaleString()}`);

        // Magnitude printed inside each dot.
        const counts = inner
            .append("g")
            .attr("class", "msc-event-timeline-counts")
            .selectAll("text.msc-event-timeline-count")
            .data(marks)
            .enter()
            .append("text")
            .attr("class", "msc-event-timeline-count")
            .attr("x", (row) => x(row.year))
            .attr("y", baselineY)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .text((row) => row.value.toLocaleString());

        dots.on("mouseover", (event, row) => {
            const header = row.tooltipLabel === "" ? row.year.toString() : row.tooltipLabel;
            const body =
                row.tooltip === ""
                    ? escapeHtml(row.value.toLocaleString())
                    : escapeHtml(row.tooltip);
            tooltip.show(
                event,
                `<strong>${escapeHtml(header)}</strong><br>` +
                    `<span class="msc-chart-tooltip__stat">${body}</span>`,
            );
        })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        // Entry: grow each dot from the baseline and fade its count in.
        dots.attr("r", 0);
        counts.attr("opacity", 0);
        this._runEntry((animate) => {
            this._enter(
                dots,
                animate,
                "event-timeline-dots",
                600,
                (_row, index) => index * 40,
            ).attr("r", (row) => radiusOf(row.value));
            this._enter(
                counts,
                animate,
                "event-timeline-counts",
                600,
                (_row, index) => index * 40,
            ).attr("opacity", 1);
        });

        return svg.node();
    }

    /**
     * Remove any svg + placeholder this widget rendered earlier so redraw()
     * never stacks.
     *
     * @returns {void}
     */
    _clearChart() {
        // Retire any entry closure held for a deferred reveal: a redraw (with
        // data or empty) supersedes the previous draw, so a later playEntry()
        // must not paint the superseded — now removed — nodes.
        this._entry = null;
        for (const node of this.target.querySelectorAll(
            ":scope > svg.msc-event-timeline, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }
}
