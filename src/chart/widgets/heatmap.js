/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { max as d3Max } from "d3-array";
import { easeCubicInOut } from "d3-ease";
import { scaleBand, scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { createChartTooltip, tooltipHeader, tooltipLines, tooltipStat } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    width: 720,
    height: 460,
    // Left gutter for the row labels, shallow top gutter for the horizontal
    // column labels, thin right / bottom breathing room.
    margin: { top: 28, right: 12, bottom: 14, left: 64 },
};

/**
 * Heatmap — a rows × columns grid of count cells, each tinted by its value
 * within a single accent hue (the hotter the cell, the more saturated). The
 * payload is fully generic: `rows` and `cols` are arbitrary label arrays and
 * `values[rowIdx][colIdx]` is the count for that cell, so the same widget
 * renders any two-dimensional tally (e.g. period × month, category × bucket).
 *
 * The whole grid shares ONE value scale (the peak cell across the entire
 * matrix), so cell intensity is directly comparable everywhere. A zero cell
 * keeps a faint baseline tint so the grid reads as a continuous field rather
 * than a sparse scatter of holes; its count is printed inside the cell.
 *
 * The accent hue comes from `options.accent` — a CSS colour literal (e.g. a
 * `var(--ochre)` custom-property reference) used as the cell fill, with the
 * count driving fill-opacity. It defaults to `currentColor` when unset.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class Heatmap extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     width?: number,
     *     height?: number,
     *     margin?: {top?: number, right?: number, bottom?: number, left?: number},
     *     accent?: string,
     *     valueLabel?: string,
     *     ariaLabel?: string,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options, {
            margin: DEFAULT_OPTIONS.margin,
            emptyMessage: "",
        });
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.accent = this.options.accent;
        this.valueLabel = this.options.valueLabel;
    }

    /**
     * The unit label appended to the count in each cell's tooltip (e.g.
     * "births"). Defaults to an empty string so the tooltip shows the bare
     * count.
     *
     * @returns {string}
     */
    get valueLabel() {
        return this._valueLabel;
    }

    /**
     * @param {string|undefined} value The value-unit label; a non-string value
     *   resets to an empty string. The runtime guard keeps the JSON dispatcher
     *   (which assigns untyped values) safe.
     */
    set valueLabel(value) {
        this._valueLabel = typeof value === "string" ? value : "";
    }

    /**
     * @param {{
     *     rows: Array<string>,
     *     cols: Array<string>,
     *     values: Array<Array<number>>,
     *     colTitles?: Array<string>
     * }|null|undefined} data
     *     `cols` are the compact labels drawn on the axis; the optional
     *     `colTitles` (parallel to `cols`) are the verbose labels shown in the
     *     tooltip, so a column can read "Mar" on the axis but "March" on hover.
     *     Falls back to `cols` when absent or mismatched in length.
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearRoot("div.msc-heatmap");

        const model = sanitize(data);

        if (model === null) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const W = this._resolveWidth(DEFAULT_OPTIONS.width);
        const { rows, cols, colTitles, values } = model;

        // Resolved from the shared margin accessor (left gutter for row labels,
        // top gutter for the column labels, thin right / bottom edge).
        const padLeft = this._margin.left;
        const padTop = this._margin.top;
        const padRight = this._margin.right;
        const padBottom = this._margin.bottom;

        // Bands are keyed by column / row INDEX, not by the label string: two
        // columns can share a label (e.g. a 3-letter month cut where fr
        // "juin"/"juillet" both become "jui"), and a scaleBand keyed on the
        // label would collapse the duplicates onto one position. Built before
        // the height so cellW is known — the row height derives from it below.
        const xBand = scaleBand()
            .domain(cols.map((_col, i) => String(i)))
            .range([padLeft, W - padRight])
            .paddingInner(0.04);
        const cellW = xBand.bandwidth();

        // Fixed cell aspect rather than stretching to a configured height: the
        // row height follows from the cell width and the viewBox grows with the
        // row count. The `- yPaddingInner` term cancels d3's band-step
        // denominator so the height is exactly cellW / cellAspect at any count.
        const cellAspect = 1.4;
        const yPaddingInner = 0.06;
        const rowStep = cellW / cellAspect / (1 - yPaddingInner);
        const H = padTop + padBottom + (rows.length - yPaddingInner) * rowStep;

        const root = select(this.target).append("div").attr("class", "msc-heatmap");

        const svg = root
            .append("svg")
            .attr("class", "msc-heatmap-svg")
            .attr("viewBox", `0 0 ${W} ${H}`)
            // Top-align: when the host reserves more height than the grid needs,
            // the cells stay anchored at the top rather than floating in the
            // vertical centre with a gap above the column labels.
            .attr("preserveAspectRatio", "xMidYMin meet")
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel === "" ? null : this._ariaLabel);

        // Group the plot into nested <g> layers under one wrapper, in paint
        // order: the cell grid first, then the column and row label gutters.
        const inner = svg.append("g").attr("class", "msc-heatmap-inner");
        const cellG = inner.append("g").attr("class", "msc-heatmap-cells");
        const valueG = inner.append("g").attr("class", "msc-heatmap-values");
        const colG = inner.append("g").attr("class", "msc-heatmap-cols");
        const rowG = inner.append("g").attr("class", "msc-heatmap-rows");

        const yBand = scaleBand()
            .domain(rows.map((_row, i) => String(i)))
            .range([padTop, H - padBottom])
            .paddingInner(yPaddingInner);

        const cellH = yBand.bandwidth();

        const maxValue = d3Max(values, (row) => d3Max(row)) || 1;
        // Map a non-zero count onto a visible tint floor so the smallest count
        // still reads as "present"; zero keeps a separate, fainter baseline.
        const intensity = scaleLinear().domain([0, maxValue]).range([0.18, 1]);

        // Column labels, centred over each column.
        colG.selectAll("text.msc-heatmap-col")
            .data(cols)
            .enter()
            .append("text")
            .attr("class", "msc-heatmap-col")
            .attr("x", (_col, i) => (xBand(String(i)) ?? 0) + cellW / 2)
            .attr("y", padTop - 10)
            .attr("text-anchor", "middle")
            .text((col) => col);

        // Row labels down the left gutter.
        rowG.selectAll("text.msc-heatmap-row")
            .data(rows)
            .enter()
            .append("text")
            .attr("class", "msc-heatmap-row")
            .attr("x", padLeft - 10)
            .attr("y", (_row, i) => (yBand(String(i)) ?? 0) + cellH / 2)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "central")
            .text((row) => row);

        const tooltip = createChartTooltip();
        const tip = (rowLabel, colTitle, value) => {
            const label = this._valueLabel === "" ? "" : ` ${this._valueLabel}`;
            // Count and unit share one stat span; the column uses its verbose
            // title (e.g. "March"), not the compact axis label.
            return tooltipLines(
                tooltipHeader(`${rowLabel} · ${colTitle}`),
                tooltipStat(`${value.toLocaleString()}${label}`),
            );
        };

        // Flatten the matrix into one cell record per (row, col) so a single
        // data-join drives every rect.
        const cells = [];
        rows.forEach((rowLabel, ri) => {
            cols.forEach((colLabel, ci) => {
                cells.push({
                    rowLabel,
                    colLabel,
                    colTitle: colTitles[ci],
                    value: values[ri][ci],
                    x: xBand(String(ci)) ?? 0,
                    y: yBand(String(ri)) ?? 0,
                });
            });
        });

        const rects = cellG
            .selectAll("rect.msc-heatmap-cell")
            .data(cells)
            .enter()
            .append("rect")
            .attr("class", "msc-heatmap-cell")
            .attr("x", (c) => c.x)
            .attr("y", (c) => c.y)
            .attr("width", cellW)
            .attr("height", cellH)
            .attr("rx", 2)
            .classed("msc-heatmap-cell--empty", (c) => c.value === 0)
            .style("fill", this._accent)
            // Initial keyframe: every cell starts invisible so a deferred
            // reveal-on-scroll entry holds them hidden (rather than flashing the
            // accent at full opacity) until playEntry fades them in.
            .style("fill-opacity", 0)
            .on("mouseover", (event, c) =>
                tooltip.show(event, tip(c.rowLabel, c.colTitle, c.value)),
            )
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        // Final tint: a zero cell sits at a faint baseline, a counted cell
        // scales within the accent; the entrance fades up to it from 0.
        const finalOpacity = (c) => (c.value === 0 ? 0.06 : intensity(c.value));
        this._runEntry((doAnimate) => {
            this._enter(
                rects,
                doAnimate,
                "heatmap-enter",
                600,
                (c) => c.x * 0.12 + c.y * 0.18,
                // Preserve the original d3 default ease (cubic-in-out) — the
                // previous unnamed .transition() set no ease.
                easeCubicInOut,
            ).style("fill-opacity", finalOpacity);
        });

        // The count printed inside each non-empty cell. On a strongly-tinted
        // cell the text would vanish against the fill, so those carry the
        // `--on-dark` modifier the consumer styles with a light colour.
        valueG
            .selectAll("text.msc-heatmap-value")
            .data(cells)
            .enter()
            .append("text")
            .attr("class", "msc-heatmap-value")
            .classed("msc-heatmap-value--on-dark", (c) => c.value > 0 && intensity(c.value) > 0.6)
            .attr("x", (c) => c.x + cellW / 2)
            .attr("y", (c) => c.y + cellH / 2)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .text((c) => (c.value > 0 ? c.value.toLocaleString() : ""));

        return root.node();
    }
}

/**
 * Validate + normalise the payload. Returns null when there is no usable data
 * (no rows, no cols, or a malformed shape) so the caller can render the empty
 * state. Negative / non-finite counts are clamped to zero. `colTitles` falls
 * back to `cols` unless supplied as a same-length array of verbose labels.
 *
 * @param {{rows: Array<string>, cols: Array<string>, values: Array<Array<number>>, colTitles?: Array<string>}|null|undefined} data
 * @returns {{rows: Array<string>, cols: Array<string>, colTitles: Array<string>, values: Array<Array<number>>}|null}
 */
function sanitize(data) {
    if (data === null || typeof data !== "object") {
        return null;
    }

    const rows = Array.isArray(data.rows) ? data.rows.map(String) : [];
    const cols = Array.isArray(data.cols) ? data.cols.map(String) : [];
    const rawValues = Array.isArray(data.values) ? data.values : [];

    if (rows.length === 0 || cols.length === 0) {
        return null;
    }

    const colTitles =
        Array.isArray(data.colTitles) && data.colTitles.length === cols.length
            ? data.colTitles.map(String)
            : cols;

    const values = rows.map((_row, ri) => {
        const row = Array.isArray(rawValues[ri]) ? rawValues[ri] : [];
        return cols.map((_col, ci) => {
            const value = Number(row[ci]);
            return Number.isFinite(value) && value > 0 ? value : 0;
        });
    });

    return { rows, cols, colTitles, values };
}
