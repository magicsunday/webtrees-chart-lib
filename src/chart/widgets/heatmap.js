/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { rgb } from "d3-color";
import { scaleBand } from "d3-scale";
import { interpolateYlOrRd } from "d3-scale-chromatic";
import { select } from "d3-selection";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 240,
    // Matches LineChart's y-axis margin so the heatmap aligns
    // visually with the line cards stacked beside it. The widget
    // shows the short row form ("16th" / "16."), which fits
    // comfortably in 40 px; long-form headers stay reachable
    // through per-cell `tooltipLabel`.
    margin: { top: 12, right: 24, bottom: 32, left: 40 },
    // Default sequential interpolator. Yellow-orange-red is the
    // canonical heat-map ramp — every step has a luminance shift
    // big enough to read, and the top end stops short of pure
    // black so a near-black cell label still survives. Consumer
    // can override via the `interpolator` option (any d3 sequential
    // interpolator or any `(t: number) => string`).
    interpolator: interpolateYlOrRd,
    // Trim the interpolator's domain so the empty cells don't
    // bleach to invisible and the top cells don't black out.
    // 0.05 → light yellow that still reads against body bg; 0.75
    // → strong red with white-label contrast intact.
    colorDomain: [0.05, 0.75],
};

/**
 * Categorical 2-D heatmap. Renders a grid of cells where the cell
 * area is fixed (band scale on both axes) and the colour cue
 * carries the value — designed for cross-tab payloads like
 * `century × child-count-bucket` that read more cleanly as a
 * regular grid than as a treemap.
 *
 * The widget paints structure only; the consumer ships a `class`
 * per cell so the colour scale stays in the host stylesheet and
 * tracks the consumer's design tokens (light / dark / per-bucket
 * gradient). No internal palette assumption.
 *
 * Payload contract:
 *   rows      : list<string>  row labels in display order (y-axis)
 *   rowLabels : list<string>  optional long-form aria/tooltip
 *                             headers per row (defaults to `rows`)
 *   columns   : list<string>  column labels in display order (x-axis)
 *   cells     : list<list<{value: number, class?: string,
 *                          tooltipLabel?: string, tooltip?: string}>>
 *               row-major; cells[r][c] is the value at row r, col c
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class Heatmap extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     interpolator?: (t: number) => string,
     *     colorDomain?: [number, number],
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._height = pickPositive(this.options.height, DEFAULT_OPTIONS.height);
        this._margin = { ...DEFAULT_OPTIONS.margin, ...(this.options.margin ?? {}) };
        this._interpolator =
            typeof this.options.interpolator === "function"
                ? this.options.interpolator
                : DEFAULT_OPTIONS.interpolator;
        this._colorDomain = Array.isArray(this.options.colorDomain)
            ? [
                  Number(this.options.colorDomain[0]) || DEFAULT_OPTIONS.colorDomain[0],
                  Number(this.options.colorDomain[1]) || DEFAULT_OPTIONS.colorDomain[1],
              ]
            : DEFAULT_OPTIONS.colorDomain;
    }

    /**
     * @param {{
     *     rows?: string[],
     *     rowLabels?: string[],
     *     columns?: string[],
     *     cells?: Array<Array<{value: number, class?: string, tooltipLabel?: string, tooltip?: string}>>
     * }|null|undefined} data
     *   `rows[i]` and `columns[j]` are the axis labels in display
     *   order; `rowLabels[i]` is the long-form aria/tooltip header
     *   for row `i` (defaults to `rows[i]`). `cells[r][c]` carries
     *   the per-cell value plus optional `class`/`tooltipLabel`/
     *   `tooltip` overrides.
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        if (data === null || data === undefined || typeof data !== "object") {
            return this.renderEmptyState(this._emptyMessage());
        }

        const rows = Array.isArray(data.rows) ? data.rows.filter((r) => typeof r === "string") : [];
        const columns = Array.isArray(data.columns)
            ? data.columns.filter((c) => typeof c === "string")
            : [];
        const rowLabels = Array.isArray(data.rowLabels) ? data.rowLabels : [];
        const cells = Array.isArray(data.cells) ? data.cells : [];

        if (rows.length === 0 || columns.length === 0 || cells.length === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const margin = this._margin;
        const width = Math.max(
            240,
            pickPositive(this.options.width, this.target.clientWidth) || 600,
        );
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = this._height - margin.top - margin.bottom;

        const x = scaleBand().domain(columns).range([0, innerWidth]).padding(0.05);
        const y = scaleBand().domain(rows).range([0, innerHeight]).padding(0.05);

        // Scan the cell grid for the global maximum so the colour
        // scale's domain is data-driven; an empty grid (all zeros)
        // falls back to 1 so the scale stays defined and every
        // empty cell renders as the lightest tone.
        let maxValue = 0;
        for (const row of cells) {
            if (!Array.isArray(row)) {
                continue;
            }
            for (const cell of row) {
                const value = Number(cell?.value);
                if (Number.isFinite(value) && value > maxValue) {
                    maxValue = value;
                }
            }
        }
        if (maxValue <= 0) {
            maxValue = 1;
        }

        // Trim the interpolator's domain so the lightest tone still
        // reads against the body background and the darkest tone
        // keeps the white-on-blue label contrast above 4.5:1.
        //
        // Use a √(value/max) ramp instead of linear: family-count
        // distributions are heavy-tailed (one or two big buckets
        // dominate the maximum), and linear scaling pushes every
        // small count into the same near-white shade. Sqrt spreads
        // the low end across more of the perceptual range so 1, 2
        // and 3 families paint clearly distinct tones, while the
        // top end compresses but stays visually anchored at the
        // darkest stop.
        const [domainStart, domainEnd] = this._colorDomain;
        const interpolator = this._interpolator;

        const fillFor = (value) => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric <= 0) {
                return interpolator(domainStart);
            }
            const t = Math.sqrt(numeric / maxValue);
            const clamped = Math.min(Math.max(t, 0), 1);
            return interpolator(domainStart + clamped * (domainEnd - domainStart));
        };

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-heatmap")
            .attr("viewBox", `0 0 ${width} ${this._height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Heatmap");

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        // Cell rectangles. We iterate row-by-row so the consumer's
        // row-major `cells[r][c]` order matches the DOM order — keeps
        // a downstream consumer that reads the SVG back in line with
        // the input data.
        const cellRows = inner
            .append("g")
            .attr("class", "cells")
            .selectAll("g.row")
            .data(rows)
            .enter()
            .append("g")
            .attr("class", "row")
            .attr("transform", (_row, i) => `translate(0, ${y(rows[i]) ?? 0})`)
            .attr("data-row", (_row, i) => rows[i] ?? "");

        cellRows
            .selectAll("rect.cell")
            .data((_row, rowIndex) =>
                columns.map((col, colIndex) => ({
                    row: rows[rowIndex] ?? "",
                    column: col,
                    payload: cells[rowIndex]?.[colIndex] ?? { value: 0 },
                })),
            )
            .enter()
            .append("rect")
            .attr("class", (entry) => {
                const cls = typeof entry.payload?.class === "string" ? entry.payload.class : "";
                return cls === "" ? "cell" : `cell ${cls}`;
            })
            .attr("x", (entry) => x(entry.column) ?? 0)
            .attr("y", 0)
            .attr("width", x.bandwidth())
            .attr("height", y.bandwidth())
            // Per-value inline fill: the colour cue is computed from
            // the cell's numeric value, not from the consumer's CSS
            // class. Two cells with the same value paint identically
            // regardless of column; two cells with different values
            // paint distinctly even when the difference is one unit.
            .attr("fill", (entry) => fillFor(entry.payload?.value))
            .attr("tabindex", "0")
            .attr("aria-label", (entry) => {
                if (
                    typeof entry.payload?.tooltipLabel === "string" &&
                    entry.payload.tooltipLabel !== ""
                ) {
                    return `${entry.payload.tooltipLabel}: ${(entry.payload.value ?? 0).toLocaleString()}`;
                }
                return `${entry.row} / ${entry.column}: ${(entry.payload.value ?? 0).toLocaleString()}`;
            })
            .on("mouseover", (event, entry) => {
                const header =
                    typeof entry.payload?.tooltipLabel === "string" &&
                    entry.payload.tooltipLabel !== ""
                        ? entry.payload.tooltipLabel
                        : `${entry.row} / ${entry.column}`;
                const body =
                    typeof entry.payload?.tooltip === "string" && entry.payload.tooltip !== ""
                        ? entry.payload.tooltip
                        : (entry.payload.value ?? 0).toLocaleString();
                tooltip.show(
                    event,
                    `<strong>${escapeHtml(header)}</strong><br><span class="wt-chart-tooltip__stat">${escapeHtml(body)}</span>`,
                );
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        // Cell value labels — only painted when the cell is wide
        // enough to host a 2-digit number without truncation. Keeps
        // the heatmap legible on narrow viewports where the cell
        // becomes a colour-only marker.
        if (x.bandwidth() >= 24 && y.bandwidth() >= 16) {
            cellRows
                .selectAll("text.cell-label")
                .data((_row, rowIndex) =>
                    columns.map((col, colIndex) => ({
                        column: col,
                        value: cells[rowIndex]?.[colIndex]?.value ?? 0,
                    })),
                )
                .enter()
                .append("text")
                .attr("class", "cell-label")
                .attr("x", (entry) => (x(entry.column) ?? 0) + x.bandwidth() / 2)
                .attr("y", y.bandwidth() / 2)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                // Per-cell contrast: probe the rect's fill and pick a
                // white or near-black label so it survives on every
                // band of the gradient. Same luminance gate the WCAG
                // contrast utilities use, so the threshold tracks the
                // body-colour pair used by other widgets.
                .attr("fill", (entry) => labelContrast(fillFor(entry.value)))
                .text((entry) => (entry.value > 0 ? entry.value.toLocaleString() : ""));
        }

        // Row labels on the left (y-axis). Display the short row
        // key ("16th" / "16.") so the axis stays narrow; the
        // long-form `rowLabels[i]` stays reachable through the
        // axis-text aria-label and through each cell's tooltip
        // header, so screen readers still hear the full century
        // noun.
        inner
            .append("g")
            .attr("class", "y-axis")
            .selectAll("text.row-label")
            .data(rows)
            .enter()
            .append("text")
            .attr("class", "row-label")
            .attr("x", -8)
            .attr("y", (row) => (y(row) ?? 0) + y.bandwidth() / 2)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "middle")
            .attr("aria-label", (_row, i) => rowLabels[i] ?? rows[i] ?? "")
            .text((row) => row);

        // Column labels along the bottom (x-axis).
        inner
            .append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${innerHeight + 4})`)
            .selectAll("text.column-label")
            .data(columns)
            .enter()
            .append("text")
            .attr("class", "column-label")
            .attr("x", (col) => (x(col) ?? 0) + x.bandwidth() / 2)
            .attr("y", 12)
            .attr("text-anchor", "middle")
            .text((col) => col);

        return svg.node();
    }

    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-heatmap, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }

    _emptyMessage() {
        const fromOption = this.options.emptyMessage;
        if (typeof fromOption === "string" && fromOption !== "") {
            return fromOption;
        }
        const dataAttr = this.target.dataset?.emptyMessage;
        return typeof dataAttr === "string" && dataAttr !== "" ? dataAttr : "No data available.";
    }
}

/**
 * @param {unknown} value
 * @param {number}  fallback
 * @returns {number}
 */
function pickPositive(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Pick a label colour (white or near-black) that survives against
 * the cell fill. Uses the relative-luminance formula so dark and
 * light backgrounds each get their own contrast partner.
 *
 * @param {string} backgroundFill A CSS colour string the rect uses
 *                                as its `fill` (rgb(), hex, …).
 * @returns {string}
 */
function labelContrast(backgroundFill) {
    const c = rgb(backgroundFill);
    if (!Number.isFinite(c.r) || !Number.isFinite(c.g) || !Number.isFinite(c.b)) {
        return "currentColor";
    }
    const luminance = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    return luminance > 0.55 ? "rgb(33, 37, 41)" : "rgb(255, 255, 255)";
}
