/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { easeCubicOut } from "d3-ease";
import { interpolateRgb } from "d3-interpolate";
import { select } from "d3-selection";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 96,
    cellGap: 2,
    labelHeight: 18,
    cellMinWidth: 24,
    coolColor: "rgba(220, 230, 240, 0.85)",
    warmColor: "rgb(170, 30, 30)",
};

/**
 * Single-row heatmap-strip widget for cohort-style rate data — one
 * cell per cohort (decade / century / category), cell colour blends
 * from `coolColor` (low rate) to `warmColor` (high rate). Hover
 * surfaces the full breakdown including the sample size so the
 * viewer can disambiguate "zero rate in a 50-sample cohort" from
 * "zero rate in a 1-sample cohort".
 *
 * The payload is intentionally minimal — `label`, `value` (0..1),
 * `weight` (sample size). Optional `tooltip` field can carry a
 * pre-formatted multi-line string for richer hover content.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class CohortHeatmap extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     cellGap?: number,
     *     labelHeight?: number,
     *     cellMinWidth?: number,
     *     coolColor?: string,
     *     warmColor?: string,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._height = pickPositive(this.options.height, DEFAULT_OPTIONS.height);
        this._cellGap = pickPositive(this.options.cellGap, DEFAULT_OPTIONS.cellGap);
        this._labelHeight = pickPositive(this.options.labelHeight, DEFAULT_OPTIONS.labelHeight);
        this._cellMinWidth = pickPositive(this.options.cellMinWidth, DEFAULT_OPTIONS.cellMinWidth);
        this._coolColor =
            typeof this.options.coolColor === "string" && this.options.coolColor.length > 0
                ? this.options.coolColor
                : DEFAULT_OPTIONS.coolColor;
        this._warmColor =
            typeof this.options.warmColor === "string" && this.options.warmColor.length > 0
                ? this.options.warmColor
                : DEFAULT_OPTIONS.warmColor;
    }

    /**
     * @param {Array<{
     *     label: string,
     *     value: number,
     *     weight?: number,
     *     tooltip?: string
     * }>|null|undefined} data
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
                value: clampUnit(Number(row.value ?? 0)),
                weight: Math.max(0, Number(row.weight ?? 0)),
                tooltip: typeof row.tooltip === "string" ? row.tooltip : "",
            }))
            .filter((row) => row.label !== "");

        if (rows.length === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const containerWidth = pickPositive(this.options.width, this.target.clientWidth) || 600;
        const cellWidth = Math.max(
            this._cellMinWidth,
            (containerWidth - this._cellGap * (rows.length - 1)) / rows.length,
        );
        const totalWidth = cellWidth * rows.length + this._cellGap * (rows.length - 1);
        const cellHeight = Math.max(8, this._height - this._labelHeight);

        const interpolator = interpolateRgb(this._coolColor, this._warmColor);
        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-cohort-heatmap")
            .attr("viewBox", `0 0 ${totalWidth} ${this._height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Cohort heatmap");

        const groups = svg
            .append("g")
            .attr("class", "cells")
            .selectAll("g.cell")
            .data(rows)
            .enter()
            .append("g")
            .attr("class", "cell")
            .attr("transform", (_, index) => `translate(${index * (cellWidth + this._cellGap)}, 0)`);

        groups
            .append("rect")
            .attr("class", "cell-rect")
            .attr("width", cellWidth)
            .attr("height", cellHeight)
            .attr("rx", 2)
            .attr("tabindex", "0")
            .attr(
                "aria-label",
                (row) => `${row.label}: ${Math.round(row.value * 100)}% (${row.weight} samples)`,
            )
            .style("fill", this._coolColor)
            .style("opacity", 0)
            .transition("cohort-enter")
            .duration(450)
            .delay((_, index) => index * 25)
            .ease(easeCubicOut)
            .style("fill", (row) => interpolator(row.value))
            .style("opacity", 1);

        groups
            .selectAll("rect.cell-rect")
            .on("mouseover", (event, row) => {
                const head =
                    `<strong>${escapeHtml(row.label)}</strong><br>` +
                    `<span class="wt-chart-tooltip__stat">${Math.round(row.value * 100)}%</span>`;
                const body = row.tooltip === "" ? head : `${head}<div class="wt-chart-tooltip__meta">${escapeHtml(row.tooltip).replace(/\n/g, "<br>")}</div>`;
                tooltip.show(event, body);
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        groups
            .append("text")
            .attr("class", "cell-label")
            .attr("x", cellWidth / 2)
            .attr("y", cellHeight + this._labelHeight - 4)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "alphabetic")
            .text((row) => row.label);

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
            ":scope > svg.wt-cohort-heatmap, :scope > .chart-empty-state",
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
 * @param {number} value
 *
 * @returns {number}
 */
function clampUnit(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return value;
}
