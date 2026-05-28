/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { max as d3Max } from "d3-array";
import { select } from "d3-selection";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    rowHeight: 22,
    barHeight: 14,
    barRadius: 2,
    paddingY: 8,
    centerColumnWidth: 70,
    valueTextWidth: 28,
    barFraction: 0.48,
};

/**
 * Diverging bar chart styled as the design2 reference — each row
 * lays out as a 3-column band: left-anchored bar (negative side),
 * central separator label (the bucket label flanked by hairline
 * rules), right-anchored bar (positive side). No x-axis. The bar
 * length encodes `value / maxValue` against a per-side `barFraction`
 * of the side-column width.
 *
 * Caller supplies rows in display order (top → bottom). Each row's
 * `sign` (`-1` or `+1`) decides which side the bar grows toward.
 *
 * Structure (mirrors the g-grouping convention from
 * mirror-histogram): outer `<g.wt-diverging-inner>` wraps three
 * named sub-groups — `wt-diverging-rules` (centre separator rules),
 * `wt-diverging-bars-left` (negative-sign bars + their values),
 * `wt-diverging-bars-right` (positive-sign bars + their values),
 * and `wt-diverging-labels` (the bucket labels in the centre).
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class DivergingBar extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     width?: number,
     *     rowHeight?: number,
     *     barHeight?: number,
     *     barRadius?: number,
     *     paddingY?: number,
     *     centerColumnWidth?: number,
     *     valueTextWidth?: number,
     *     barFraction?: number,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._rowHeight = pickPositive(this.options.rowHeight, DEFAULT_OPTIONS.rowHeight);
        this._barHeight = pickPositive(this.options.barHeight, DEFAULT_OPTIONS.barHeight);
        this._barRadius = pickPositive(this.options.barRadius, DEFAULT_OPTIONS.barRadius);
        this._paddingY = pickPositive(this.options.paddingY, DEFAULT_OPTIONS.paddingY);
        this._centerColumnWidth = pickPositive(
            this.options.centerColumnWidth,
            DEFAULT_OPTIONS.centerColumnWidth,
        );
        this._valueTextWidth = pickPositive(
            this.options.valueTextWidth,
            DEFAULT_OPTIONS.valueTextWidth,
        );
        this._barFraction = pickFraction(this.options.barFraction, DEFAULT_OPTIONS.barFraction);
    }

    /**
     * @param {Array<{label: string, value: number, sign: -1|1, tooltip?: string, tooltipLabel?: string}>|null|undefined} data
     *   Categorical rows in display order. `value` must be
     *   non-negative; the caller's `sign` (-1 or +1) controls which
     *   side of the centre column the bar grows toward.
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        if (!Array.isArray(data) || data.length === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const rows = data
            .filter((row) => row !== null && typeof row === "object")
            .map((row) => ({
                label: String(row.label ?? ""),
                value: Number(row.value ?? 0),
                sign: row.sign === -1 ? -1 : 1,
                tooltip: typeof row.tooltip === "string" ? row.tooltip : "",
                tooltipLabel: typeof row.tooltipLabel === "string" ? row.tooltipLabel : "",
            }))
            .filter((row) => row.label !== "" && Number.isFinite(row.value) && row.value >= 0);

        if (rows.length === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        // Every retained row carries value=0 → there is nothing to
        // draw. Fall through to the empty-state placeholder so the
        // card body doesn't render a blank centre column.
        if (rows.every((row) => row.value === 0)) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const W = Math.max(300, pickPositive(this.options.width, this.target.clientWidth) || 720);
        const rowH = this._rowHeight;
        const barH = this._barHeight;
        const barRadius = this._barRadius;
        const paddingY = this._paddingY;
        const H = rows.length * rowH + paddingY * 2;

        const centerColWidth = this._centerColumnWidth;
        const valueTextWidth = this._valueTextWidth;
        const sideGutter = 8;

        const centerX = W / 2;
        const centerLeftEdge = centerX - centerColWidth / 2;
        const centerRightEdge = centerX + centerColWidth / 2;

        // Inner anchor X for the per-side value text (sits flush
        // against the centre column on the inside of each side).
        const leftValueAnchorX = centerLeftEdge - sideGutter;
        const rightValueAnchorX = centerRightEdge + sideGutter;

        // Maximum bar width = `barFraction` of the remaining side
        // width after the value-text gutter. Caller-tunable via the
        // `barFraction` option (defaults to 0.48 ≈ design2).
        const leftSideAvailable = leftValueAnchorX - valueTextWidth - sideGutter;
        const rightSideAvailable = W - rightValueAnchorX - valueTextWidth - sideGutter;
        const maxBarWidth = Math.max(
            0,
            Math.min(leftSideAvailable, rightSideAvailable) * this._barFraction,
        );

        const valueMax = d3Max(rows, (row) => row.value) || 1;
        const barWidthFor = (value) => (valueMax > 0 ? (value / valueMax) * maxBarWidth : 0);

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-diverging-bar")
            .attr("viewBox", `0 0 ${W} ${H}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Diverging bar chart");

        const inner = svg
            .append("g")
            .attr("class", "wt-diverging-inner")
            .attr("transform", `translate(0, ${paddingY})`);

        const tooltip = createChartTooltip();
        const tooltipHtml = (row) => {
            const header = row.tooltipLabel === "" ? row.label : row.tooltipLabel;
            const body = row.tooltip === "" ? row.value.toLocaleString() : row.tooltip;
            return (
                `<strong>${escapeHtml(header)}</strong><br>` +
                `<span class="wt-chart-tooltip__stat">${escapeHtml(body)}</span>`
            );
        };

        // ───── Centre rules — vertical hairlines flanking the
        // central label column, drawn full chart height so they
        // read as a continuous gutter regardless of row count.
        const rulesG = inner.append("g").attr("class", "wt-diverging-rules");
        rulesG
            .append("line")
            .attr("class", "wt-diverging-rule")
            .attr("x1", centerLeftEdge)
            .attr("x2", centerLeftEdge)
            .attr("y1", 0)
            .attr("y2", rows.length * rowH)
            .style("stroke", "var(--border)")
            .style("stroke-width", "1");
        rulesG
            .append("line")
            .attr("class", "wt-diverging-rule")
            .attr("x1", centerRightEdge)
            .attr("x2", centerRightEdge)
            .attr("y1", 0)
            .attr("y2", rows.length * rowH)
            .style("stroke", "var(--border)")
            .style("stroke-width", "1");

        // ───── Bucket labels (centre column). The label shows the
        // bare range — direction (which side is older) is encoded by
        // the bar's column (left vs right) and spelled out by the
        // caption row beneath the chart, so a `+` / `−` prefix would
        // be redundant noise on top of `0-4` and ugly noise on top
        // of `30+`.
        const labelsG = inner.append("g").attr("class", "wt-diverging-labels");
        labelsG
            .selectAll("text.wt-diverging-label")
            .data(rows)
            .enter()
            // Typography lives in the host stylesheet under
            // `.wt-diverging-label` / `.wt-diverging-val-*` so the
            // consumer can override per-theme without fighting
            // inline-style specificity.
            .append("text")
            .attr("class", "wt-diverging-label")
            .attr("x", centerX)
            .attr("y", (_d, i) => i * rowH + rowH / 2)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .text((d) => d.label);

        // ───── Left bars (sign === -1).
        const leftG = inner.append("g").attr("class", "wt-diverging-bars-left");
        const leftRows = rows
            .map((row, i) => ({ row, i }))
            .filter(({ row }) => row.sign === -1 && row.value > 0);
        leftG
            .selectAll("rect.wt-diverging-bar-left")
            .data(leftRows)
            .enter()
            .append("rect")
            .attr("class", "wt-diverging-bar-left")
            .attr("x", ({ row }) => leftValueAnchorX - valueTextWidth - barWidthFor(row.value))
            .attr("y", ({ i }) => i * rowH + (rowH - barH) / 2)
            .attr("width", ({ row }) => barWidthFor(row.value))
            .attr("height", barH)
            .attr("rx", barRadius)
            .attr("ry", barRadius)
            .on("mouseover", (event, { row }) => tooltip.show(event, tooltipHtml(row)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());
        leftG
            .selectAll("text.wt-diverging-val-left")
            .data(leftRows)
            .enter()
            .append("text")
            .attr("class", "wt-diverging-val-left")
            .attr("x", leftValueAnchorX)
            .attr("y", ({ i }) => i * rowH + rowH / 2)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "middle")
            .text(({ row }) => row.value.toLocaleString());

        // ───── Right bars (sign === +1).
        const rightG = inner.append("g").attr("class", "wt-diverging-bars-right");
        const rightRows = rows
            .map((row, i) => ({ row, i }))
            .filter(({ row }) => row.sign === 1 && row.value > 0);
        rightG
            .selectAll("rect.wt-diverging-bar-right")
            .data(rightRows)
            .enter()
            .append("rect")
            .attr("class", "wt-diverging-bar-right")
            .attr("x", () => rightValueAnchorX + valueTextWidth)
            .attr("y", ({ i }) => i * rowH + (rowH - barH) / 2)
            .attr("width", ({ row }) => barWidthFor(row.value))
            .attr("height", barH)
            .attr("rx", barRadius)
            .attr("ry", barRadius)
            .on("mouseover", (event, { row }) => tooltip.show(event, tooltipHtml(row)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());
        rightG
            .selectAll("text.wt-diverging-val-right")
            .data(rightRows)
            .enter()
            .append("text")
            .attr("class", "wt-diverging-val-right")
            .attr("x", rightValueAnchorX)
            .attr("y", ({ i }) => i * rowH + rowH / 2)
            .attr("text-anchor", "start")
            .attr("dominant-baseline", "middle")
            .text(({ row }) => row.value.toLocaleString());

        return svg.node();
    }

    /**
     * Remove any svg + placeholder this widget rendered earlier so
     * redraw() never stacks.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-diverging-bar, :scope > .chart-empty-state",
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
