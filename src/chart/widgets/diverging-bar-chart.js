/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { max as d3Max } from "d3-array";
import {
    easeBackOut,
    easeBounceOut,
    easeCubicInOut,
    easeCubicOut,
    easeElasticOut,
    easeExpOut,
    easeLinear,
    easeQuadOut,
    easeSinOut,
} from "d3-ease";
import { scaleBand, scaleLinear } from "d3-scale";
import { select } from "d3-selection";

import { roundedBarPath } from "../bars/rounded-bar-path.js";
import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

/**
 * Named easings the `ease` option accepts as a string, so a consumer that wires
 * the widget through markup (no function reference) can still pick the feel.
 * A d3-ease function may also be passed directly. Default: `cubic-out`.
 *
 * @type {Record<string, (t: number) => number>}
 */
const EASINGS = {
    linear: easeLinear,
    "cubic-out": easeCubicOut,
    "cubic-in-out": easeCubicInOut,
    "quad-out": easeQuadOut,
    "sin-out": easeSinOut,
    "exp-out": easeExpOut,
    "back-out": easeBackOut,
    "bounce-out": easeBounceOut,
    "elastic-out": easeElasticOut,
};

/**
 * Diverging (two-sided) bar chart with an optional group picker — a
 * domain-neutral comparison of two opposing series across shared row
 * categories. The classic use is a demographic population pyramid (male vs.
 * female deaths per age band, picked per century), but nothing here is sex- or
 * age-specific: any two opposing series work (e.g. wins vs. losses per team
 * picked per season, imports vs. exports per goods class picked per year). With
 * a single group the chart is a static two-sided bar chart with no picker.
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
 * (rendered only when there is more than one group) sits above the chart and
 * redraws only the bars on switch.
 *
 * Options (all optional):
 *
 *     width?:        number                    // viewBox width  (default 720)
 *     height?:       number                    // viewBox height (default 460)
 *     barThickness?: number                    // bar thickness cap in px (default 14)
 *     ease?:         string|((t:number)=>number) // entrance/switch easing — a d3-ease fn or a name from EASINGS (default "cubic-out")
 *     leftLabel?:    string                    // caption above the left column
 *     rightLabel?:   string                    // caption above the right column
 *     axisLabel?:    string                    // centre gutter title (e.g. "Age")
 *     categoryUnit?: string                    // unit appended to the band in the tooltip (e.g. "years")
 *     valueLabel?:   string                    // unit appended to the count in the tooltip (e.g. "individuals")
 *     groupLabel?:   (group: string) => string // formats each picker button's text
 *     ariaLabel?:    string                    // accessible label on the host <svg>
 *     emptyMessage?: string                    // placeholder text when data is empty
 *     source?:       string                    // crossfilter source id for the bus
 *
 * Selection: clicking a bar emits `{ category: <band>, side: "left" | "right" }`
 * to the shared selection bus (see {@link BaseWidget#onSelectionChanged}).
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget ships no
 * opinionated palette): `.wt-diverging` (root), `-picker` / `-group` (picker
 * + buttons), `-svg`, and inside it the groups `-bars-left` / `-bars-right`
 * (with `path.wt-diverging-bar-left` / `-bar-right`, outer corners rounded; a
 * zero band's bar carries the `wt-diverging-bar--empty` modifier),
 * `-bands`
 * (`text.wt-diverging-band`), `-values`
 * (`text.wt-diverging-value-left` / `-value-right`), `-header`
 * (`text.wt-diverging-sidelabel-left` / `-right`, `-axis-title`), and
 * `-separators` (`line.wt-diverging-separator`).
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class DivergingBarChart extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     width?: number,
     *     height?: number,
     *     barThickness?: number,
     *     ease?: string | ((t: number) => number),
     *     leftLabel?: string,
     *     rightLabel?: string,
     *     axisLabel?: string,
     *     categoryUnit?: string,
     *     valueLabel?: string,
     *     groupLabel?: (group: string) => string,
     *     ariaLabel?: string,
     *     emptyMessage?: string,
     *     source?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);

        this._defaultEmptyMessage = "";
        this.emptyMessage = this.options.emptyMessage;

        const { width, height } = this.dimensions({ width: 720, height: 460 });
        this._width = width;
        this._height = height;
        this._leftLabel = typeof this.options.leftLabel === "string" ? this.options.leftLabel : "";
        this._rightLabel =
            typeof this.options.rightLabel === "string" ? this.options.rightLabel : "";
        this._axisLabel = typeof this.options.axisLabel === "string" ? this.options.axisLabel : "";
        this._categoryUnit =
            typeof this.options.categoryUnit === "string" ? this.options.categoryUnit : "";
        this._valueLabel =
            typeof this.options.valueLabel === "string" ? this.options.valueLabel : "";
        this._barThickness =
            typeof this.options.barThickness === "number" &&
            Number.isFinite(this.options.barThickness) &&
            this.options.barThickness > 0
                ? this.options.barThickness
                : 14;
        this._ease =
            typeof this.options.ease === "function"
                ? this.options.ease
                : (EASINGS[this.options.ease] ?? easeCubicOut);
        this._groupFormat =
            typeof this.options.groupLabel === "function"
                ? this.options.groupLabel
                : (group) => String(group);

        /**
         * Per-band outward lengths of the last render, kept so a picker switch
         * can morph each bar from its current length to the new one (resize in
         * place) instead of regrowing from the gutter.
         *
         * @type {{left: Array<number>, right: Array<number>}}
         * @private
         */
        this._prevLen = { left: [], right: [] };

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
            return this.renderEmptyState(this.emptyMessage);
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

        const root = select(this.target).append("div").attr("class", "wt-diverging");

        // A single group has nothing to switch between, so the picker is omitted
        // entirely and the chart renders as a static two-sided bar chart.
        if (model.groups.length > 1) {
            this._picker = root.append("div").attr("class", "wt-diverging-picker");
            this._picker
                .selectAll("button.wt-diverging-group")
                .data(model.groups)
                .enter()
                .append("button")
                .attr("type", "button")
                .attr("class", "wt-diverging-group")
                .attr("aria-pressed", (_d, i) => (i === this._activeGroup ? "true" : "false"))
                .text((group) => this._groupFormat(group))
                .on("click", (_event, group) => {
                    this._activeGroup = model.groups.indexOf(group);
                    this._syncPicker();
                    this._drawBars(true);
                });
        } else {
            this._picker = null;
        }

        this._chart = root.append("div").attr("class", "wt-diverging-chart");
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
        const bands = model.bands;
        const column = model.data[this._activeGroup] ?? [];

        // Lay the bands out at a fixed row pitch (bar thickness + a small gap) and
        // size the viewBox to fit, so the bar-to-bar spacing matches the design
        // regardless of band count — the chart is exactly as tall as its rows
        // need rather than a fixed height stretched across them.
        const yTop = 24;
        const yBottom = 18;
        const rowGap = 13;
        const rowStep = this._barThickness + rowGap;
        const H = yTop + bands.length * rowStep + yBottom;

        // Hide the shared tooltip before tearing down the SVG: a bar hovered when
        // the group is switched never receives its own mouseleave, so its tooltip
        // would otherwise stay visible over the freshly drawn bars.
        this._tooltip = this._tooltip ?? createChartTooltip();
        this._tooltip.hide();

        this._chart.selectAll("svg.wt-diverging-svg").remove();

        const svg = this._chart
            .append("svg")
            .attr("class", "wt-diverging-svg")
            .attr("viewBox", `0 0 ${W} ${H}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel === "" ? null : this._ariaLabel);

        // Group the plot into nested <g> layers under one wrapper, in paint
        // order: header captions, the gutter separators, the two bar fields,
        // then the band labels and value captions on top.
        const inner = svg.append("g").attr("class", "wt-diverging-inner");
        const headerG = inner.append("g").attr("class", "wt-diverging-header");
        const separatorG = inner.append("g").attr("class", "wt-diverging-separators");
        const leftG = inner.append("g").attr("class", "wt-diverging-bars-left");
        const rightG = inner.append("g").attr("class", "wt-diverging-bars-right");
        const bandG = inner.append("g").attr("class", "wt-diverging-bands");
        const valueG = inner.append("g").attr("class", "wt-diverging-values");

        // Centre gutter (band labels) framed by the separator rules at
        // ±gutterHalf — an 80-px-wide axis column matching the design — plus a
        // small margin for the value captions at the outer bar ends. The bars
        // start a further `barGap` out from the separators so there is clear air
        // between each rule and the bar it borders; both bar fields therefore
        // begin at ±barStart.
        const gutterHalf = 40;
        const barGap = 8;
        const barStart = gutterHalf + barGap;
        const margin = 40;
        const centre = W / 2;
        const leftRange = [centre - barStart, margin];
        const rightRange = [centre + barStart, W - margin];

        const yBot = H - yBottom;
        const yBand = scaleBand()
            .domain(bands)
            .range([yTop, yBot])
            .paddingInner(rowGap / rowStep);

        const maxValue = d3Max(column, (cell) => Math.max(cell.left, cell.right)) || 1;
        const leftScale = scaleLinear().domain([0, maxValue]).range(leftRange);
        const rightScale = scaleLinear().domain([0, maxValue]).range(rightRange);

        const barH = Math.min(yBand.bandwidth(), this._barThickness);
        const inset = (yBand.bandwidth() - barH) / 2;

        // Side captions hug the centre gutter, aligned to where each field's
        // bars start: the left caption is right-aligned at the left bar-start,
        // the right caption left-aligned at the right bar-start. Omitted when no
        // label is supplied.
        if (this._leftLabel !== "") {
            headerG
                .append("text")
                .attr("class", "wt-diverging-sidelabel wt-diverging-sidelabel-left")
                .attr("x", centre - barStart)
                .attr("y", 14)
                .attr("text-anchor", "end")
                .text(this._leftLabel);
        }
        if (this._rightLabel !== "") {
            headerG
                .append("text")
                .attr("class", "wt-diverging-sidelabel wt-diverging-sidelabel-right")
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
                .attr("class", "wt-diverging-axis-title")
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
                .attr("class", "wt-diverging-separator")
                .attr("x1", sx)
                .attr("x2", sx)
                .attr("y1", yTop)
                .attr("y2", yBot);
        }

        const tooltip = this._tooltip;
        // The hovered column already tells left vs. right, so the tooltip drops
        // the side and reads "<band> <categoryUnit>" + "<count> <valueLabel>"
        // (both units optional). E.g. "80–89 years" / "17 individuals".
        const tip = (category, value) => {
            const unit = this._categoryUnit === "" ? "" : ` ${escapeHtml(this._categoryUnit)}`;
            const label = this._valueLabel === "" ? "" : ` ${escapeHtml(this._valueLabel)}`;
            // Count and its unit share one stat span so "4 individuals" reads as
            // a single uniformly-styled figure, not a big number + muted word.
            return (
                `<strong>${escapeHtml(category)}${unit}</strong><br>` +
                `<span class="wt-chart-tooltip__stat">${value.toLocaleString()}${label}</span>`
            );
        };

        const rows = bands.map((band, i) => ({
            band,
            left: column[i] ? column[i].left : 0,
            right: column[i] ? column[i].right : 0,
            y: (yBand(band) ?? 0) + inset,
        }));

        // Band labels in the centre gutter.
        bandG
            .selectAll("text.wt-diverging-band")
            .data(rows)
            .enter()
            .append("text")
            .attr("class", "wt-diverging-band")
            .attr("x", centre)
            .attr("y", (r) => r.y + barH / 2)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .text((r) => r.band);

        // Per-bar count captions at each bar's outer end — left series to the
        // left of its bar, right series to the right — so the exact figure reads
        // without a hover. A zero band shows no caption to keep the column quiet.
        // Their x rides the bar tip (set + animated by applyBoth below) so the
        // number is pushed outward as the bar grows rather than waiting at the
        // final spot.
        const leftValues = valueG
            .selectAll("text.wt-diverging-value-left")
            .data(rows)
            .enter()
            .append("text")
            .attr("class", "wt-diverging-value wt-diverging-value-left")
            .attr("y", (r) => r.y + barH / 2)
            .attr("text-anchor", "end")
            .attr("dominant-baseline", "central")
            .text((r) => (r.left > 0 ? r.left.toLocaleString() : ""));

        const rightValues = valueG
            .selectAll("text.wt-diverging-value-right")
            .data(rows)
            .enter()
            .append("text")
            .attr("class", "wt-diverging-value wt-diverging-value-right")
            .attr("y", (r) => r.y + barH / 2)
            .attr("text-anchor", "start")
            .attr("dominant-baseline", "central")
            .text((r) => (r.right > 0 ? r.right.toLocaleString() : ""));

        // Animate a bar field and its value captions together from a start
        // length to the target length, rebuilding the rounded-outer-corner path
        // and re-placing the caption at the bar tip each frame — so the number
        // rides the growing/​shrinking bar instead of waiting at the final spot.
        // The first entrance starts from 0 (bars unfurl out of the gutter); a
        // picker switch starts from the bar's CURRENT length so it just resizes
        // in place.
        const applyFinal = (
            bars,
            captions,
            capX,
            fromLenFn,
            toLenFn,
            pathFn,
            doAnimate,
            duration,
        ) => {
            this._enterTween(
                bars,
                doAnimate,
                "pyramid-bars",
                duration,
                (sel) => sel.attr("d", (r) => pathFn(r, toLenFn(r))),
                (tr) =>
                    tr.attrTween("d", (r, i) => {
                        const from = fromLenFn(i);
                        const to = toLenFn(r);
                        return (t) => pathFn(r, from + (to - from) * t);
                    }),
                this._ease,
            );

            this._enterTween(
                captions,
                doAnimate,
                "pyramid-caps",
                duration,
                (sel) => sel.attr("x", (r) => capX(toLenFn(r))),
                (tr) =>
                    tr.attrTween("x", (r, i) => {
                        const from = fromLenFn(i);
                        const to = toLenFn(r);
                        return (t) => String(capX(from + (to - from) * t));
                    }),
                this._ease,
            );
        };

        // Left series bars (grow left from the gutter inner edge). A zero band
        // keeps a 1-px placeholder pinned to the gutter (like the bar-chart) so
        // the row still reads as present.
        const leftInnerX = centre - barStart;
        const leftLen = (r) => Math.max(0, leftInnerX - leftScale(r.left));
        const leftPath = (r, len) =>
            roundedBarPath({
                direction: "left",
                base: leftInnerX,
                length: len,
                cross: r.y,
                thickness: barH,
            });
        const leftBars = leftG
            .selectAll("path.wt-diverging-bar-left")
            .data(rows)
            .enter()
            .append("path")
            .attr("class", "wt-diverging-bar-left")
            .classed("wt-diverging-bar--empty", (r) => r.left === 0)
            .style("cursor", "pointer")
            .on("mouseover", (event, r) => tooltip.show(event, tip(r.band, r.left)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide())
            .on("click", (_event, r) => this._emitSelection({ category: r.band, side: "left" }));

        // Right series bars (grow right from the gutter inner edge).
        const rightInnerX = centre + barStart;
        const rightLen = (r) => Math.max(0, rightScale(r.right) - rightInnerX);
        const rightPath = (r, len) =>
            roundedBarPath({
                direction: "right",
                base: rightInnerX,
                length: len,
                cross: r.y,
                thickness: barH,
            });
        const rightBars = rightG
            .selectAll("path.wt-diverging-bar-right")
            .data(rows)
            .enter()
            .append("path")
            .attr("class", "wt-diverging-bar-right")
            .classed("wt-diverging-bar--empty", (r) => r.right === 0)
            .style("cursor", "pointer")
            .on("mouseover", (event, r) => tooltip.show(event, tip(r.band, r.right)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide())
            .on("click", (_event, r) => this._emitSelection({ category: r.band, side: "right" }));

        // Capture the previous render's per-band lengths BEFORE overwriting them
        // with this column's targets, so a picker switch morphs from where each
        // bar currently is. The first draw has no history → start length 0.
        const prevLeft = this._prevLen.left;
        const prevRight = this._prevLen.right;
        this._prevLen = {
            left: rows.map((r) => leftLen(r)),
            right: rows.map((r) => rightLen(r)),
        };
        const fromLeft = pickerSwitch ? (i) => prevLeft[i] ?? 0 : () => 0;
        const fromRight = pickerSwitch ? (i) => prevRight[i] ?? 0 : () => 0;

        // Caption x rides the bar tip: 4 px beyond the outward edge (end-anchored
        // left of the left bar, start-anchored right of the right bar).
        const leftCapX = (len) => leftInnerX - len - 4;
        const rightCapX = (len) => rightInnerX + len + 4;

        // Hold the "from" keyframe on the freshly-created nodes IMMEDIATELY,
        // before the (possibly reveal-deferred) entry closure runs — otherwise a
        // deferred entry would leave the bars without a `d` and the captions
        // without an `x` (collapsing every number onto the gutter) until
        // playEntry finally fires.
        const holdFrom = (bars, captions, capX, fromLenFn, pathFn) => {
            bars.attr("d", (r, i) => pathFn(r, fromLenFn(i)));
            captions.attr("x", (_r, i) => capX(fromLenFn(i)));
        };
        holdFrom(leftBars, leftValues, leftCapX, fromLeft, leftPath);
        holdFrom(rightBars, rightValues, rightCapX, fromRight, rightPath);

        // Animate BOTH columns through ONE closure. _runEntry holds a single
        // deferred entry, so the two columns must share it — two separate
        // _runEntry calls would let the second overwrite the first and leave one
        // column stuck at its initial keyframe when the reveal finally plays.
        const applyBoth = (doAnimate, duration) => {
            applyFinal(
                leftBars,
                leftValues,
                leftCapX,
                fromLeft,
                leftLen,
                leftPath,
                doAnimate,
                duration,
            );
            applyFinal(
                rightBars,
                rightValues,
                rightCapX,
                fromRight,
                rightLen,
                rightPath,
                doAnimate,
                duration,
            );
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
            applyBoth(!this._prefersReducedMotion(), 600);

            return;
        }

        this._runEntry((doAnimate) => applyBoth(doAnimate, 900));
    }

    /** @private */
    _syncPicker() {
        this._picker
            .selectAll("button.wt-diverging-group")
            .attr("aria-pressed", (_d, i) => (i === this._activeGroup ? "true" : "false"));
    }

    /** @private */
    _clearChart() {
        select(this.target).selectAll("div.wt-diverging").remove();
    }
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
