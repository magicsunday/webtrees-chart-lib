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
import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { pickPositive } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    width: 720,
    height: 460,
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
 * Clicking a cell emits `{dimension: "cell", row: <rowLabel>, col: <colLabel>}`
 * to the shared selection bus for cross-widget filtering.
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
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.width = this.options.width;
        this.height = this.options.height;
        this.accent = this.options.accent;
        this.valueLabel = this.options.valueLabel;
        this.ariaLabel = this.options.ariaLabel;
        this.emptyMessage = this.options.emptyMessage;
    }

    /**
     * The explicit SVG width in pixels, or `undefined` to size responsively to
     * the host element's width at draw time.
     *
     * @returns {number|undefined}
     */
    get width() {
        return this._width;
    }

    /**
     * @param {number|undefined} value An explicit width in pixels; a missing or
     *   non-positive value clears the override so draw falls back to the host
     *   element's width. The runtime guard keeps the JSON dispatcher safe.
     */
    set width(value) {
        this._width =
            typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
    }

    /**
     * The nominal SVG height in pixels. A non-positive or non-finite value falls
     * back to the default. The grid's actual rendered height follows from the
     * cell aspect and row count, so this is the layout's baseline extent.
     *
     * @returns {number}
     */
    get height() {
        return this._height;
    }

    /**
     * @param {number|undefined} value The SVG height in pixels; a missing or
     *   non-positive value resets to the default. The runtime guard keeps the
     *   JSON dispatcher (which assigns untyped values) safe.
     */
    set height(value) {
        this._height = pickPositive(value, DEFAULT_OPTIONS.height);
    }

    /**
     * The cell fill colour. A non-string or empty value falls back to
     * `currentColor` so the grid always paints.
     *
     * @returns {string}
     */
    get accent() {
        return this._accent;
    }

    /**
     * @param {string|undefined} value The accent colour (any CSS colour string);
     *   a missing or empty value resets to `currentColor`. The runtime guard
     *   keeps the JSON dispatcher (which assigns untyped values) safe.
     */
    set accent(value) {
        this._accent = typeof value === "string" && value !== "" ? value : "currentColor";
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
     * The accessible name applied to the chart's root `<svg>`. An empty value
     * leaves the `aria-label` attribute off entirely.
     *
     * @returns {string}
     */
    get ariaLabel() {
        return this._ariaLabel;
    }

    /**
     * @param {string|undefined} value The aria-label; a non-string value resets
     *   to an empty string (which omits the attribute). The runtime guard keeps
     *   the JSON dispatcher (which assigns untyped values) safe.
     */
    set ariaLabel(value) {
        this._ariaLabel = typeof value === "string" ? value : "";
    }

    /**
     * The placeholder text shown when the payload is empty or malformed. A
     * non-string or empty value falls back to an empty string.
     *
     * @returns {string}
     */
    get emptyMessage() {
        return this._emptyMessage;
    }

    /**
     * @param {string|undefined} value The placeholder text; a missing or empty
     *   value resets to an empty string. The runtime guard keeps the JSON
     *   dispatcher (which assigns untyped values) safe.
     */
    set emptyMessage(value) {
        this._emptyMessage = typeof value === "string" && value !== "" ? value : "";
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
        this._clearChart();

        // Retire any reveal entry held from a prior render: its closure captured
        // the now-removed <rect> nodes, so a later playEntry() would animate
        // detached nodes. The empty-state path below returns before _runEntry, so
        // clearing here (not only on the draw-through path) covers it too.
        this._entry = null;

        const model = sanitize(data);

        if (model === null) {
            return this.renderEmptyState(this._emptyMessage);
        }

        // Explicit width wins; otherwise size responsively to the host element,
        // falling back to the default when neither is available.
        const W = pickPositive(this._width, this.target.clientWidth) || DEFAULT_OPTIONS.width;
        const { rows, cols, colTitles, values } = model;

        // Left gutter for row labels, shallow top gutter for the horizontal
        // column labels.
        const padLeft = 64;
        const padTop = 28;
        const padRight = 12;
        const padBottom = 14;

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

        const root = select(this.target).append("div").attr("class", "wt-stat-heatmap");

        const svg = root
            .append("svg")
            .attr("class", "wt-stat-heatmap-svg")
            .attr("viewBox", `0 0 ${W} ${H}`)
            // Top-align: when the host reserves more height than the grid needs,
            // the cells stay anchored at the top rather than floating in the
            // vertical centre with a gap above the column labels.
            .attr("preserveAspectRatio", "xMidYMin meet")
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel === "" ? null : this._ariaLabel);

        // Group the plot into nested <g> layers under one wrapper, in paint
        // order: the cell grid first, then the column and row label gutters.
        const inner = svg.append("g").attr("class", "wt-stat-heatmap-inner");
        const cellG = inner.append("g").attr("class", "wt-stat-heatmap-cells");
        const valueG = inner.append("g").attr("class", "wt-stat-heatmap-values");
        const colG = inner.append("g").attr("class", "wt-stat-heatmap-cols");
        const rowG = inner.append("g").attr("class", "wt-stat-heatmap-rows");

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
        colG.selectAll("text.wt-stat-heatmap-col")
            .data(cols)
            .enter()
            .append("text")
            .attr("class", "wt-stat-heatmap-col")
            .attr("x", (_col, i) => (xBand(String(i)) ?? 0) + cellW / 2)
            .attr("y", padTop - 10)
            .attr("text-anchor", "middle")
            .text((col) => col);

        // Row labels down the left gutter.
        rowG.selectAll("text.wt-stat-heatmap-row")
            .data(rows)
            .enter()
            .append("text")
            .attr("class", "wt-stat-heatmap-row")
            .attr("x", padLeft - 10)
            .attr("y", (_row, i) => (yBand(String(i)) ?? 0) + cellH / 2)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "central")
            .text((row) => row);

        const tooltip = createChartTooltip();
        const tip = (rowLabel, colTitle, value) => {
            const label = this._valueLabel === "" ? "" : ` ${escapeHtml(this._valueLabel)}`;
            // Count and unit share one stat span; the column uses its verbose
            // title (e.g. "March"), not the compact axis label.
            return (
                `<strong>${escapeHtml(rowLabel)} · ${escapeHtml(colTitle)}</strong><br>` +
                `<span class="wt-chart-tooltip__stat">${value.toLocaleString()}${label}</span>`
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
                tooltip.show(event, tip(c.rowLabel, c.colTitle, c.value)),
            )
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide())
            .on("click", (_event, c) =>
                this._emitSelection({
                    dimension: "cell",
                    row: c.rowLabel,
                    col: c.colLabel,
                }),
            );

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
            .selectAll("text.wt-stat-heatmap-value")
            .data(cells)
            .enter()
            .append("text")
            .attr("class", "wt-stat-heatmap-value")
            .classed(
                "wt-stat-heatmap-value--on-dark",
                (c) => c.value > 0 && intensity(c.value) > 0.6,
            )
            .attr("x", (c) => c.x + cellW / 2)
            .attr("y", (c) => c.y + cellH / 2)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .text((c) => (c.value > 0 ? c.value.toLocaleString() : ""));

        return root.node();
    }

    /** @private */
    _clearChart() {
        select(this.target).selectAll("div.wt-stat-heatmap").remove();
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
