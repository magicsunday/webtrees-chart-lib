/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { max as d3Max } from "d3-array";
import { scaleBand, scaleLinear } from "d3-scale";
import { select } from "d3-selection";

import BaseWidget from "./base-widget.js";
import { createChartTooltip, escapeHtml } from "../tooltip.js";

/**
 * Heatmap — a rows × columns grid of count cells, each tinted by its value
 * within a single accent hue (the hotter the cell, the more saturated). Built
 * for a decade × month event matrix: one row per decade, twelve month columns,
 * the cell carrying how many births / deaths fell in that decade-and-month.
 *
 * The whole grid shares ONE value scale (the peak cell across the entire
 * matrix), so cell intensity is directly comparable everywhere. A zero cell
 * keeps a faint baseline tint so the grid reads as a continuous field rather
 * than a sparse scatter of holes.
 *
 * The accent hue comes from `options.accent` — a CSS colour literal (e.g. a
 * `var(--ochre)` custom-property reference) used as the cell fill, with the
 * count driving fill-opacity. It defaults to `currentColor` when unset.
 *
 * Clicking a cell emits `{dimension: "decadeMonth", decade: <row>, month:
 * <col>}` to the shared selection bus for cross-widget filtering.
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
     *     accent?: string,
     *     valueLabel?: string,
     *     ariaLabel?: string,
     *     emptyMessage?: string,
     *     source?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);

        const { width, height } = this.dimensions({ width: 720, height: 460 });
        this._width = width;
        this._height = height;
        this._accent =
            typeof this.options.accent === "string" && this.options.accent !== ""
                ? this.options.accent
                : "currentColor";
        this._valueLabel =
            typeof this.options.valueLabel === "string" ? this.options.valueLabel : "";
        this._ariaLabel = typeof this.options.ariaLabel === "string" ? this.options.ariaLabel : "";
    }

    /**
     * @param {{rows: Array<string>, cols: Array<string>, values: Array<Array<number>>}|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        // Retire any reveal entry held from a prior render: its closure captured
        // the now-removed <rect> nodes, so a later playEntry() would animate
        // detached nodes. The empty-state path below returns before _runEntry, so
        // clearing here (not only on the draw-through path) covers it too.
        this._entry = null;

        const model = sanitize(data);

        if (model === null) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const W = this._width;
        const { rows, cols, values } = model;

        // Left gutter holds the row (decade) labels, the top gutter the column
        // (month) labels. The month labels are full localised names rotated -45°
        // so a twelve-column grid stays legible even in a half-width card, which
        // is why the top gutter is deep; a small right/bottom margin keeps the
        // outer cells off the viewBox edge.
        const padLeft = 64;
        const padTop = 64;
        const padRight = 12;
        const padBottom = 14;

        // The decade axis is unbounded — a deep tree spans dozens of decade
        // rows. A fixed height would crush them into unreadable hairlines, so
        // the viewBox grows to hold at least MIN_ROW_HEIGHT per row; the card
        // simply gets taller. The configured height stays the floor so a
        // shallow tree keeps its compact, well-proportioned grid.
        const minRowHeight = 18;
        const H = Math.max(this._height, padTop + padBottom + rows.length * minRowHeight);

        const root = select(this.target).append("div").attr("class", "wt-stat-heatmap");

        const svg = root
            .append("svg")
            .attr("class", "wt-stat-heatmap-svg")
            .attr("viewBox", `0 0 ${W} ${H}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel === "" ? null : this._ariaLabel);

        // Group the plot into nested <g> layers under one wrapper, in paint
        // order: the cell grid first, then the column and row label gutters.
        const inner = svg.append("g").attr("class", "wt-stat-heatmap-inner");
        const cellG = inner.append("g").attr("class", "wt-stat-heatmap-cells");
        const colG = inner.append("g").attr("class", "wt-stat-heatmap-cols");
        const rowG = inner.append("g").attr("class", "wt-stat-heatmap-rows");

        const xBand = scaleBand()
            .domain(cols)
            .range([padLeft, W - padRight])
            .paddingInner(0.08);
        const yBand = scaleBand()
            .domain(rows)
            .range([padTop, H - padBottom])
            .paddingInner(0.12);

        const cellW = xBand.bandwidth();
        const cellH = yBand.bandwidth();

        const maxValue = d3Max(values, (row) => d3Max(row)) || 1;
        // Map a non-zero count onto a visible tint floor so the smallest count
        // still reads as "present"; zero keeps a separate, fainter baseline.
        const intensity = scaleLinear().domain([0, maxValue]).range([0.18, 1]);

        // Column (month) labels along the top, rotated -45° about their anchor
        // just above each column so full month names never collide.
        colG.selectAll("text.wt-stat-heatmap-col")
            .data(cols)
            .enter()
            .append("text")
            .attr("class", "wt-stat-heatmap-col")
            .attr("text-anchor", "start")
            .attr("transform", (col) => {
                const cx = (xBand(col) ?? 0) + cellW / 2;
                const cy = padTop - 8;
                return `translate(${cx}, ${cy}) rotate(-45)`;
            })
            .text((col) => col);

        // Row (decade) labels down the left gutter.
        rowG.selectAll("text.wt-stat-heatmap-row")
            .data(rows)
            .enter()
            .append("text")
            .attr("class", "wt-stat-heatmap-row")
            .attr("x", padLeft - 10)
            .attr("y", (row) => (yBand(row) ?? 0) + cellH / 2)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "middle")
            .text((row) => row);

        const tooltip = createChartTooltip();
        const tip = (rowLabel, colLabel, value) => {
            const head = `<strong>${escapeHtml(rowLabel)} · ${escapeHtml(colLabel)}</strong><br>`;
            const stat = `<span class="wt-chart-tooltip__stat">${value.toLocaleString()}</span>`;
            const meta =
                this._valueLabel === ""
                    ? ""
                    : ` <span class="wt-chart-tooltip__meta">${escapeHtml(this._valueLabel)}</span>`;
            return head + stat + meta;
        };

        // Flatten the matrix into one cell record per (row, col) so a single
        // data-join drives every rect.
        const cells = [];
        rows.forEach((rowLabel, ri) => {
            cols.forEach((colLabel, ci) => {
                cells.push({
                    rowLabel,
                    colLabel,
                    value: values[ri][ci],
                    x: xBand(colLabel) ?? 0,
                    y: yBand(rowLabel) ?? 0,
                });
            });
        });

        const rects = cellG
            .selectAll("rect.wt-stat-heatmap-cell")
            .data(cells)
            .enter()
            .append("rect")
            .attr("class", "wt-stat-heatmap-cell")
            .attr("x", (c) => c.x)
            .attr("y", (c) => c.y)
            .attr("width", cellW)
            .attr("height", cellH)
            .attr("rx", 2)
            .classed("wt-stat-heatmap-cell--empty", (c) => c.value === 0)
            .style("fill", this._accent)
            // Initial keyframe: every cell starts invisible so a deferred
            // reveal-on-scroll entry holds them hidden (rather than flashing the
            // accent at full opacity) until playEntry fades them in.
            .style("fill-opacity", 0)
            .style("cursor", "pointer")
            .on("mouseover", (event, c) =>
                tooltip.show(event, tip(c.rowLabel, c.colLabel, c.value)),
            )
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide())
            .on("click", (_event, c) =>
                this._emitSelection({
                    dimension: "decadeMonth",
                    decade: c.rowLabel,
                    month: c.colLabel,
                }),
            );

        // Final tint: a zero cell sits at a fixed faint baseline, a counted cell
        // scales within the accent. The cells start at the fill-opacity 0
        // keyframe applied above; the entrance fades that up to the final tint.
        const finalOpacity = (c) => (c.value === 0 ? 0.06 : intensity(c.value));
        this._runEntry((doAnimate) => {
            if (doAnimate) {
                rects
                    .transition()
                    .duration(600)
                    .delay((c) => c.x * 0.12 + c.y * 0.18)
                    .style("fill-opacity", finalOpacity);

                return;
            }

            rects.style("fill-opacity", finalOpacity);
        });

        return root.node();
    }

    /** @private */
    _clearChart() {
        select(this.target).selectAll("div.wt-stat-heatmap").remove();
    }

    /** @private */
    _emptyMessage() {
        return typeof this.options.emptyMessage === "string" && this.options.emptyMessage !== ""
            ? this.options.emptyMessage
            : "";
    }
}

/**
 * Validate + normalise the payload. Returns null when there is no usable data
 * (no rows, no cols, or a malformed shape) so the caller can render the empty
 * state. Negative / non-finite counts are clamped to zero.
 *
 * @param {{rows: Array<string>, cols: Array<string>, values: Array<Array<number>>}|null|undefined} data
 * @returns {{rows: Array<string>, cols: Array<string>, values: Array<Array<number>>}|null}
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

    const values = rows.map((_row, ri) => {
        const row = Array.isArray(rawValues[ri]) ? rawValues[ri] : [];
        return cols.map((_col, ci) => {
            const value = Number(row[ci]);
            return Number.isFinite(value) && value > 0 ? value : 0;
        });
    });

    return { rows, cols, values };
}
