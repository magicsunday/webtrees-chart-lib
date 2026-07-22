/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { brushX } from "d3-brush";
import { interpolate } from "d3-interpolate";
import { path } from "d3-path";
import { scaleBand, scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { pickFraction } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 240,
    // Y-axis dropped → no left margin needed for tick labels; keep
    // top room for the floating bar-value labels and bottom room for
    // both the tick labels and the editorial sub-rule (y=26).
    margin: { top: 20, right: 4, bottom: 36, left: 4 },
    orientation: "vertical",
    brush: false,
    barPadding: 0.2,
    xLabel: "",
    yLabel: "",
};

const ORIENTATIONS = new Set(["vertical", "horizontal"]);

/**
 * Bar / histogram widget for categorical `{label, value}` rows. Renders either
 * vertical or horizontal bars; an optional d3-brush lets the consumer
 * drag-select a sub-range and react via the `selectionChanged` CustomEvent on
 * the host target.
 *
 * The widget is deliberately presentation-only: payload arrives pre-aggregated
 * from the consumer and the bars render in the order they arrive. Bars carry an
 * optional per-row `class` (for CSS palette hooks) and a `tooltip` body that,
 * when set, takes precedence over the default `value.toLocaleString()`
 * rendering — same conventions as {@see LineChart}.
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget ships no
 * opinionated palette): `.msc-bar-chart` (root svg) wraps one inner `<g>` that
 * holds every group. The category axis is a `<g class="msc-bar-chart-x-axis">`
 * (vertical orientation) or `<g class="msc-bar-chart-y-axis">` (horizontal); in
 * vertical orientation a single faint `line.msc-bar-chart-x-axis-rule` closes
 * the block off below the tick labels. An optional axis caption renders as
 * `text.msc-bar-chart-axis-label.msc-bar-chart-x-label` (vertical) or
 * `text.msc-bar-chart-axis-label.msc-bar-chart-y-label` (horizontal). The bars
 * live in a `<g class="msc-bar-chart-bars">` whose children are
 * `path.msc-bar-chart-bar` elements — each also carrying the per-row `class`
 * string when supplied — and (vertical only) their floating values sit in a
 * `<g class="msc-bar-chart-bar-values">` of `text.msc-bar-chart-bar-value`.
 * When the brush is enabled the drag-select layer is a
 * `<g class="msc-bar-chart-bar-brush">`.
 *
 * Brush contract — when the brush is enabled, a drag-select dispatches a
 * `selectionChanged` CustomEvent on the host target with
 * `detail = { labels: string[] }` — an empty `labels` array signals a cleared
 * brush.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class BarChart extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     orientation?: "vertical" | "horizontal",
     *     brush?: boolean,
     *     barPadding?: number,
     *     xLabel?: string,
     *     yLabel?: string,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options, {
            margin: DEFAULT_OPTIONS.margin,
            ariaLabel: "Bar chart",
        });
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.orientation = this.options.orientation;
        this.brush = this.options.brush;
        this.barPadding = this.options.barPadding;
        this.xLabel = this.options.xLabel;
        this.yLabel = this.options.yLabel;
    }

    /**
     * The bar layout orientation — `"vertical"` (columns) or `"horizontal"`
     * (rows).
     *
     * @returns {"vertical" | "horizontal"}
     */
    get orientation() {
        return this._orientation;
    }

    /**
     * @param {"vertical" | "horizontal"|undefined} value The orientation; a
     *   value outside the supported set resets to the default. The runtime guard
     *   keeps the JSON dispatcher (which assigns untyped values) safe.
     */
    set orientation(value) {
        this._orientation = /** @type {"vertical" | "horizontal"} */ (
            ORIENTATIONS.has(value) ? value : DEFAULT_OPTIONS.orientation
        );
    }

    /**
     * Whether the drag-select brush layer is rendered. Stored in the
     * `_brushEnabled` backing field; the accessor name matches the option name.
     *
     * @returns {boolean}
     */
    get brush() {
        return this._brushEnabled;
    }

    /**
     * @param {boolean|undefined} value The brush flag; a non-boolean value
     *   resets to the default. The runtime guard keeps the JSON dispatcher
     *   (which assigns untyped values) safe.
     */
    set brush(value) {
        this._brushEnabled = typeof value === "boolean" ? value : DEFAULT_OPTIONS.brush;
    }

    /**
     * The fractional padding between bands in `[0, 0.95]`.
     *
     * @returns {number}
     */
    get barPadding() {
        return this._barPadding;
    }

    /**
     * @param {number|undefined} value The band padding fraction; clamped into
     *   `[0, 0.95]` and reset to the default when not finite. The runtime guard
     *   keeps the JSON dispatcher (which assigns untyped values) safe.
     */
    set barPadding(value) {
        this._barPadding = pickFraction(value, DEFAULT_OPTIONS.barPadding);
    }

    /**
     * The optional caption rendered below the category axis (vertical
     * orientation). An empty string suppresses the caption.
     *
     * @returns {string}
     */
    get xLabel() {
        return this._xLabel;
    }

    /**
     * @param {string|undefined} value The category-axis caption; a non-string
     *   value resets to the default empty string. The runtime guard keeps the
     *   JSON dispatcher (which assigns untyped values) safe.
     */
    set xLabel(value) {
        this._xLabel = typeof value === "string" ? value : DEFAULT_OPTIONS.xLabel;
    }

    /**
     * The optional caption rendered beside the category axis (horizontal
     * orientation). An empty string suppresses the caption.
     *
     * @returns {string}
     */
    get yLabel() {
        return this._yLabel;
    }

    /**
     * @param {string|undefined} value The value-axis caption; a non-string value
     *   resets to the default empty string. The runtime guard keeps the JSON
     *   dispatcher (which assigns untyped values) safe.
     */
    set yLabel(value) {
        this._yLabel = typeof value === "string" ? value : DEFAULT_OPTIONS.yLabel;
    }

    /**
     * @param {Array<{label: string, value: number, class?: string, tooltip?: string, tooltipLabel?: string}>|null|undefined} data
     *   Categorical rows in display order. `class` is applied as
     *   the `class` attribute on the `<rect>` element so consumer
     *   CSS can colour individual bars. `tooltip` overrides the
     *   default value rendering inside the chart-lib tooltip.
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        // Retire any still-held reveal entry: its closure captured the previous
        // render's now-removed nodes, so a later playEntry() must not run it (it
        // would animate detached bars while the fresh draw — or the empty-state
        // placeholder — gets none).
        this._entry = null;

        if (!Array.isArray(data) || data.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const rows = data
            .filter((row) => row !== null && typeof row === "object")
            .map((row) => ({
                label: String(row.label ?? ""),
                value: Number(row.value ?? 0),
                class: typeof row.class === "string" ? row.class : "",
                tooltip: typeof row.tooltip === "string" ? row.tooltip : "",
                tooltipLabel: typeof row.tooltipLabel === "string" ? row.tooltipLabel : "",
            }))
            .filter((row) => row.label !== "" && Number.isFinite(row.value) && row.value >= 0);

        if (rows.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        // Optional axis caption needs its own band below the x-axis
        // rule — otherwise the caption would overlap the tick labels.
        // Mirrors the line-chart `xLabelBandHeight` convention. The
        // mirror case widens `margin.left` so the rotated y-caption
        // does not clip on the SVG edge in horizontal orientation
        // (default `margin.left=4` would otherwise place the rotated
        // text outside the viewBox).
        const xLabelBandHeight = 14;
        const yLabelBandWidth = 18;
        const baseMargin = this._margin;
        const isVerticalOrientation = this._orientation === "vertical";
        const margin = {
            ...baseMargin,
            bottom:
                baseMargin.bottom +
                (this._xLabel !== "" && isVerticalOrientation ? xLabelBandHeight : 0),
            left:
                baseMargin.left +
                (this._yLabel !== "" && !isVerticalOrientation ? yLabelBandWidth : 0),
        };
        const height = this._resolveHeight(DEFAULT_OPTIONS.height);
        const width = this._resolveWidth(600, 240);
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        const isVertical = isVerticalOrientation;

        const categorical = scaleBand()
            .domain(rows.map((row) => row.label))
            .range(isVertical ? [0, innerWidth] : [0, innerHeight])
            .padding(this._barPadding);

        const valueMax = max(rows, (row) => row.value) ?? 1;
        const linear = scaleLinear()
            .domain([0, valueMax])
            .nice()
            .range(isVertical ? [innerHeight, 0] : [0, innerWidth]);

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "msc-bar-chart")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel);

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        // Category (label) axis only — value axis is intentionally
        // omitted to mirror the Editorial histogram look. The baseline
        // is reinforced via CSS `stroke` on the .domain path; ticks
        // and tick-marks are hidden via CSS.
        const categoryAxis = isVertical ? axisBottom(categorical) : axisLeft(categorical);

        const categoryAxisGroup = inner
            .append("g")
            .attr("class", isVertical ? "msc-bar-chart-x-axis" : "msc-bar-chart-y-axis")
            .attr("transform", isVertical ? `translate(0, ${innerHeight})` : "translate(0, 0)")
            .call(categoryAxis);

        // Drop the D3 default axis baseline (`path.domain`) and the
        // per-tick stub lines — the editorial layout supplies its
        // own faint horizontal rule below the tick labels (see the
        // `.x-axis-rule` append below) and tick stubs do not carry
        // information once labels are present.
        categoryAxisGroup.select(".domain").remove();
        categoryAxisGroup.selectAll(".tick line").remove();

        // Editorial layout: the only visible axis chrome is a
        // single faint horizontal rule rendered *below* the tick
        // labels, which closes the histogram block off from the
        // section divider that follows.
        if (isVertical) {
            categoryAxisGroup
                .append("line")
                .attr("class", "msc-bar-chart-x-axis-rule")
                .attr("x1", 0)
                .attr("x2", innerWidth)
                .attr("y1", 26)
                .attr("y2", 26);
        }

        // Optional axis captions (category / value caption). The
        // caption mirrors d3-axis's tick positioning convention so
        // tick labels (above the rule) and the caption (below the
        // rule) sit on the same `y + 0.71em` baseline rhythm. d3
        // emits ticks with `y="9" dy="0.71em"` against the axis
        // translate — the equivalent below-rule offset is
        // `y=ruleY + 9` with the same dy, which lands the caption
        // baseline ~7 px below the rule, symmetric with the ~9 px
        // gap above the rule that the ticks occupy.
        if (isVertical && this._xLabel !== "") {
            const ruleY = 26;
            const tickYOffset = 9;
            inner
                .append("text")
                .attr("class", "msc-bar-chart-axis-label msc-bar-chart-x-label")
                .attr("x", innerWidth / 2)
                .attr("y", innerHeight + ruleY + tickYOffset)
                .attr("dy", "0.71em")
                .attr("text-anchor", "middle")
                .text(this._xLabel);
        }
        if (!isVertical && this._yLabel !== "") {
            inner
                .append("text")
                .attr("class", "msc-bar-chart-axis-label msc-bar-chart-y-label")
                .attr(
                    "transform",
                    `rotate(-90) translate(${-innerHeight / 2}, ${-margin.left + 12})`,
                )
                .attr("text-anchor", "middle")
                .text(this._yLabel);
        }

        // SVG rect's `rx`/`ry` round all four corners; the design
        // only rounds the two top corners so the bar sits flush on
        // the x-axis baseline. We render the column as a <path> whose
        // `d` is built via the d3-path context, rounding only the top
        // edge — keeps the bottom square against the axis line.
        const bars = inner
            .append("g")
            .attr("class", "msc-bar-chart-bars")
            .selectAll("path.msc-bar-chart-bar")
            .data(rows)
            .enter()
            .append("path")
            .attr("class", (row) =>
                row.class === "" ? "msc-bar-chart-bar" : `msc-bar-chart-bar ${row.class}`,
            )
            .attr("tabindex", "0")
            .attr("aria-label", (row) => `${row.label}: ${row.value.toLocaleString()}`);

        /**
         * Build the path data for a single vertical bar with rounded top
         * corners only. A minimum height keeps short bars visible (see the
         * inline note); every bar uses the rounded path so none is ever the
         * degenerate flat straight-line stub, which mis-composites the whole
         * SVG in Firefox — leaving the other bars stale until a forced repaint,
         * a bug Chrome does not exhibit.
         */
        const topRoundedBar = (xPos, width, _yTop, heightPx, radius) => {
            const bar = path();
            // A zero-value band (and the entry animation's height-0 keyframe)
            // stays a 1-px rounded stub so it reads as "exists, nobody in it"
            // yet stays distinct from a single occurrence (≥ 2 px). Both go
            // through the SAME rounded path — never the flat straight-line stub
            // that mis-composites the whole SVG in Firefox.
            const effectiveHeight = heightPx <= 0 ? 1 : Math.max(heightPx, 2);
            const effectiveTop = innerHeight - effectiveHeight;
            const r = Math.min(radius, width / 2, effectiveHeight);
            // Bottom-left → up the left edge → rounded top-left corner →
            // across the top → rounded top-right corner → down the right edge.
            bar.moveTo(xPos, effectiveTop + effectiveHeight);
            bar.lineTo(xPos, effectiveTop + r);
            bar.quadraticCurveTo(xPos, effectiveTop, xPos + r, effectiveTop);
            bar.lineTo(xPos + width - r, effectiveTop);
            bar.quadraticCurveTo(xPos + width, effectiveTop, xPos + width, effectiveTop + r);
            bar.lineTo(xPos + width, effectiveTop + effectiveHeight);
            bar.closePath();
            return bar.toString();
        };

        if (isVertical) {
            // Cap each bar at the mockup's 56 px and centre it within
            // the band so wide-card histograms (few categories, lots
            // of horizontal room) don't render block-thick columns.
            const MAX_BAR_WIDTH = 56;
            const barWidth = Math.min(categorical.bandwidth(), MAX_BAR_WIDTH);
            const inset = (categorical.bandwidth() - barWidth) / 2;
            const barRadius = 4;
            const xOf = (row) => (categorical(row.label) ?? 0) + inset;
            // A zero-value band is pinned to height 0 by its VALUE, not by the
            // scale: `linear(0)` can land a hair above the baseline (nice()/
            // float rounding), which would otherwise clamp the empty bar up to
            // the 2-px floor and make it indistinguishable from a single
            // occurrence. Height 0 → topRoundedBar's 1-px stub.
            const heightOf = (row) => (row.value <= 0 ? 0 : innerHeight - linear(row.value));

            // Value label above each bar — mirrors the histogram mockup
            // where the count floats over the bar instead of relying on
            // a y-axis to be read off. Created here (not in a later pass)
            // so its entrance rides the bar inside the SAME _runEntry
            // closure — a second _runEntry would overwrite the first's
            // held closure and strand the bars at the baseline under
            // reveal-on-scroll.
            const labelY = (row) => linear(row.value) - 6;
            const values = inner
                .append("g")
                .attr("class", "msc-bar-chart-bar-values")
                .selectAll("text.msc-bar-chart-bar-value")
                .data(rows)
                .enter()
                .append("text")
                .attr("class", "msc-bar-chart-bar-value")
                .attr("x", (row) => (categorical(row.label) ?? 0) + categorical.bandwidth() / 2)
                .attr("text-anchor", "middle")
                .text((row) => (row.value > 0 ? row.value.toLocaleString() : ""));

            // Initial keyframe: every bar collapsed to the baseline
            // (height 0) with its value label resting on the baseline.
            bars.attr("d", (row) => topRoundedBar(xOf(row), barWidth, 0, 0, barRadius));
            values.attr("y", innerHeight - 6);

            // Entrance: each bar grows up from the baseline to its value
            // (the label riding the bar tip), staggered by bar index for a
            // left-to-right sweep. _runEntry animates inline by default,
            // holds the initial keyframe for reveal-on-scroll, or — under
            // reduced motion — jumps straight to the final state.
            const ENTRY_MS = 600;
            const STAGGER_MS = 40;
            const barGrowTween = (row) => {
                const grow = interpolate(0, heightOf(row));
                return (t) => topRoundedBar(xOf(row), barWidth, 0, grow(t), barRadius);
            };
            const labelRideTween = (row) => {
                const grow = interpolate(0, heightOf(row));
                return (t) => String(innerHeight - grow(t) - 6);
            };
            this._runEntry((animate) => {
                this._enterTween(
                    bars,
                    animate,
                    "bar-enter",
                    ENTRY_MS,
                    (selection) =>
                        selection.attr("d", (row) =>
                            topRoundedBar(xOf(row), barWidth, 0, heightOf(row), barRadius),
                        ),
                    (transition) =>
                        transition
                            .delay((_row, index) => index * STAGGER_MS)
                            .attrTween("d", barGrowTween),
                );
                this._enterTween(
                    values,
                    animate,
                    "bar-value-enter",
                    ENTRY_MS,
                    (selection) => selection.attr("y", labelY),
                    (transition) =>
                        transition
                            .delay((_row, index) => index * STAGGER_MS)
                            .attrTween("y", labelRideTween),
                );
            });
        } else {
            // Horizontal layout: render as plain rectangles (no
            // mockup precedent for rounded ends on horizontal bars).
            bars.attr("d", (row) => {
                const yPos = categorical(row.label) ?? 0;
                const widthPx = linear(row.value);
                const heightPx = categorical.bandwidth();
                const rect = path();
                rect.moveTo(0, yPos);
                rect.lineTo(widthPx, yPos);
                rect.lineTo(widthPx, yPos + heightPx);
                rect.lineTo(0, yPos + heightPx);
                rect.closePath();
                return rect.toString();
            });
        }

        bars.on("mouseover", (event, row) => {
            const header = row.tooltipLabel === "" ? row.label : row.tooltipLabel;
            const body =
                row.tooltip === ""
                    ? escapeHtml(row.value.toLocaleString())
                    : escapeHtml(row.tooltip);
            tooltip.show(
                event,
                `<strong>${escapeHtml(header)}</strong><br>` +
                    `<span class="msc-chart-tooltip__stat">${body}</span>`,
            );
        })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        if (this._brushEnabled) {
            this._attachBrush(inner, categorical, rows, isVertical, innerWidth, innerHeight);
        }

        return svg.node();
    }

    /**
     * Attach a d3-brush along the categorical axis. The brush emits a
     * `selectionChanged` CustomEvent on the host element with `detail = {
     * labels: string[] }` so the consumer can cross-filter without depending on
     * d3 internals.
     *
     * @param {import("d3-selection").Selection<SVGGElement, unknown, null, undefined>} inner
     * @param {import("d3-scale").ScaleBand<string>} categorical
     * @param {Array<{label: string}>} rows
     * @param {boolean} isVertical
     * @param {number} innerWidth
     * @param {number} innerHeight
     */
    _attachBrush(inner, categorical, rows, isVertical, innerWidth, innerHeight) {
        const brushAxisLength = isVertical ? innerWidth : innerHeight;
        const target = this.target;

        const brush = brushX().extent([
            [0, 0],
            isVertical ? [innerWidth, innerHeight] : [innerHeight, innerWidth],
        ]);

        brush.on("end", (event) => {
            if (event.selection === null) {
                target.dispatchEvent(
                    new CustomEvent("selectionChanged", {
                        detail: { labels: [] },
                    }),
                );
                return;
            }

            const [lo, hi] = event.selection;
            const selectedLabels = rows
                .map((row) => row.label)
                .filter((label) => {
                    const start = categorical(label);
                    if (typeof start !== "number") {
                        return false;
                    }
                    const end = start + categorical.bandwidth();
                    return end > lo && start < hi;
                });

            target.dispatchEvent(
                new CustomEvent("selectionChanged", {
                    detail: { labels: selectedLabels },
                }),
            );
        });

        const brushLayer = inner.append("g").attr("class", "msc-bar-chart-bar-brush");

        if (!isVertical) {
            // For horizontal bars the brush runs along the value
            // axis (visually horizontal), so the categorical-axis
            // length is `innerHeight`; rotate the brush group to
            // align with the categorical axis.
            brushLayer.attr("transform", `rotate(90) translate(0, -${brushAxisLength})`);
        }

        brushLayer.call(brush);
    }

    /**
     * Remove any svg + placeholder this widget rendered earlier so redraw()
     * never stacks.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.msc-bar-chart, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }
}
