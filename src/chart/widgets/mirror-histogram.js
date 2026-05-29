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
 * Mirror histogram — two histograms stacked vertically, the bottom one flipped
 * so the shared x-axis runs through the centre. Used for paired distributions
 * where the visual symmetry carries meaning: husband / wife marriage age,
 * father / mother age at first child, husband / wife age at divorce.
 *
 * Both series share a single y-scale (peak count across BOTH sides) so the bar
 * lengths are directly comparable. The category axis sits between the two
 * histograms with the bucket labels printed once.
 *
 * Native `<title>` per bar gives the hover count without a tooltip lifecycle.
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
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        // Default height 440 ≈ design2 reference: 22 px top side-label
        // + 180 px top bars + 30 px axis strip + 180 px bottom bars
        // + 22 px bottom side-label. Per-side bar drawable area scales
        // linearly with the supplied height.
        const { width, height } = this.dimensions({ width: 720, height: 440 });
        this._width = width;
        this._height = height;
        this._topLabel = typeof this.options.topLabel === "string" ? this.options.topLabel : "";
        this._bottomLabel =
            typeof this.options.bottomLabel === "string" ? this.options.bottomLabel : "";
        // Bar + side-label colours are driven by CSS via per-side
        // class hooks (`wt-stat-mirror-bar-top` / `-bot`,
        // `wt-stat-mirror-axislabel-top` / `-bot`). Consumers theme
        // the widget through their own stylesheet — no per-instance
        // colour option survives to JavaScript.
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

        // Axis strip = 34.5 px tall band centred vertically (design
        // reference). `.gs-mirror-axis { padding: 8px 4px; border-top
        // + border-bottom: 1px solid var(--border); background:
        // var(--paper) }` lands at ≈ 34.5 px in the live design once
        // the label box (11 px font × 1.4 line-height = 15.4 px) plus
        // 8 px padding × 2 + 2 × 1 px borders adds up.
        const axisStripeHalf = 17.25;
        const axisCenter = H / 2;
        const axisTopY = axisCenter - axisStripeHalf;
        const axisBotY = axisCenter + axisStripeHalf;

        const maxValue =
            d3Max([d3Max(top, (d) => d.value) || 0, d3Max(bottom, (d) => d.value) || 0]) || 1;

        // Lateral padding 4 px mirrors design2 `.gs-mirror-bars
        // { padding: 0 4px }`; paddingInner 0.28 puts a visible
        // gap (≈ design's `gap: 6px` between cols) between the bars.
        const x = scaleBand()
            .domain(labels)
            .range([4, W - 4])
            .paddingInner(0.28)
            .paddingOuter(0.05);

        // Reserved space per side, from svg edge inward:
        //   • 14 px side label (font 10 + descender + 4 px padding)
        //   • 16 px visual gap from side label to value text cap
        //   •  8 px value text glyph height (cap → baseline)
        //   •  4 px value text bottom → bar
        // = 42 px total. Max bar height = axisTopY - 42 leaves
        // identical gaps for top and bottom max bars regardless of
        // which side carries the larger value.
        const maxBarHeight = axisTopY - 42;
        const y = scaleLinear().domain([0, maxValue]).range([0, maxBarHeight]);

        // Cap each bar at 48 px wide (mirrors design2 `.gs-mirror-bar
        // { max-width: 48px }`) and centre it within its band so wide
        // cards don't render block-thick columns when the bucket
        // count is low.
        const MAX_BAR_WIDTH = 48;
        const barWidth = Math.min(x.bandwidth(), MAX_BAR_WIDTH);
        const inset = (x.bandwidth() - barWidth) / 2;
        const barRadius = 4;

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-stat-mirror")
            .attr("viewBox", `0 0 ${W} ${H}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img");

        // Side labels are anchored to the svg's vertical edges (top
        // and bottom), like CSS `position: absolute; top/bottom`. The
        // chart content lives in an inner `<g>` that vertically
        // re-centres itself between them so the largest top-bar and
        // the largest bottom-bar end up at IDENTICAL visual gaps to
        // their respective side label — even when the two series have
        // different max values.
        // Typography (font-family / font-size / weight / casing /
        // letter-spacing) lives in the host stylesheet under
        // `.wt-stat-mirror-axislabel`. Inline styles would beat the
        // host's CSS specificity, so keep them out — only positional
        // attrs stay here.
        svg.append("text")
            .attr("x", 8)
            .attr("y", 14)
            .attr("class", "wt-stat-mirror-axislabel wt-stat-mirror-axislabel-top")
            .text(this._topLabel);

        svg.append("text")
            .attr("x", 8)
            .attr("y", H - 4)
            .attr("class", "wt-stat-mirror-axislabel wt-stat-mirror-axislabel-bot")
            .text(this._bottomLabel);

        // Inner-group vertical re-centre. Natural bbox of the chart
        // runs from the top of the top-max-bar's value text
        // (axisTopY - y(maxTop) - 12) down to the descender of the
        // bot-max-bar's value text (axisBotY + y(maxBot) + 14). The
        // target midpoint sits halfway between the MEN-label's
        // descender (y=16) and the WOMEN-label's cap top (y=H-12).
        // Translating the inner group by (target - natural) leaves
        // identical gaps on both sides.
        const maxTopValue = d3Max(top, (d) => d.value) || 0;
        const maxBotValue = d3Max(bottom, (d) => d.value) || 0;
        const naturalTopEdge = axisTopY - y(maxTopValue) - 12;
        const naturalBotEdge = axisBotY + y(maxBotValue) + 14;
        const naturalMidpoint = (naturalTopEdge + naturalBotEdge) / 2;
        const targetMidpoint = (16 + (H - 12)) / 2;
        const innerTranslateY = targetMidpoint - naturalMidpoint;

        const inner = svg
            .append("g")
            .attr("class", "wt-stat-mirror-inner")
            .attr("transform", `translate(0, ${innerTranslateY})`);

        // ───── Axis strip ─────
        const axisG = inner.append("g").attr("class", "wt-stat-mirror-axis");
        axisG
            .append("rect")
            .attr("class", "wt-stat-mirror-axis-fill")
            .attr("x", 0)
            .attr("y", axisTopY)
            .attr("width", W)
            .attr("height", axisStripeHalf * 2)
            .style("fill", "var(--paper)");
        axisG
            .append("line")
            .attr("class", "wt-stat-mirror-axis-rule")
            .attr("x1", 0)
            .attr("x2", W)
            .attr("y1", axisTopY)
            .attr("y2", axisTopY)
            .style("stroke", "var(--border)")
            .style("stroke-width", "1");
        axisG
            .append("line")
            .attr("class", "wt-stat-mirror-axis-rule")
            .attr("x1", 0)
            .attr("x2", W)
            .attr("y1", axisBotY)
            .attr("y2", axisBotY)
            .style("stroke", "var(--border)")
            .style("stroke-width", "1");

        // Min height applies to any non-zero value so design2's
        // `min-height: 1px` parity holds — extremely small counts
        // still produce a visible bar instead of disappearing into
        // the axis rule.
        const renderHeight = (raw) => (raw > 0 && raw < 1 ? 1 : raw);

        // Path builder for a top-anchored bar with rounded top
        // corners only. Value 0 collapses to a 1-px stub sitting on
        // the axis rule so empty buckets stay visible.
        const topRoundedBar = (xPos, width, heightPx) => {
            const baseY = axisTopY;
            const h = renderHeight(heightPx);
            if (h <= 0) {
                return `M${xPos},${baseY - 1}H${xPos + width}V${baseY}H${xPos}Z`;
            }
            const r = Math.min(barRadius, width / 2, h);
            const yTop = baseY - h;
            return (
                `M${xPos},${baseY}` +
                `V${yTop + r}` +
                `Q${xPos},${yTop} ${xPos + r},${yTop}` +
                `H${xPos + width - r}` +
                `Q${xPos + width},${yTop} ${xPos + width},${yTop + r}` +
                `V${baseY}` +
                `Z`
            );
        };

        // Path builder for a bottom-anchored (flipped) bar with
        // rounded bottom corners only.
        const botRoundedBar = (xPos, width, heightPx) => {
            const baseY = axisBotY;
            const heightPxNorm = renderHeight(heightPx);
            if (heightPxNorm <= 0) {
                return `M${xPos},${baseY}H${xPos + width}V${baseY + 1}H${xPos}Z`;
            }
            const r = Math.min(barRadius, width / 2, heightPxNorm);
            const yBot = baseY + heightPxNorm;
            return (
                `M${xPos},${baseY}` +
                `H${xPos + width}` +
                `V${yBot - r}` +
                `Q${xPos + width},${yBot} ${xPos + width - r},${yBot}` +
                `H${xPos + r}` +
                `Q${xPos},${yBot} ${xPos},${yBot - r}` +
                `Z`
            );
        };

        const tooltip = createChartTooltip();
        const tooltipHtml = (row) => {
            const header =
                typeof row.tooltipLabel === "string" && row.tooltipLabel !== ""
                    ? row.tooltipLabel
                    : row.label;
            const body =
                typeof row.tooltipBody === "string" && row.tooltipBody !== ""
                    ? row.tooltipBody
                    : row.value.toLocaleString();
            return (
                `<strong>${escapeHtml(header)}</strong><br>` +
                `<span class="wt-chart-tooltip__stat">${escapeHtml(body)}</span>`
            );
        };

        // Bucket labels centred between the two axis rules (inside
        // the axis group so they translate with the rules).
        axisG
            .selectAll("text.wt-stat-mirror-cat")
            .data(labels)
            .enter()
            .append("text")
            .attr("class", "wt-stat-mirror-cat")
            .attr("x", (label) => (x(label) ?? 0) + x.bandwidth() / 2)
            .attr("y", axisCenter)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .text((label) => label);

        // ───── Top bars + their value captions ─────
        const topG = inner.append("g").attr("class", "wt-stat-mirror-bars-top");
        topG.selectAll("path.wt-stat-mirror-bar-top")
            .data(top)
            .enter()
            .append("path")
            .attr("class", "wt-stat-mirror-bar-top")
            .attr("d", (d) => topRoundedBar((x(d.label) ?? 0) + inset, barWidth, y(d.value)))
            .on("mouseover", (event, d) => tooltip.show(event, tooltipHtml(d)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        topG.selectAll("text.wt-stat-mirror-val-top")
            .data(top.filter((d) => d.value > 0))
            .enter()
            .append("text")
            .attr("class", "wt-stat-mirror-val-top")
            .attr("x", (d) => (x(d.label) ?? 0) + x.bandwidth() / 2)
            .attr("y", (d) => axisTopY - y(d.value) - 4)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "alphabetic")
            .text((d) => d.value);

        // ───── Bottom bars + their value captions ─────
        const bottomAligned = labels.map((label) => ({
            label,
            value: bottomByLabel.get(label) ?? 0,
        }));

        const botG = inner.append("g").attr("class", "wt-stat-mirror-bars-bot");
        botG.selectAll("path.wt-stat-mirror-bar-bot")
            .data(bottomAligned)
            .enter()
            .append("path")
            .attr("class", "wt-stat-mirror-bar-bot")
            .attr("d", (d) => botRoundedBar((x(d.label) ?? 0) + inset, barWidth, y(d.value)))
            .on("mouseover", (event, d) => tooltip.show(event, tooltipHtml(d)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        botG.selectAll("text.wt-stat-mirror-val-bot")
            .data(bottomAligned.filter((d) => d.value > 0))
            .enter()
            .append("text")
            .attr("class", "wt-stat-mirror-val-bot")
            .attr("x", (d) => (x(d.label) ?? 0) + x.bandwidth() / 2)
            .attr("y", (d) => axisBotY + y(d.value) + 12)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "alphabetic")
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
