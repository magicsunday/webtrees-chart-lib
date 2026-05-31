/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { extent, max, min } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { scaleLinear, scaleOrdinal } from "d3-scale";
import { schemeTableau10 } from "d3-scale-chromatic";
import { select } from "d3-selection";
import { area, curveBasis, stack, stackOffsetSilhouette, stackOrderInsideOut } from "d3-shape";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { pickPositive } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

/* Horizontal margins reserve half-width of the widest tick label
   (a formatted step value plus its suffix) so the first / last step
   label is never clipped by the SVG edge. Mono 12 px at ~7 px per
   glyph → ~42 px wide → 21 px each side; rounded up to 24 for slack. */
const DEFAULT_MARGIN = { top: 4, right: 24, bottom: 28, left: 24 };
const DEFAULT_HEIGHT = 240;

/**
 * Silhouette stream-graph showing the value of several stacked categorical
 * bands across an ordered numeric axis (the `steps`). Each band is one category
 * from `names`; its vertical thickness in a column is that category's value at
 * that step. The x-axis is generic — steps are plain numbers formatted with the
 * optional `stepSuffix`.
 *
 * Empty/null/undefined data or a series without any names/steps renders the
 * shared empty-state placeholder via BaseWidget.
 *
 * Selection: clicking a band registers through `onSelectionChanged`, whose
 * callback receives `{ source, predicate: { name } | null }` (a second click on
 * the same band clears it), and toggles `.is-selected` on the band. The widget
 * sets no inline opacity — dimming the rest is a host-stylesheet concern via
 * `:has(.is-selected) :not(.is-selected)`, mirroring the hover-dim rule.
 *
 * Styling hooks (the consumer's stylesheet owns colour — bands are filled from
 * an ordinal scale that a host rule overrides without `!important`): the root is
 * `svg.wt-stream-graph` wrapping one inner `<g>` that holds one
 * `path.band` per category (each carrying `data-name`), an `.x-axis` group of
 * step ticks, and an (empty, axis-suppressed) `.y-axis` group.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class StreamGraph extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     emptyMessage?: string,
     *     ariaLabel?: string,
     *     i18n?: {
     *         stepSuffix?: string,
     *         totalSingular?: string,
     *         totalPlural?: string,
     *         peakInPattern?: string,
     *         ariaBandPattern?: string
     *     }
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.height = this.options.height;
        this.width = this.options.width;
        this.margin = this.options.margin;
        this.ariaLabel = this.options.ariaLabel;
        this.i18n = this.options.i18n;
        this.emptyMessage = this.options.emptyMessage;
    }

    /**
     * The overall SVG height in pixels. A non-positive or non-finite value falls
     * back to the default height so the chart always has vertical room.
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
        this._height = pickPositive(value, DEFAULT_HEIGHT);
    }

    /**
     * The inner-content margins (top/right/bottom/left in pixels). Caller-supplied
     * keys are merged over the defaults so a partial object still yields a
     * complete margin set.
     *
     * @returns {{top: number, right: number, bottom: number, left: number}}
     */
    get margin() {
        return this._margin;
    }

    /**
     * @param {{top?: number, right?: number, bottom?: number, left?: number}|undefined} value
     *   The margin overrides; missing keys keep their default. The runtime guard
     *   keeps the JSON dispatcher (which assigns untyped values) safe.
     */
    set margin(value) {
        this._margin = { ...DEFAULT_MARGIN, ...(value ?? {}) };
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
     * The accessible name applied to the chart's root `<svg>`.
     *
     * @returns {string}
     */
    get ariaLabel() {
        return this._ariaLabel;
    }

    /**
     * @param {string|undefined} value The aria-label; a missing or empty value
     *   resets to the default. The runtime guard keeps the JSON dispatcher safe.
     */
    set ariaLabel(value) {
        this._ariaLabel = typeof value === "string" && value !== "" ? value : "Stream graph";
    }

    /**
     * The i18n string pack used for the tooltip copy. Defaults to an empty
     * object so each lookup falls back to its built-in English variant.
     *
     * @returns {object}
     */
    get i18n() {
        return this._i18n;
    }

    /**
     * @param {object|undefined} value The i18n overrides; a non-object value
     *   resets to an empty pack. The runtime guard keeps the JSON dispatcher safe.
     */
    set i18n(value) {
        this._i18n = typeof value === "object" && value !== null ? value : {};
    }

    /**
     * The placeholder text shown when the payload is empty or has no
     * names/steps.
     *
     * @returns {string}
     */
    get emptyMessage() {
        return this._emptyMessage;
    }

    /**
     * @param {string|undefined} value The placeholder text; a non-string value
     *   resets to the default. The runtime guard keeps the JSON dispatcher safe.
     */
    set emptyMessage(value) {
        this._emptyMessage = typeof value === "string" ? value : "No data available";
    }

    /**
     * @param {{
     *     steps: Array<number>,
     *     names:   Array<string>,
     *     series:  Object<string, Object<number, number>>
     * }|null|undefined} data
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        if (
            !data ||
            !Array.isArray(data.steps) ||
            data.steps.length === 0 ||
            !Array.isArray(data.names) ||
            data.names.length === 0
        ) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const height = this._height;
        const margin = this._margin;
        const width = Math.max(360, pickPositive(this._width, this.target.clientWidth) || 900);
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // Transform into the dense row-per-step shape d3.stack expects.
        const rows = data.steps.map((step) => {
            const row = { step };
            data.names.forEach((name) => {
                row[name] = data.series[name]?.[step] || 0;
            });
            return row;
        });

        const series = stack()
            .keys(data.names)
            .offset(stackOffsetSilhouette)
            .order(stackOrderInsideOut)(rows);

        const xScale = scaleLinear()
            .domain(extent(rows, (row) => row.step))
            .range([0, innerWidth]);

        // Add a small headroom above + below the silhouette envelope
        // so the outermost bands don't touch the SVG edges.
        const yLower = min(series, (band) => min(band, (point) => point[0])) ?? 0;
        const yUpper = max(series, (band) => max(band, (point) => point[1])) ?? 0;
        const yPad = Math.max((yUpper - yLower) * 0.08, 1);
        const yScale = scaleLinear()
            .domain([yLower - yPad, yUpper + yPad])
            .range([innerHeight, 0]);

        const colour = scaleOrdinal().domain(data.names).range(schemeTableau10);

        // Each band's datum is a d3-stack SeriesPoint: a `[lower, upper]` tuple
        // carrying the original per-step row on `.data`. The row is keyed by
        // step + series name, all numeric, so an index signature matches what
        // d3.stack() infers (and `.data.step` reads through it).
        /** @typedef {import("d3-shape").SeriesPoint<{ [key: string]: number }>} StreamPoint */
        const areaPath = /** @type {import("d3-shape").Area<StreamPoint>} */ (area())
            .x((point) => xScale(point.data.step))
            .y0((point) => yScale(point[0]))
            .y1((point) => yScale(point[1]))
            .curve(curveBasis);

        // Flat baseline path for the on-load animation.
        const yMid = yScale((yLower + yUpper) / 2);
        const flatPath = /** @type {import("d3-shape").Area<StreamPoint>} */ (area())
            .x((point) => xScale(point.data.step))
            .y0(yMid)
            .y1(yMid)
            .curve(curveBasis);

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-stream-graph")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel);

        // Centre inner content vertically inside the SVG. The bottom
        // margin holds the x-axis tick labels; without a top
        // counterpart the rendered <g> bounding box drifts downward
        // by half the asymmetry. A small upward shim brings the bbox
        // back to centre, derived from the margins so a future caller
        // that swaps in different margins still gets a centred chart.
        const verticalCentringShim = Math.round((margin.bottom - margin.top) / 2);
        const inner = svg
            .append("g")
            .attr("transform", `translate(${margin.left}, ${margin.top - verticalCentringShim})`);

        const bandTotals = new Map(
            series.map((band) => [
                band.key,
                band.reduce((sum, point) => sum + (point[1] - point[0]), 0),
            ]),
        );

        const peakStep = (band) => {
            let bestStep = band[0]?.data?.step ?? null;
            let bestSize = -Infinity;
            band.forEach((point) => {
                const size = point[1] - point[0];
                if (size > bestSize) {
                    bestSize = size;
                    bestStep = point.data.step;
                }
            });
            return bestStep;
        };

        // i18n option pack — every string falls back to the canonical
        // English variant when the host doesn't override it. The patterns
        // use curly-brace placeholders ({count}, {step}, {name}/{total}/
        // {peak}) rather than sprintf %s tokens, since a host that pipes
        // msgids through sprintf would mangle bare %s.
        const i18n = this._i18n;
        const stepSuffix = i18n.stepSuffix ?? "s";
        const stepFmt = (step) => `${step}${stepSuffix}`;
        const totalLabel = (count) => {
            const template =
                count === 1
                    ? (i18n.totalSingular ?? "{count} item")
                    : (i18n.totalPlural ?? "{count} items");
            return template.replace("{count}", String(count));
        };
        const peakLabel = (step) => {
            const template = i18n.peakInPattern ?? "peak at {step}";
            return template.replace("{step}", stepFmt(step));
        };

        const bands = inner
            .selectAll("path.band")
            .data(series)
            .enter()
            .append("path")
            .attr("class", "band")
            .attr("data-name", (band) => band.key)
            .attr("fill", (band) => colour(band.key))
            .attr("opacity", 0)
            .attr("d", (point) => flatPath(point))
            .attr("tabindex", "0")
            .attr("aria-label", (band) => {
                const total = Math.round(bandTotals.get(band.key) ?? 0);
                const ariaTpl = i18n.ariaBandPattern ?? "{name}: {total}, {peak}";
                return ariaTpl
                    .replace("{name}", band.key)
                    .replace("{total}", totalLabel(total))
                    .replace("{peak}", peakLabel(peakStep(band)));
            });

        // Entry: bands fade in (opacity 0 → 0.85) and grow from the flat
        // baseline to their silhouette, staggered by band index. The initial
        // keyframe is set above; _runEntry animates inline, holds for
        // reveal-on-scroll, or jumps to the final state under reduced motion.
        this._runEntry((animate) => {
            this._enter(bands, animate, "stream-graph-enter", 900, (_, index) => index * 40)
                .attr("opacity", 0.85)
                .attr("d", (point) => areaPath(point));
        });

        const bandTooltipHtml = (band) => {
            const total = Math.round(bandTotals.get(band.key) ?? 0);
            const peak = peakStep(band);
            return (
                `<strong>${escapeHtml(band.key)}</strong><br>` +
                `<span class="wt-chart-tooltip__stat">${escapeHtml(totalLabel(total))}</span><br>` +
                `<span class="wt-chart-tooltip__meta">${escapeHtml(peakLabel(peak))}</span>`
            );
        };

        bands
            .on("mouseover", (event, band) => tooltip.show(event, bandTooltipHtml(band)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide())
            .on("focus", (event, band) => {
                // Keyboard focus has no cursor; pin to the band's top edge.
                const bbox = event.target.getBoundingClientRect();
                tooltip.show(
                    { clientX: bbox.left + bbox.width / 2, clientY: bbox.top + 12 },
                    bandTooltipHtml(band),
                );
            })
            .on("blur", () => tooltip.hide());

        // Click → toggle selection on the band's series key. The
        // predicate's `name` matches StreamGraph's payload key so
        // dashboard-bus consumers can derive whatever filter shape
        // they need.
        const self = this;
        bands.style("cursor", "pointer").on("click", function onClick(_event, band) {
            const { predicate } = self._emitSelection({ name: band.key });
            self._applyStreamSelectionStyles(bands, predicate);
        });

        // Tick values pinned to round 50-unit steps. The leading
        // tick is the smallest 50-multiple ≥ domainMin (use ceil,
        // not floor — flooring would emit a stray tick below
        // domainMin, sitting to the LEFT of the silhouette
        // envelope). If the leading round step is
        // already greater than domainMin, prepend domainMin
        // explicitly so the leftmost tick label marks the start of
        // the band envelope. Mirror handling on the trailing edge
        // appends domainMax when the largest in-range step stops
        // short. d3's default `ticks(N)` picks "nice" round values
        // that often stop short of either domain boundary, leaving
        // unbalanced gaps between the labels and the silhouette.
        const [domainMin, domainMax] = xScale.domain();
        const stepSpan = 50;
        const tickStart = Math.ceil(domainMin / stepSpan) * stepSpan;
        const tickValues = [];
        if (tickStart > domainMin) {
            tickValues.push(domainMin);
        }
        for (let value = tickStart; value <= domainMax; value += stepSpan) {
            tickValues.push(value);
        }
        if (tickValues[tickValues.length - 1] !== domainMax) {
            tickValues.push(domainMax);
        }
        inner
            .append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(axisBottom(xScale).tickValues(tickValues).tickFormat(stepFmt))
            .select(".domain")
            .remove();

        // Hide the y axis: a stream graph reads as relative magnitudes;
        // absolute counts live in the band tooltips.
        inner
            .append("g")
            .attr("class", "y-axis")
            .call(axisLeft(yScale).ticks(0).tickSize(0))
            .select(".domain")
            .remove();

        return svg.node();
    }

    /**
     * Remove any svg + empty-state placeholder this widget rendered earlier so
     * redraw() never stacks or leaves cross-state remnants.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-stream-graph, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }

    /**
     * Toggle the `.is-selected` class on whichever band matches the current
     * predicate's series key; cleared selection removes the class from every
     * band. The widget never sets inline opacity — dim is a host-stylesheet
     * concern via `:has(.is-selected) :not(.is-selected)` rules mirroring the
     * existing `:has(path.band:hover) path.band:not(:hover)` hover-dim rule, so
     * click + hover read identically.
     *
     * @param {import("d3-selection").Selection<SVGPathElement, {key: string}, SVGGElement, unknown>} bands
     * @param {object|null} predicate
     */
    _applyStreamSelectionStyles(bands, predicate) {
        if (predicate === null) {
            bands.classed("is-selected", false);
            return;
        }
        // Visual dim of non-selected bands is a host-stylesheet
        // concern via `:has(.is-selected) :not(.is-selected)`,
        // mirroring the existing `:has(path.band:hover) path.band:not(:hover)`
        // hover-dim rule.
        bands.classed("is-selected", (band) => band.key === predicate.name);
    }
}
