/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { interpolate } from "d3-interpolate";
import { select } from "d3-selection";
import { arc as d3Arc, pie as d3Pie } from "d3-shape";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { pickPositive } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    width: 250,
    padding: 1,
};

/**
 * D3-powered donut chart with one <path> per data row and caller-controlled CSS
 * classes. The svg fills the `width` × `height` box and the donut is sized to
 * the smaller side of the box left after the per-side `margin`, then centred
 * within it — so a symmetric margin (the default) renders a centred donut while
 * an asymmetric margin positions it (e.g. reserving one side for a legend). When
 * `height` is unset it falls back to the resolved `width`, keeping an
 * unconstrained donut square.
 *
 * Data contract — `draw(rows)` takes `Array<{label: string, value: number,
 * fill?: string, class?: string, tooltipLabel?: string, tooltipBody?: string}>`:
 * `label` names the slice (and its default tooltip header), `value` its
 * magnitude, optional `fill` its colour, optional `class` an extra CSS class
 * appended to the slice, and the optional `tooltipLabel` / `tooltipBody`
 * override the tooltip header / body text. Empty/null/undefined data, all-zero values,
 * and rows whose values are non-finite or negative all render the shared
 * empty-state placeholder (after coercion). Redraw replaces both prior svg and
 * prior placeholder so the widget is idempotent in either direction.
 *
 * Options — `width`, `height` (responsive when unset; `height` falls back to the
 * resolved `width`), `margin` (`{top, right, bottom, left}` box inset that
 * positions the donut), `padding` (radial gap between the donut edge and the
 * inset box), `holeSize` (inner radius; an explicit 0 renders a full pie),
 * `centerLabel` / `centerValue` (centre text; the value defaults to the
 * formatted total), `emptyMessage`, `ariaLabel`. Each carries a native get/set
 * accessor; `source` is read directly from the options when a selection is
 * emitted (no accessor).
 *
 * Selection — clicking a slice invokes the registered callback
 * (`onSelectionChanged`) with `{ source, predicate: { slice: label } | null }`;
 * a second click on the same slice clears it. `setSelection()` re-applies a
 * sibling widget's bus echo.
 *
 * Styling hooks — the root is `svg.msc-donut-chart`; each slice is a `path.msc-donut-chart-slice`
 * (plus the optional caller `class`); the centre carries
 * `text.msc-donut-chart-center-value` and `text.msc-donut-chart-center-label`. Fill is applied via
 * `.style` rather than `.attr` so the data-supplied value overrides any CSS rule
 * for the slice class.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class DonutChart extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     holeSize?: number,
     *     padding?: number,
     *     width?: number,
     *     height?: number,
     *     margin?: {top?: number, right?: number, bottom?: number, left?: number},
     *     centerLabel?: string,
     *     centerValue?: string,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        // The square side, outer radius, and resolved hole radius are derived
        // render geometry computed in draw() from these fields — they are not
        // config options and carry no accessor.
        this.padding = this.options.padding;
        this.holeSize = this.options.holeSize;
        this.centerLabel = this.options.centerLabel;
        this.centerValue = this.options.centerValue;
    }

    /**
     * The padding in pixels between the outer edge of the donut and the SVG
     * bounds. A non-positive or non-finite value falls back to the default.
     *
     * @returns {number}
     */
    get padding() {
        return this._padding;
    }

    /**
     * @param {number|undefined} value The padding in pixels; a missing or
     *   non-positive value resets to the default. The runtime guard keeps the
     *   JSON dispatcher (which assigns untyped values) safe.
     */
    set padding(value) {
        this._padding = pickPositive(value, DEFAULT_OPTIONS.padding);
    }

    /**
     * The inner-hole radius in pixels. `0` yields a pie chart (no hole). A
     * negative, non-finite, or non-numeric value uses a sentinel so draw()
     * derives the default hole from the outer radius.
     *
     * @returns {number|undefined}
     */
    get holeSize() {
        return this._holeSize;
    }

    /**
     * @param {number|undefined} value The inner-hole radius in pixels; `0` is
     *   honoured (pie), while a negative, non-finite, or non-numeric value clears
     *   the override so draw() derives the hole from the outer radius. The
     *   runtime guard keeps the JSON dispatcher (which assigns untyped values)
     *   safe.
     */
    set holeSize(value) {
        this._holeSize =
            typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
    }

    /**
     * The caption rendered beneath the centre value. An empty string suppresses
     * the caption (and centres the value).
     *
     * @returns {string}
     */
    get centerLabel() {
        return this._centerLabel;
    }

    /**
     * @param {string|undefined} value The centre caption; a non-string value
     *   resets to an empty string (no caption). The runtime guard keeps the JSON
     *   dispatcher (which assigns untyped values) safe.
     */
    set centerLabel(value) {
        this._centerLabel = typeof value === "string" ? value : "";
    }

    /**
     * The headline rendered in the centre of the donut. An empty string falls
     * back at draw time to the localised slice total.
     *
     * @returns {string}
     */
    get centerValue() {
        return this._centerValue;
    }

    /**
     * @param {string|undefined} value The centre headline; a non-string value
     *   resets to an empty string so draw() falls back to the slice total. The
     *   runtime guard keeps the JSON dispatcher (which assigns untyped values)
     *   safe.
     */
    set centerValue(value) {
        this._centerValue = typeof value === "string" ? value : "";
    }

    /**
     * @param {Array<{label: string, value: number, class?: string, fill?: string, tooltipLabel?: string, tooltipBody?: string}>|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const safeRows = sanitizeRows(data);
        const total = safeRows.reduce((acc, row) => acc + row.value, 0);

        if (safeRows.length === 0 || total <= 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        // Resolve the render box responsively from the host element when no
        // explicit override is set; height falls back to the resolved width so
        // an unconstrained donut stays square (the historical default). The
        // shared per-side `margin` then insets the box and positions the donut
        // within it: a symmetric margin (the default) keeps it centred, while an
        // asymmetric margin (e.g. reserving space on one side for a legend)
        // shifts the centre along that axis while it stays centred on the other.
        // `padding` is the radial gap between the donut edge and the box; the
        // hole radius honours an explicit 0 (pie) and otherwise derives from the
        // outer radius.
        const width = pickPositive(this._width, this.target.clientWidth) || DEFAULT_OPTIONS.width;
        const height = pickPositive(this._height, this.target.clientHeight) || width;
        const margin = this._margin;
        const availW = Math.max(0, width - margin.left - margin.right);
        const availH = Math.max(0, height - margin.top - margin.bottom);
        const side = Math.min(availW, availH);
        const radius = Math.max(0, (side >> 1) - this._padding);
        const cx = margin.left + availW / 2;
        const cy = margin.top + availH / 2;
        const holeSize = this._holeSize === undefined ? radius - radius / 10 : this._holeSize;

        /** @typedef {{label: string, value: number, class?: string, fill?: string}} DonutRow */
        /** @typedef {import("d3-shape").PieArcDatum<DonutRow>} DonutSlice */
        /** @typedef {SVGPathElement & { _current: DonutSlice }} DonutSliceNode */
        const arc = /** @type {import("d3-shape").Arc<unknown, DonutSlice>} */ (
            /** @type {unknown} */ (d3Arc().innerRadius(holeSize).outerRadius(radius))
        );

        const pie = /** @type {import("d3-shape").Pie<unknown, DonutRow>} */ (
            /** @type {unknown} */ (d3Pie())
        )
            .padAngle(1 / Math.max(radius, 1))
            .sort(null)
            .value((row) => row.value);

        const svg = select(this.target)
            .append("svg")
            .attr("class", "msc-donut-chart")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("style", "max-width: 100%; height: auto;");

        const slices = svg
            .append("g")
            .attr("class", "msc-donut-chart-slices")
            .attr("transform", `translate(${cx}, ${cy})`)
            .selectAll("path")
            .data(pie(safeRows))
            .join("path")
            .attr("class", (d) =>
                d.data.class ? `msc-donut-chart-slice ${d.data.class}` : "msc-donut-chart-slice",
            );

        slices.each(function (d) {
            if (d.data.fill !== undefined && d.data.fill !== null) {
                /** @type {SVGPathElement} */ (this).style.fill = d.data.fill;
            }
        });

        // Grow each slice from zero sweep to its final angle. Initialise
        // `_current` to the slice's full datum with the end angle collapsed onto
        // the start angle, so the interpolator has a stable zero-sweep origin,
        // and set the initial keyframe to that same zero-sweep (invisible) arc.
        // _runEntry then tweens inline, holds for reveal-on-scroll, or jumps to
        // the final arc under reduced motion.
        slices
            .each(function setInitialAngle(d) {
                /** @type {DonutSliceNode} */ (this)._current = { ...d, endAngle: d.startAngle };
            })
            .attr("d", (d) => arc({ ...d, endAngle: d.startAngle }));

        this._runEntry((animate) => {
            this._enterTween(
                slices,
                animate,
                "donut-enter",
                600,
                (sel) =>
                    sel
                        .attr("d", (d) => arc(d))
                        .each(function setFinalAngle(d) {
                            /** @type {DonutSliceNode} */ (this)._current = d;
                        }),
                (transition) =>
                    transition.attrTween("d", function tweenSlice(d) {
                        const interp = interpolate(
                            /** @type {DonutSliceNode} */ (this)._current,
                            d,
                        );
                        /** @type {DonutSliceNode} */ (this)._current = d;
                        return (t) => arc(interp(t));
                    }),
            );
        });

        const tooltip = createChartTooltip();
        const tooltipHtml = (row) => {
            const value = row.value || 0;
            const share = total > 0 ? (value / total) * 100 : 0;
            const shareLabel = share.toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
            });
            const header =
                typeof row.tooltipLabel === "string" && row.tooltipLabel !== ""
                    ? row.tooltipLabel
                    : row.label;
            const body =
                typeof row.tooltipBody === "string" && row.tooltipBody !== ""
                    ? row.tooltipBody
                    : value.toLocaleString();
            const bodyWithShare = total > 0 ? `${body} · ${shareLabel}%` : body;
            return (
                `<strong>${escapeHtml(header)}</strong><br>` +
                `<span class="msc-chart-tooltip__stat">${escapeHtml(bodyWithShare)}</span>`
            );
        };

        slices
            .on("mouseover", (event, d) => tooltip.show(event, tooltipHtml(d.data)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        // Click → toggle selection. The predicate carries the
        // slice label so the dashboard-bus consumer can derive
        // whatever filter shape it needs. The d3-selection is
        // cached so `setSelection` (called by the bus when a
        // sibling widget emits) can re-apply highlight styles
        // without rebuilding the chart.
        this._slices = slices;
        const self = this;
        slices
            .attr("tabindex", "0")
            .style("cursor", "pointer")
            .on("click", function onClick(_event, d) {
                const { predicate } = self._emitSelection({ slice: d.data.label });
                self._applySelection(predicate);
            });

        // Centre value + label (optional). Rendered last so they
        // paint above the slices. The value is the larger serif
        // headline, the label a small uppercased caption underneath
        // — mirrors the design2 `.gs-donut-value` / `.gs-donut-
        // label` pair.
        // Typography (font-family / font-size / colour / letter-
        // spacing / casing) lives in the host stylesheet under
        // `.msc-donut-chart-center-value` / `.msc-donut-chart-center-label`. Inline
        // styles would beat the host's CSS specificity, so keep
        // only positional attrs here.
        const fallbackValue = this._centerValue === "" ? total.toLocaleString() : this._centerValue;
        svg.append("text")
            .attr("class", "msc-donut-chart-center-value")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("x", cx)
            .attr("y", cy + (this._centerLabel === "" ? 0 : -8))
            .text(fallbackValue);

        if (this._centerLabel !== "") {
            svg.append("text")
                .attr("class", "msc-donut-chart-center-label")
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", cx)
                .attr("y", cy + 18)
                .text(this._centerLabel);
        }

        return svg.node();
    }

    /**
     * Remove any svg and any placeholder this widget rendered earlier so
     * redraw() never stacks or leaves cross-state remnants.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.msc-donut-chart, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }

    /**
     * Toggle the `.is-selected` class on whichever slice matches the current
     * predicate; cleared selection removes the class from every slice. The
     * widget never sets inline opacity for the selection state — dimming is
     * entirely a host-stylesheet concern, which keeps the click visual
     * consistent with the existing hover-dim CSS pattern (typically a
     * `:has(.is-selected) :not(.is-selected)` rule mirroring the `:hover`
     * selectors).
     *
     * Recognised predicate shape: `{slice: <label>}`. A predicate without
     * `slice` (e.g. one emitted by a sibling widget on a dimension this donut
     * doesn't carry) clears the highlight so the donut never displays a stale
     * selection from an unrelated click.
     *
     * @param {object|null} predicate
     * @returns {void}
     */
    _applySelection(predicate) {
        const slices = this._slices;
        if (slices === undefined || slices === null) {
            return;
        }
        if (predicate === null || typeof predicate !== "object" || !("slice" in predicate)) {
            slices.classed("is-selected", false);
            return;
        }
        slices.classed("is-selected", (d) => d.data.label === predicate.slice);
    }
}

/**
 * Coerce raw data into a clean array of `{label, value, …}` rows. Drops rows
 * that are not plain objects or whose value is non-finite or negative (treated
 * as 0 by callers means "skip").
 *
 * @param {unknown} data
 * @returns {Array<{label: string, value: number, class?: string, fill?: string, tooltipLabel?: string, tooltipBody?: string}>}
 */
function sanitizeRows(data) {
    if (!Array.isArray(data)) {
        return [];
    }
    const out = [];
    for (const row of data) {
        if (row === null || typeof row !== "object") {
            continue;
        }
        const value = Number.isFinite(row.value) && row.value > 0 ? row.value : 0;
        out.push({
            ...row,
            label: typeof row.label === "string" ? row.label : String(row.label ?? ""),
            value,
        });
    }
    return out.filter((row) => row.value > 0);
}
