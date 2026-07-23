/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { max as d3Max } from "d3-array";
import { interpolate } from "d3-interpolate";
import { scaleBand, scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import "d3-transition";

import { roundedBarPath } from "../bars/rounded-bar-path.js";
import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 440,
};

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
 * A shared body-level tooltip gives the hover count per bar. Both fields grow
 * outward from the centre axis on entry (reduced motion jumps to the final
 * state), reusing the same rounded-outer-corner bar geometry as the two-sided
 * horizontal bar chart via the shared {@link roundedBarPath} builder.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class MirrorHistogram extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     topLabel?: string,
     *     bottomLabel?: string,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options, { emptyMessage: "" });
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.topLabel = this.options.topLabel;
        this.bottomLabel = this.options.bottomLabel;
        // Bar + side-label colours are driven by CSS via per-side
        // class hooks (`msc-mirror-histogram-bar-top` / `-bot`,
        // `msc-mirror-histogram-axislabel-top` / `-bot`). Consumers theme
        // the widget through their own stylesheet — no per-instance
        // colour option survives to JavaScript.
    }

    /**
     * The label printed at the top edge for the upper (top) series. A non-string
     * value falls back to an empty string.
     *
     * @returns {string}
     */
    get topLabel() {
        return this._topLabel;
    }

    /**
     * @param {string|undefined} value The top side-label; a non-string value
     *   resets to an empty string. The runtime guard keeps the JSON dispatcher
     *   (which assigns untyped values) safe.
     */
    set topLabel(value) {
        this._topLabel = typeof value === "string" ? value : "";
    }

    /**
     * The label printed at the bottom edge for the lower (bottom) series. A
     * non-string value falls back to an empty string.
     *
     * @returns {string}
     */
    get bottomLabel() {
        return this._bottomLabel;
    }

    /**
     * @param {string|undefined} value The bottom side-label; a non-string value
     *   resets to an empty string. The runtime guard keeps the JSON dispatcher
     *   (which assigns untyped values) safe.
     */
    set bottomLabel(value) {
        this._bottomLabel = typeof value === "string" ? value : "";
    }

    /**
     * @param {{top: Array<{label: string, value: number}>, bottom: Array<{label: string, value: number}>}|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearRoot("svg.msc-mirror-histogram");

        const top = sanitize(data?.top);
        const bottom = sanitize(data?.bottom);

        if (top.length === 0 && bottom.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        // Align the two series on their shared label set, preserving
        // the top series' order. Missing buckets on either side render
        // as zero-height bars so the axis stays continuous.
        const labels = top.map((row) => row.label);
        const bottomByLabel = new Map(bottom.map((row) => [row.label, row.value]));

        const W = this._resolveWidth(720);
        const H = this._resolveHeight(DEFAULT_OPTIONS.height);

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

        const svg = select(this.target)
            .append("svg")
            .attr("class", "msc-mirror-histogram")
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
        // `.msc-mirror-histogram-axislabel`. Inline styles would beat the
        // host's CSS specificity, so keep them out — only positional
        // attrs stay here.
        svg.append("text")
            .attr("x", 8)
            .attr("y", 14)
            .attr("class", "msc-mirror-histogram-axislabel msc-mirror-histogram-axislabel-top")
            .text(this._topLabel);

        svg.append("text")
            .attr("x", 8)
            .attr("y", H - 4)
            .attr("class", "msc-mirror-histogram-axislabel msc-mirror-histogram-axislabel-bot")
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
            .attr("class", "msc-mirror-histogram-inner")
            .attr("transform", `translate(0, ${innerTranslateY})`);

        // ───── Axis strip ─────
        const axisG = inner.append("g").attr("class", "msc-mirror-histogram-axis");
        axisG
            .append("rect")
            .attr("class", "msc-mirror-histogram-axis-fill")
            .attr("x", 0)
            .attr("y", axisTopY)
            .attr("width", W)
            .attr("height", axisStripeHalf * 2)
            .style("fill", "var(--paper)");
        axisG
            .append("line")
            .attr("class", "msc-mirror-histogram-axis-rule")
            .attr("x1", 0)
            .attr("x2", W)
            .attr("y1", axisTopY)
            .attr("y2", axisTopY)
            .style("stroke", "var(--border)")
            .style("stroke-width", "1");
        axisG
            .append("line")
            .attr("class", "msc-mirror-histogram-axis-rule")
            .attr("x1", 0)
            .attr("x2", W)
            .attr("y1", axisBotY)
            .attr("y2", axisBotY)
            .style("stroke", "var(--border)")
            .style("stroke-width", "1");

        // Each field's bar grows outward from the centre axis (top bars up,
        // bottom bars down) and shares the rounded-outer-corner geometry with
        // the two-sided horizontal bar chart through the common builder. `len`
        // is the outward length in px: a zero band collapses to a 1px stub on
        // the axis rule, a tiny band is floored so it stays visible.
        const barXFor = (d) => (x(d.label) ?? 0) + inset;
        const topPath = (d, len) =>
            roundedBarPath({
                direction: "up",
                base: axisTopY,
                length: len,
                cross: barXFor(d),
                thickness: barWidth,
            });
        const botPath = (d, len) =>
            roundedBarPath({
                direction: "down",
                base: axisBotY,
                length: len,
                cross: barXFor(d),
                thickness: barWidth,
            });

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
                `<span class="msc-chart-tooltip__stat">${escapeHtml(body)}</span>`
            );
        };

        // Bucket labels centred between the two axis rules (inside
        // the axis group so they translate with the rules).
        axisG
            .selectAll("text.msc-mirror-histogram-cat")
            .data(labels)
            .enter()
            .append("text")
            .attr("class", "msc-mirror-histogram-cat")
            .attr("x", (label) => (x(label) ?? 0) + x.bandwidth() / 2)
            .attr("y", axisCenter)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .text((label) => label);

        // Align the bottom series to the shared label set so missing buckets
        // render as zero-length bars and the axis stays continuous.
        const bottomAligned = labels.map((label) => ({
            label,
            value: bottomByLabel.get(label) ?? 0,
        }));

        // ───── Top + bottom bars, each held at the axis as a zero-length
        // keyframe then grown outward on entry ─────
        const topG = inner.append("g").attr("class", "msc-mirror-histogram-bars-top");
        const topBars = topG
            .selectAll("path.msc-mirror-histogram-bar-top")
            .data(top)
            .enter()
            .append("path")
            .attr("class", "msc-mirror-histogram-bar-top")
            .attr("d", (d) => topPath(d, 0))
            .style("cursor", "default")
            .on("mouseover", (event, d) => tooltip.show(event, tooltipHtml(d)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        const botG = inner.append("g").attr("class", "msc-mirror-histogram-bars-bot");
        const botBars = botG
            .selectAll("path.msc-mirror-histogram-bar-bot")
            .data(bottomAligned)
            .enter()
            .append("path")
            .attr("class", "msc-mirror-histogram-bar-bot")
            .attr("d", (d) => botPath(d, 0))
            .style("cursor", "default")
            .on("mouseover", (event, d) => tooltip.show(event, tooltipHtml(d)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        // Value captions ride the bar tip — 4px beyond the top bar's tip, 12px
        // beyond the bottom bar's — and are held at the axis (length 0) so they
        // travel outward with their bar on entry instead of waiting at the final
        // spot.
        const capX = (d) => (x(d.label) ?? 0) + x.bandwidth() / 2;
        const topCapY = (len) => axisTopY - len - 4;
        const botCapY = (len) => axisBotY + len + 12;
        const topCaps = topG
            .selectAll("text.msc-mirror-histogram-val-top")
            .data(top.filter((d) => d.value > 0))
            .enter()
            .append("text")
            .attr("class", "msc-mirror-histogram-val-top")
            .attr("x", capX)
            .attr("y", topCapY(0))
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "alphabetic")
            .text((d) => d.value);
        const botCaps = botG
            .selectAll("text.msc-mirror-histogram-val-bot")
            .data(bottomAligned.filter((d) => d.value > 0))
            .enter()
            .append("text")
            .attr("class", "msc-mirror-histogram-val-bot")
            .attr("x", capX)
            .attr("y", botCapY(0))
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "alphabetic")
            .text((d) => d.value);

        // Grow both fields — bars AND their value captions — outward from the
        // centre axis through ONE entry closure (a second `_runEntry` call would
        // overwrite the first's held closure and strand a field at the axis
        // under reveal-on-scroll). Each caption's `y` rides its bar tip every
        // frame so the number travels with the bar rather than waiting at the end.
        const ENTRY_MS = 700;
        const tweenBar = (pathFn) =>
            function barTween(d) {
                const grow = interpolate(0, y(d.value));
                return (t) => pathFn(d, grow(t));
            };
        const tweenCapY = (capY) =>
            function capTween(d) {
                const grow = interpolate(0, y(d.value));
                return (t) => String(capY(grow(t)));
            };
        this._runEntry((animate) => {
            this._enterTween(
                topBars,
                animate,
                "mirror-top-bars",
                ENTRY_MS,
                (selection) => selection.attr("d", (d) => topPath(d, y(d.value))),
                (transition) => transition.attrTween("d", tweenBar(topPath)),
            );
            this._enterTween(
                botBars,
                animate,
                "mirror-bot-bars",
                ENTRY_MS,
                (selection) => selection.attr("d", (d) => botPath(d, y(d.value))),
                (transition) => transition.attrTween("d", tweenBar(botPath)),
            );
            this._enterTween(
                topCaps,
                animate,
                "mirror-top-caps",
                ENTRY_MS,
                (selection) => selection.attr("y", (d) => topCapY(y(d.value))),
                (transition) => transition.attrTween("y", tweenCapY(topCapY)),
            );
            this._enterTween(
                botCaps,
                animate,
                "mirror-bot-caps",
                ENTRY_MS,
                (selection) => selection.attr("y", (d) => botCapY(y(d.value))),
                (transition) => transition.attrTween("y", tweenCapY(botCapY)),
            );
        });

        return svg.node();
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
