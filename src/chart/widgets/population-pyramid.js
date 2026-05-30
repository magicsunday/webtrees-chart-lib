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
 * Mirrored ("pyramid") bar chart with a group picker — a domain-neutral,
 * two-sided comparison. The classic use is a demographic population pyramid
 * (male vs. female deaths per age band, picked per century), but nothing here
 * is sex- or age-specific: any two opposing series across shared row categories
 * work (e.g. wins vs. losses per team picked per season, imports vs. exports per
 * goods class picked per year).
 *
 * Data contract (`draw(data)`):
 *
 *     {
 *       groups: string[],   // picker options; one selectable column-set each
 *       bands:  string[],   // shared row categories, top → bottom order
 *       data:   Array<Array<{ left: number, right: number }>>
 *                           // data[groupIndex][bandIndex] = the two counts
 *     }
 *
 * The `left` series grows leftward from the centre gutter, the `right` series
 * grows rightward; both share ONE value scale (the peak count across both sides
 * of the *selected* group) so bar lengths are directly comparable. The band
 * label is printed once in the centre gutter, framed by two rules. The picker
 * sits above the chart and redraws only the bars on switch.
 *
 * Options (all optional):
 *
 *     width?:      number                      // viewBox width  (default 720)
 *     height?:     number                      // viewBox height (default 460)
 *     leftLabel?:  string                      // caption above the left column
 *     rightLabel?: string                      // caption above the right column
 *     axisLabel?:  string                      // centre gutter title (e.g. "Age")
 *     groupLabel?: (group: string) => string   // formats each picker button's text
 *     ariaLabel?:  string                      // accessible label on the host <svg>
 *     emptyMessage?: string                    // placeholder text when data is empty
 *     source?:     string                      // crossfilter source id for the bus
 *
 * Selection: clicking a bar emits `{ category: <band>, side: "left" | "right" }`
 * to the shared selection bus (see {@link BaseWidget#onSelectionChanged}).
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget ships no
 * opinionated palette): `.wt-stat-pyramid` (root), `-picker` / `-group` (picker
 * + buttons), `-svg`, and inside it the groups `-bars-left` / `-bars-right`
 * (with `path.wt-stat-pyramid-bar-left` / `-bar-right`, outer corners rounded),
 * `-bands`
 * (`text.wt-stat-pyramid-band`), `-values`
 * (`text.wt-stat-pyramid-value-left` / `-value-right`), `-header`
 * (`text.wt-stat-pyramid-sidelabel-left` / `-right`, `-axis-title`), and
 * `-separators` (`line.wt-stat-pyramid-separator`).
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class PopulationPyramid extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     width?: number,
     *     height?: number,
     *     leftLabel?: string,
     *     rightLabel?: string,
     *     axisLabel?: string,
     *     groupLabel?: (group: string) => string,
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
        this._leftLabel = typeof this.options.leftLabel === "string" ? this.options.leftLabel : "";
        this._rightLabel =
            typeof this.options.rightLabel === "string" ? this.options.rightLabel : "";
        this._axisLabel = typeof this.options.axisLabel === "string" ? this.options.axisLabel : "";
        this._ariaLabel = typeof this.options.ariaLabel === "string" ? this.options.ariaLabel : "";
        this._groupFormat =
            typeof this.options.groupLabel === "function"
                ? this.options.groupLabel
                : (group) => String(group);

        /**
         * The single shared body-level tooltip, lazily created on first draw and
         * reused across picker re-draws so a hover left visible on a bar that a
         * group switch removes can be hidden explicitly.
         *
         * @type {ReturnType<typeof createChartTooltip>|null}
         * @private
         */
        this._tooltip = null;

        /**
         * Index of the group currently shown by the picker.
         *
         * @type {number}
         * @private
         */
        this._activeGroup = 0;

        /**
         * Normalised payload kept so the picker can redraw a different group
         * without the consumer re-supplying the data.
         *
         * @type {{groups: Array<string>, bands: Array<string>, data: Array<Array<{left: number, right: number}>>}|null}
         * @private
         */
        this._model = null;
    }

    /**
     * @param {{groups: Array<string>, bands: Array<string>, data: Array<Array<{left: number, right: number}>>}|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const model = sanitize(data);
        this._model = model;

        if (model === null) {
            return this.renderEmptyState(this._emptyMessage());
        }

        // Default to the most recent group that carries any count; falls back to
        // the last column so an all-zero dataset still renders a stable view.
        this._activeGroup = model.groups.length - 1;
        for (let i = model.groups.length - 1; i >= 0; i -= 1) {
            if (columnTotal(model.data[i]) > 0) {
                this._activeGroup = i;
                break;
            }
        }

        const root = select(this.target).append("div").attr("class", "wt-stat-pyramid");

        this._picker = root.append("div").attr("class", "wt-stat-pyramid-picker");
        this._picker
            .selectAll("button.wt-stat-pyramid-group")
            .data(model.groups)
            .enter()
            .append("button")
            .attr("type", "button")
            .attr("class", "wt-stat-pyramid-group")
            .attr("aria-pressed", (_d, i) => (i === this._activeGroup ? "true" : "false"))
            .text((group) => this._groupFormat(group))
            .on("click", (_event, group) => {
                this._activeGroup = model.groups.indexOf(group);
                this._syncPicker();
                this._drawBars(true);
            });

        this._chart = root.append("div").attr("class", "wt-stat-pyramid-chart");
        this._drawBars(false);

        return root.node();
    }

    /**
     * Render (or redraw) the bars for the active group. When `animate` is true
     * the bars grow from the centre axis; otherwise the entrance is run through
     * {@see _runEntry} so reveal-on-scroll and reduced-motion are honoured.
     *
     * @param {boolean} pickerSwitch True when triggered by a picker click (animate inline)
     *
     * @private
     */
    _drawBars(pickerSwitch) {
        const model = this._model;
        if (model === null) {
            return;
        }

        const W = this._width;
        const H = this._height;
        const bands = model.bands;
        const column = model.data[this._activeGroup] ?? [];

        // Hide the shared tooltip before tearing down the SVG: a bar hovered when
        // the group is switched never receives its own mouseleave, so its tooltip
        // would otherwise stay visible over the freshly drawn bars.
        this._tooltip = this._tooltip ?? createChartTooltip();
        this._tooltip.hide();

        this._chart.selectAll("svg.wt-stat-pyramid-svg").remove();

        const svg = this._chart
            .append("svg")
            .attr("class", "wt-stat-pyramid-svg")
            .attr("viewBox", `0 0 ${W} ${H}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel === "" ? null : this._ariaLabel);

        // Group the plot into nested <g> layers under one wrapper, in paint
        // order: header captions, the gutter separators, the two bar fields,
        // then the band labels and value captions on top.
        const inner = svg.append("g").attr("class", "wt-stat-pyramid-inner");
        const headerG = inner.append("g").attr("class", "wt-stat-pyramid-header");
        const separatorG = inner.append("g").attr("class", "wt-stat-pyramid-separators");
        const leftG = inner.append("g").attr("class", "wt-stat-pyramid-bars-left");
        const rightG = inner.append("g").attr("class", "wt-stat-pyramid-bars-right");
        const bandG = inner.append("g").attr("class", "wt-stat-pyramid-bands");
        const valueG = inner.append("g").attr("class", "wt-stat-pyramid-values");

        // Centre gutter (band labels) framed by the separator rules at
        // ±gutterHalf, plus a small margin for the value captions at the outer
        // bar ends. The bars start a further `barGap` out from the separators so
        // there is clear air between each rule and the bar it borders; both bar
        // fields therefore begin at ±barStart.
        const gutterHalf = 34;
        const barGap = 8;
        const barStart = gutterHalf + barGap;
        const margin = 40;
        const centre = W / 2;
        const leftRange = [centre - barStart, margin];
        const rightRange = [centre + barStart, W - margin];

        const yTop = 24;
        const yBot = H - 18;
        const yBand = scaleBand().domain(bands).range([yTop, yBot]).paddingInner(0.32);

        const maxValue = d3Max(column, (cell) => Math.max(cell.left, cell.right)) || 1;
        const leftScale = scaleLinear().domain([0, maxValue]).range(leftRange);
        const rightScale = scaleLinear().domain([0, maxValue]).range(rightRange);

        const barH = Math.min(yBand.bandwidth(), 26);
        const inset = (yBand.bandwidth() - barH) / 2;

        // Side captions hug the centre gutter, aligned to where each field's
        // bars start: the left caption is right-aligned at the left bar-start,
        // the right caption left-aligned at the right bar-start. Omitted when no
        // label is supplied.
        if (this._leftLabel !== "") {
            headerG
                .append("text")
                .attr("class", "wt-stat-pyramid-sidelabel wt-stat-pyramid-sidelabel-left")
                .attr("x", centre - barStart)
                .attr("y", 14)
                .attr("text-anchor", "end")
                .text(this._leftLabel);
        }
        if (this._rightLabel !== "") {
            headerG
                .append("text")
                .attr("class", "wt-stat-pyramid-sidelabel wt-stat-pyramid-sidelabel-right")
                .attr("x", centre + barStart)
                .attr("y", 14)
                .attr("text-anchor", "start")
                .text(this._rightLabel);
        }

        // Centre axis title above the band-label gutter, completing the
        // three-part header that frames the two columns. Omitted when unset.
        if (this._axisLabel !== "") {
            headerG
                .append("text")
                .attr("class", "wt-stat-pyramid-axis-title")
                .attr("x", centre)
                .attr("y", 14)
                .attr("text-anchor", "middle")
                .text(this._axisLabel);
        }

        // Two solid rules frame the centre gutter — one on each side of the
        // band-label column — separating it from the left and right bar fields.
        for (const sx of [centre - gutterHalf, centre + gutterHalf]) {
            separatorG
                .append("line")
                .attr("class", "wt-stat-pyramid-separator")
                .attr("x1", sx)
                .attr("x2", sx)
                .attr("y1", yTop)
                .attr("y2", yBot);
        }

        const tooltip = this._tooltip;
        const tip = (category, sideLabel, value) =>
            `<strong>${escapeHtml(category)}${sideLabel === "" ? "" : ` · ${escapeHtml(sideLabel)}`}</strong><br>` +
            `<span class="wt-chart-tooltip__stat">${value.toLocaleString()}</span>`;

        const rows = bands.map((band, i) => ({
            band,
            left: column[i] ? column[i].left : 0,
            right: column[i] ? column[i].right : 0,
            y: (yBand(band) ?? 0) + inset,
        }));

        // Band labels in the centre gutter.
        bandG
            .selectAll("text.wt-stat-pyramid-band")
            .data(rows)
            .enter()
            .append("text")
            .attr("class", "wt-stat-pyramid-band")
            .attr("x", centre)
            .attr("y", (r) => r.y + barH / 2)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .text((r) => r.band);

        // Per-bar count captions at each bar's outer end — left series to the
        // left of its bar, right series to the right — so the exact figure reads
        // without a hover. A zero band shows no caption to keep the column quiet.
        valueG
            .selectAll("text.wt-stat-pyramid-value-left")
            .data(rows)
            .enter()
            .append("text")
            .attr("class", "wt-stat-pyramid-value wt-stat-pyramid-value-left")
            .attr("x", (r) => leftScale(r.left) - 4)
            .attr("y", (r) => r.y + barH / 2)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "middle")
            .text((r) => (r.left > 0 ? r.left.toLocaleString() : ""));

        valueG
            .selectAll("text.wt-stat-pyramid-value-right")
            .data(rows)
            .enter()
            .append("text")
            .attr("class", "wt-stat-pyramid-value wt-stat-pyramid-value-right")
            .attr("x", (r) => rightScale(r.right) + 4)
            .attr("y", (r) => r.y + barH / 2)
            .attr("text-anchor", "start")
            .attr("dominant-baseline", "middle")
            .text((r) => (r.right > 0 ? r.right.toLocaleString() : ""));

        // Grow each bar OUT from its inner edge at the gutter (not from the
        // chart centre): the entrance tween interpolates the bar's outward
        // length 0 → target and rebuilds the rounded-outer-corner path each
        // frame, so the bar unfurls from where it starts. `duration` differs
        // between the slower first entrance and the snappier picker switch.
        const applyFinal = (selection, lenFn, pathFn, doAnimate, duration) => {
            if (doAnimate) {
                selection
                    .attr("d", (r) => pathFn(r, 0))
                    .transition()
                    .duration(duration)
                    .attrTween("d", (r) => {
                        const target = lenFn(r);
                        return (t) => pathFn(r, target * t);
                    });

                return;
            }

            selection.attr("d", (r) => pathFn(r, lenFn(r)));
        };

        // Left series bars (grow left from the gutter inner edge). A zero band
        // keeps a 1-px placeholder pinned to the gutter (like the bar-chart) so
        // the row still reads as present.
        const leftInnerX = centre - barStart;
        const leftLen = (r) => Math.max(0, leftInnerX - leftScale(r.left));
        const leftPath = (r, len) => barPath(leftInnerX, len, "left", r.y, barH);
        const leftBars = leftG
            .selectAll("path.wt-stat-pyramid-bar-left")
            .data(rows)
            .enter()
            .append("path")
            .attr("class", "wt-stat-pyramid-bar-left")
            .style("cursor", "pointer")
            .on("mouseover", (event, r) =>
                tooltip.show(event, tip(r.band, this._leftLabel, r.left)),
            )
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide())
            .on("click", (_event, r) => this._emitSelection({ category: r.band, side: "left" }));

        // Right series bars (grow right from the gutter inner edge).
        const rightInnerX = centre + barStart;
        const rightLen = (r) => Math.max(0, rightScale(r.right) - rightInnerX);
        const rightPath = (r, len) => barPath(rightInnerX, len, "right", r.y, barH);
        const rightBars = rightG
            .selectAll("path.wt-stat-pyramid-bar-right")
            .data(rows)
            .enter()
            .append("path")
            .attr("class", "wt-stat-pyramid-bar-right")
            .style("cursor", "pointer")
            .on("mouseover", (event, r) =>
                tooltip.show(event, tip(r.band, this._rightLabel, r.right)),
            )
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide())
            .on("click", (_event, r) => this._emitSelection({ category: r.band, side: "right" }));

        // Animate BOTH columns through ONE closure. _runEntry holds a single
        // deferred entry, so the two columns must share it — two separate
        // _runEntry calls would let the second overwrite the first and leave one
        // column stuck at its initial keyframe when the reveal finally plays.
        const applyBoth = (doAnimate, duration) => {
            applyFinal(leftBars, leftLen, leftPath, doAnimate, duration);
            applyFinal(rightBars, rightLen, rightPath, doAnimate, duration);
        };

        // A picker switch re-draws while the card is already on screen, so it
        // animates inline immediately. Routing it through the reveal-gated
        // _runEntry would hold the new bars at width 0 until a playEntry that,
        // for a one-shot reveal, has already fired and will never fire again.
        if (pickerSwitch) {
            // Retire any still-held reveal entry: it captured the previous
            // group's now-removed <rect> nodes, so playing it later would animate
            // detached nodes. The switched-in bars are handled here.
            this._entry = null;
            applyBoth(!this._prefersReducedMotion(), 420);

            return;
        }

        this._runEntry((doAnimate) => applyBoth(doAnimate, 650));
    }

    /** @private */
    _syncPicker() {
        this._picker
            .selectAll("button.wt-stat-pyramid-group")
            .attr("aria-pressed", (_d, i) => (i === this._activeGroup ? "true" : "false"));
    }

    /** @private */
    _clearChart() {
        select(this.target).selectAll("div.wt-stat-pyramid").remove();
    }

    /** @private */
    _emptyMessage() {
        return typeof this.options.emptyMessage === "string" && this.options.emptyMessage !== ""
            ? this.options.emptyMessage
            : "";
    }
}

/**
 * Build a horizontal bar path with only its OUTER corners rounded (radius 7),
 * mirroring the bar-chart's top-rounded bars. `len` is the bar's outward length
 * from its inner edge at the gutter (`innerX`); `side` decides the grow
 * direction. `len <= 0` yields a 1-px placeholder pinned at the gutter so a zero
 * band still reads as present, and a tiny non-zero length is floored to 2 px so
 * a single count stays visible next to a dominant one.
 *
 * @param {number} innerX Gutter-side x the bar grows out from
 * @param {number} len    Outward length in px (clamped: <=0 → placeholder)
 * @param {"left"|"right"} side Grow direction (left rounds left corners, right the right)
 * @param {number} y       Bar top
 * @param {number} barH    Bar height
 * @returns {string} SVG path `d`
 */
function barPath(innerX, len, side, y, barH) {
    const radius = 7;

    if (len <= 0) {
        const px = side === "right" ? innerX : innerX - 1;
        return `M${px},${y}h1v${barH}h-1Z`;
    }

    const effective = Math.max(len, 2);
    const r = Math.min(radius, effective, barH / 2);

    if (side === "right") {
        const outerX = innerX + effective;
        return (
            `M${innerX},${y}H${outerX - r}A${r},${r} 0 0 1 ${outerX},${y + r}` +
            `V${y + barH - r}A${r},${r} 0 0 1 ${outerX - r},${y + barH}H${innerX}Z`
        );
    }

    const outerX = innerX - effective;
    return (
        `M${innerX},${y}H${outerX + r}A${r},${r} 0 0 0 ${outerX},${y + r}` +
        `V${y + barH - r}A${r},${r} 0 0 0 ${outerX + r},${y + barH}H${innerX}Z`
    );
}

/**
 * Validate + normalise the payload. Returns null when there is no usable data
 * (no groups, no bands, or a malformed shape) so the caller can render the empty
 * state. Negative / non-finite counts are clamped to zero.
 *
 * @param {{groups: Array<string>, bands: Array<string>, data: Array<Array<{left: number, right: number}>>}|null|undefined} data
 * @returns {{groups: Array<string>, bands: Array<string>, data: Array<Array<{left: number, right: number}>>}|null}
 */
function sanitize(data) {
    if (data === null || typeof data !== "object") {
        return null;
    }

    const groups = Array.isArray(data.groups) ? data.groups.map(String) : [];
    const bands = Array.isArray(data.bands) ? data.bands.map(String) : [];
    const rawData = Array.isArray(data.data) ? data.data : [];

    if (groups.length === 0 || bands.length === 0) {
        return null;
    }

    const normalised = groups.map((_group, gi) => {
        const column = Array.isArray(rawData[gi]) ? rawData[gi] : [];
        return bands.map((_band, bi) => {
            const cell = column[bi];
            const left = cell ? Number(cell.left) : 0;
            const right = cell ? Number(cell.right) : 0;
            return {
                left: Number.isFinite(left) && left > 0 ? left : 0,
                right: Number.isFinite(right) && right > 0 ? right : 0,
            };
        });
    });

    return { groups, bands, data: normalised };
}

/**
 * Sum of the left + right counts in a group column.
 *
 * @param {Array<{left: number, right: number}>|undefined} column
 * @returns {number}
 */
function columnTotal(column) {
    if (!Array.isArray(column)) {
        return 0;
    }
    return column.reduce((sum, cell) => sum + cell.left + cell.right, 0);
}
