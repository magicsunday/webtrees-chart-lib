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

/**
 * Mirror histogram — two histograms stacked vertically, the bottom
 * one flipped so the shared x-axis runs through the centre. Used for
 * paired distributions where the visual symmetry carries meaning:
 * husband / wife marriage age, father / mother age at first child,
 * husband / wife age at divorce.
 *
 * Both series share a single y-scale (peak count across BOTH sides)
 * so the bar lengths are directly comparable. The category axis sits
 * between the two histograms with the bucket labels printed once.
 *
 * Native `<title>` per bar gives the hover count without a tooltip
 * lifecycle.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class MirrorHistogram extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     width?: number,
     *     height?: number,
     *     topLabel?: string,
     *     bottomLabel?: string,
     *     topColor?: string,
     *     bottomColor?: string,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        const { width, height } = this.dimensions({ width: 720, height: 220 });
        this._width = width;
        this._height = height;
        this._topLabel = typeof this.options.topLabel === "string" ? this.options.topLabel : "";
        this._bottomLabel = typeof this.options.bottomLabel === "string" ? this.options.bottomLabel : "";
        this._topColor = typeof this.options.topColor === "string" && this.options.topColor !== ""
            ? this.options.topColor
            : "currentColor";
        this._bottomColor = typeof this.options.bottomColor === "string" && this.options.bottomColor !== ""
            ? this.options.bottomColor
            : "currentColor";
    }

    /**
     * @param {{top: Array<{label: string, value: number}>, bottom: Array<{label: string, value: number}>}|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const top = sanitize(data?.top);
        const bottom = sanitize(data?.bottom);

        if (top.length === 0 && bottom.length === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        // Align the two series on their shared label set, preserving
        // the top series' order. Missing buckets on either side render
        // as zero-height bars so the axis stays continuous.
        const labels = top.map((row) => row.label);
        const bottomByLabel = new Map(bottom.map((row) => [row.label, row.value]));

        const W = this._width;
        const H = this._height;

        const sideH = (H - 30) / 2;
        const axisY = H / 2;

        const maxValue = d3Max([
            d3Max(top, (d) => d.value) || 0,
            d3Max(bottom, (d) => d.value) || 0,
        ]) || 1;

        const x = scaleBand()
            .domain(labels)
            .range([56, W - 8])
            .paddingInner(0.18)
            .paddingOuter(0.05);

        const y = scaleLinear()
            .domain([0, maxValue])
            .range([0, sideH - 18]);

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-stat-mirror")
            .attr("viewBox", `0 0 ${W} ${H}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img");

        // Side labels (top axis tag, bottom axis tag)
        svg.append("text")
            .attr("x", 8)
            .attr("y", 14)
            .attr("class", "wt-stat-mirror-axislabel")
            .style("fill", this._topColor)
            .style("font-family", "var(--sans)")
            .style("font-size", "11px")
            .style("font-weight", "600")
            .style("letter-spacing", "0.14em")
            .style("text-transform", "uppercase")
            .text(this._topLabel);

        svg.append("text")
            .attr("x", 8)
            .attr("y", H - 4)
            .attr("class", "wt-stat-mirror-axislabel")
            .style("fill", this._bottomColor)
            .style("font-family", "var(--sans)")
            .style("font-size", "11px")
            .style("font-weight", "600")
            .style("letter-spacing", "0.14em")
            .style("text-transform", "uppercase")
            .text(this._bottomLabel);

        // Top side bars + values above each bar
        svg.selectAll("rect.wt-stat-mirror-bar-top")
            .data(top)
            .enter()
            .append("rect")
            .attr("class", "wt-stat-mirror-bar-top")
            .attr("x", (d) => x(d.label))
            .attr("width", x.bandwidth())
            .attr("y", (d) => axisY - 4 - y(d.value))
            .attr("height", (d) => y(d.value))
            .style("fill", this._topColor)
            .append("title")
            .text((d) => `${d.label}: ${d.value}`);

        svg.selectAll("text.wt-stat-mirror-val-top")
            .data(top.filter((d) => d.value > 0))
            .enter()
            .append("text")
            .attr("class", "wt-stat-mirror-val-top")
            .attr("x", (d) => x(d.label) + x.bandwidth() / 2)
            .attr("y", (d) => axisY - 8 - y(d.value))
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "alphabetic")
            .style("fill", "var(--ink-2)")
            .style("font-family", "var(--mono)")
            .style("font-size", "10px")
            .text((d) => d.value);

        // Bucket labels on the centre axis
        svg.selectAll("text.wt-stat-mirror-cat")
            .data(labels)
            .enter()
            .append("text")
            .attr("class", "wt-stat-mirror-cat")
            .attr("x", (label) => x(label) + x.bandwidth() / 2)
            .attr("y", axisY + 4)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "hanging")
            .style("fill", "var(--ink-3)")
            .style("font-family", "var(--sans)")
            .style("font-size", "10px")
            .text((label) => label);

        // Bottom side bars (flipped)
        svg.selectAll("rect.wt-stat-mirror-bar-bot")
            .data(labels.map((label) => ({ label, value: bottomByLabel.get(label) ?? 0 })))
            .enter()
            .append("rect")
            .attr("class", "wt-stat-mirror-bar-bot")
            .attr("x", (d) => x(d.label))
            .attr("width", x.bandwidth())
            .attr("y", axisY + 18)
            .attr("height", (d) => y(d.value))
            .style("fill", this._bottomColor)
            .append("title")
            .text((d) => `${d.label}: ${d.value}`);

        svg.selectAll("text.wt-stat-mirror-val-bot")
            .data(labels.map((label) => ({ label, value: bottomByLabel.get(label) ?? 0 })).filter((d) => d.value > 0))
            .enter()
            .append("text")
            .attr("class", "wt-stat-mirror-val-bot")
            .attr("x", (d) => x(d.label) + x.bandwidth() / 2)
            .attr("y", (d) => axisY + 18 + y(d.value) + 12)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "alphabetic")
            .style("fill", "var(--ink-2)")
            .style("font-family", "var(--mono)")
            .style("font-size", "10px")
            .text((d) => d.value);

        return svg.node();
    }

    /** @private */
    _clearChart() {
        select(this.target).selectAll("svg.wt-stat-mirror").remove();
    }

    /** @private */
    _emptyMessage() {
        return typeof this.options.emptyMessage === "string" && this.options.emptyMessage !== ""
            ? this.options.emptyMessage
            : "";
    }
}

/**
 * Filter out non-numeric / missing-label rows. Order preserved.
 *
 * @param {Array<{label: string, value: number}>|null|undefined} rows
 * @returns {Array<{label: string, value: number}>}
 */
function sanitize(rows) {
    if (!Array.isArray(rows)) {
        return [];
    }

    const out = [];
    for (const row of rows) {
        if (row === null || typeof row !== "object") {
            continue;
        }
        const label = typeof row.label === "string" ? row.label : String(row.label ?? "");
        const value = Number(row.value);
        if (label === "" || !Number.isFinite(value) || value < 0) {
            continue;
        }
        out.push({ label, value });
    }
    return out;
}
