/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { max as d3Max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { scaleBand, scaleLinear, scaleOrdinal } from "d3-scale";
import { schemeTableau10 } from "d3-scale-chromatic";
import { select } from "d3-selection";
import { stack } from "d3-shape";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { pickFraction, pickPositive } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 280,
    margin: { top: 12, right: 24, bottom: 32, left: 48 },
    barPadding: 0.2,
    legend: true,
    percentage: false,
};

// Horizontal spacing between adjacent legend items. Shared between
// `_renderLegend` (actual draw spacing) and `_countLegendRows`
// (predicted band height) so the predicted row count can never
// drift away from the rendered layout if the constant is tuned.
const LEGEND_ITEM_SPACING = 28;

/**
 * Stacked bar chart for compositional payloads. Each category carries a stack
 * of series-keyed values that sum to the bar height; the layout uses d3-shape's
 * `stack()` so segment ordering matches the order series arrive in.
 *
 * Tooltip surfaces both the hovered segment's value AND the category's total,
 * which is what the caller usually wants to see when comparing across categories
 * (e.g. "4 in category A for series X, 27 total in category A").
 *
 * Per-series colour comes from the `series[i].class` field when provided (CSS
 * class hook), otherwise falls back to a small categorical palette. Colour
 * palette is not opinionated — the caller is expected to layer their own design
 * tokens via the CSS class hook on hot paths.
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget ships no
 * opinionated palette): `.wt-stacked-bar` (root svg) wraps one inner `<g>`
 * holding `.x-axis` and `.y-axis`, a `<g class="stacks">` of per-series
 * `<g class="series">` (each also carrying any caller-supplied `series[i].class`)
 * whose segments are `rect.segment`, and — when the legend is enabled — a
 * `<g class="stack-legend">` of per-entry groups, each with a `.legend-swatch`
 * (plus any caller-supplied class) and a `text.legend-label`.
 *
 * The widget emits no selection event.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class StackedBar extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     barPadding?: number,
     *     legend?: boolean,
     *     percentage?: boolean,
     *     emptyMessage?: string,
     *     ariaLabel?: string,
     *     i18n?: {
     *         totalInCategoryPattern?: string
     *     }
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this._defaultMargin = DEFAULT_OPTIONS.margin;
        this.margin = this.options.margin;
        this.barPadding = this.options.barPadding;
        this.legend = this.options.legend;
        this.percentage = this.options.percentage;
        this._defaultAriaLabel = "Stacked bar chart";
        this.ariaLabel = this.options.ariaLabel;
        this.i18n = this.options.i18n;
    }

    /**
     * The fractional gap between adjacent bars, in `[0, 0.95]`. A non-finite
     * value falls back to the default; out-of-range values clamp to the bounds.
     *
     * @returns {number}
     */
    get barPadding() {
        return this._barPadding;
    }

    /**
     * @param {number|undefined} value The bar-padding fraction; a non-finite
     *   value resets to the default, negatives clamp to `0` and values above
     *   `0.95` clamp to `0.95`. The runtime guard keeps the JSON dispatcher safe.
     */
    set barPadding(value) {
        this._barPadding = pickFraction(value, DEFAULT_OPTIONS.barPadding);
    }

    /**
     * Whether the per-series legend renders below the chart.
     *
     * @returns {boolean}
     */
    get legend() {
        return this._legend;
    }

    /**
     * @param {boolean|undefined} value Toggle the legend; a non-boolean value
     *   resets to the default. The runtime guard keeps the JSON dispatcher
     *   (which assigns untyped values) safe.
     */
    set legend(value) {
        this._legend = typeof value === "boolean" ? value : DEFAULT_OPTIONS.legend;
    }

    /**
     * Whether each bar is normalised to sum to 100 percent (composition mode)
     * instead of stacking raw magnitudes.
     *
     * @returns {boolean}
     */
    get percentage() {
        return this._percentage;
    }

    /**
     * @param {boolean|undefined} value Toggle percentage mode; a non-boolean
     *   value resets to the default. The runtime guard keeps the JSON dispatcher
     *   (which assigns untyped values) safe.
     */
    set percentage(value) {
        this._percentage = typeof value === "boolean" ? value : DEFAULT_OPTIONS.percentage;
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
     * @param {{
     *     categories: string[],
     *     tooltipLabels?: string[],
     *     series: Array<{name: string, data: number[], class?: string}>
     * }|null|undefined} data
     *   `categories` is the x-axis label list in display order;
     *   `tooltipLabels[i]` is the optional long-form header the
     *   tooltip displays for category `i` (defaults to
     *   `categories[i]`). `series[i].data[j]` is the value of
     *   series `i` for category `j`. Each series may carry a CSS
     *   `class` so the consumer can theme segments via the host
     *   stylesheet instead of mutating the widget's palette.
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const validated = this._validate(data);
        if (validated === null) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const { categories, tooltipLabels, series } = validated;
        const width = Math.max(240, pickPositive(this._width, this.target.clientWidth) || 600);
        // Pre-compute how many rows the legend will need at the
        // current width so the bottom margin reserves enough space
        // for every row. A fixed 20 px would clip the second + third
        // legend rows when the labels wrap on a narrow viewport
        // (e.g. several long series labels at 393 px wrap to extra
        // rows).
        const legendRows = this._legend ? this._countLegendRows(series, width, this._margin) : 0;
        const legendRowHeight = 14;
        const legendBandHeight = legendRows > 0 ? legendRows * legendRowHeight + 6 : 0;
        const baseHeight =
            pickPositive(this._height, this.target.clientHeight) || DEFAULT_OPTIONS.height;
        const height = baseHeight + Math.max(0, legendBandHeight - 20);
        const margin = {
            ...this._margin,
            bottom: this._margin.bottom + legendBandHeight,
        };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        // d3-shape's stack works off an array of row objects keyed
        // by series name; transpose `series[i].data[j]` into one
        // row per category.
        const rows = categories.map((label, index) => {
            const row = { label };
            for (const s of series) {
                row[s.name] = Number(s.data[index] ?? 0);
            }
            return row;
        });

        const keys = series.map((s) => s.name);
        const totals = rows.map((row) =>
            keys.reduce((sum, key) => sum + (Number(row[key]) || 0), 0),
        );

        // In percentage mode each bar is normalised to sum to 100;
        // the layout stacks the share rather than the raw count, so
        // the visual encoding emphasises composition over magnitude.
        // Raw counts stay reachable through `rows` for tooltip/aria
        // copy, so the user still sees the underlying numbers.
        const layoutRows = this._percentage
            ? rows.map((row, index) => {
                  const total = totals[index];
                  if (total <= 0) {
                      return { ...row };
                  }
                  const scaled = { label: row.label };
                  for (const key of keys) {
                      scaled[key] = ((Number(row[key]) || 0) / total) * 100;
                  }
                  return scaled;
              })
            : rows;

        const stackLayout = stack().keys(keys)(
            /** @type {Array<{ [key: string]: number }>} */ (/** @type {unknown} */ (layoutRows)),
        );
        const valueMax = this._percentage ? 100 : (d3Max(totals) ?? 1);

        const x = scaleBand().domain(categories).range([0, innerWidth]).padding(this._barPadding);

        const y = scaleLinear().domain([0, valueMax]).nice().range([innerHeight, 0]);

        const colour = scaleOrdinal()
            .domain(keys)
            .range(
                series.map((s, index) =>
                    typeof s.class === "string" && s.class !== ""
                        ? null
                        : schemeTableau10[index % schemeTableau10.length],
                ),
            );

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-stacked-bar")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel);

        const inner = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

        // Thin x-axis labels when there are too many to fit
        // horizontally — pin .tickValues() to roughly every Nth
        // category so the axis stays readable on dense category
        // sets (e.g. 40+ categories). Mirrors the StreamGraph's
        // `.ticks(Math.min(rows.length, 8))` auto-thinning. The
        // tooltip still surfaces every category's value on hover,
        // so no category is lost — only the labels thin out.
        const targetTicks = 10;
        const tickStride = Math.max(1, Math.ceil(categories.length / targetTicks));
        const tickedAxis = axisBottom(x);
        if (tickStride > 1) {
            tickedAxis.tickValues(categories.filter((_, i) => i % tickStride === 0));
        }

        inner
            .append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0, ${innerHeight})`)
            .call(tickedAxis)
            .select(".domain")
            .remove();

        inner
            .append("g")
            .attr("class", "y-axis")
            .call(
                axisLeft(y)
                    .ticks(5)
                    .tickFormat((value) =>
                        this._percentage
                            ? `${Number(value).toLocaleString()}%`
                            : Number(value).toLocaleString(),
                    ),
            )
            .select(".domain")
            .remove();

        const seriesGroups = inner
            .append("g")
            .attr("class", "stacks")
            .selectAll("g.series")
            .data(stackLayout)
            .enter()
            .append("g")
            .attr("class", (_d, index) => {
                const seriesEntry = series[index];
                const cssClass =
                    typeof seriesEntry?.class === "string" && seriesEntry.class !== ""
                        ? ` ${seriesEntry.class}`
                        : "";
                return `series${cssClass}`;
            })
            .attr("data-series-name", (_d, index) => series[index]?.name ?? "")
            .attr("fill", (d) => colour(d.key) ?? "");

        const segments = seriesGroups
            .selectAll("rect.segment")
            .data((d) => d)
            .enter()
            .append("rect")
            .attr("class", "segment")
            .attr("x", (segment) => x(String(segment.data.label)) ?? 0)
            .attr("width", x.bandwidth())
            .attr("y", innerHeight)
            .attr("height", 0)
            .attr("tabindex", "0")
            .attr("aria-label", function (segment) {
                const seriesNode = /** @type {Element | null} */ (this.parentNode);
                const seriesName = seriesNode?.getAttribute("data-series-name") ?? "";
                const categoryIndex = categories.indexOf(String(segment.data.label));
                const rawValue = Number(rows[categoryIndex]?.[seriesName]) || 0;
                return `${segment.data.label} / ${seriesName}: ${rawValue.toLocaleString()}`;
            });

        // Entry: each segment grows up from the baseline. Initial keyframe
        // (y = baseline, height 0) set above; _runEntry animates inline, holds
        // for reveal-on-scroll, or jumps to the final geometry under reduced
        // motion.
        this._runEntry((animate) => {
            this._enter(segments, animate, "stack-enter", 750)
                .attr("y", (segment) => y(segment[1]))
                .attr("height", (segment) => y(segment[0]) - y(segment[1]));
        });

        // Hover handlers re-bind from the parent so we can read the
        // series-name attribute the d3.attr() function above already
        // wrote — keeps the segment->series mapping local to the DOM.
        const widgetSelf = this;
        inner.selectAll("rect.segment").on("mouseover", function (event, segment) {
            const seriesName =
                /** @type {Element | null} */ (
                    /** @type {SVGRectElement} */ (this).parentNode
                )?.getAttribute("data-series-name") ?? "";
            const seg = /** @type {{ data: { [key: string]: number } }} */ (segment);
            const categoryIndex = categories.indexOf(String(seg.data.label));
            const value = Number(rows[categoryIndex]?.[seriesName]) || 0;
            const total = totals[categoryIndex] ?? 0;
            const share = total > 0 ? Math.round((value / total) * 100) : 0;
            const header = tooltipLabels[categoryIndex] ?? String(seg.data.label);
            const totalCategoryTpl =
                widgetSelf._i18n.totalInCategoryPattern ?? "{count} total in this category";
            tooltip.show(
                event,
                `<strong>${escapeHtml(header)}</strong><br>` +
                    `<span class="wt-chart-tooltip__row">${escapeHtml(seriesName)}: ${escapeHtml(value.toLocaleString())} (${share}%)</span><br>` +
                    `<span class="wt-chart-tooltip__sub">${escapeHtml(totalCategoryTpl.replace("{count}", total.toLocaleString()))}</span>`,
            );
        });

        inner
            .selectAll("rect.segment")
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        if (this._legend) {
            this._renderLegend(svg, series, colour, width, height, margin, legendRows);
        }

        return svg.node();
    }

    /**
     * Validate the input payload into a normalised `{categories, series}`
     * shape, or return null to signal the empty-state path.
     *
     * @param {unknown} data
     *
     * @returns {{categories: string[], tooltipLabels: string[], series: Array<{name: string, data: number[], class?: string}>}|null}
     */
    _validate(data) {
        if (data === null || data === undefined || typeof data !== "object") {
            return null;
        }
        const payload =
            /** @type {{categories?: unknown, series?: unknown, tooltipLabels?: unknown}} */ (data);
        const categories = Array.isArray(payload.categories)
            ? payload.categories.filter((label) => typeof label === "string" && label !== "")
            : [];
        const seriesIn = Array.isArray(payload.series) ? payload.series : [];

        if (categories.length === 0 || seriesIn.length === 0) {
            return null;
        }

        // `tooltipLabels` mirrors the LineChart contract: a parallel
        // array of long-form headers shown in the tooltip while the
        // shorter `categories` stay on the x-axis. Missing entries
        // fall back to the matching category so callers can opt in
        // per chart.
        const tooltipLabels = categories.map((label, index) => {
            const candidate = Array.isArray(payload.tooltipLabels)
                ? payload.tooltipLabels[index]
                : undefined;
            return typeof candidate === "string" && candidate !== "" ? candidate : label;
        });

        const series = seriesIn
            .filter((s) => s !== null && typeof s === "object" && Array.isArray(s.data))
            .map((s) => ({
                name: String(s.name ?? ""),
                class: typeof s.class === "string" ? s.class : "",
                data: categories.map((_, index) => {
                    const value = Number(s.data[index] ?? 0);
                    return Number.isFinite(value) && value >= 0 ? value : 0;
                }),
            }))
            .filter((s) => s.name !== "");

        if (series.length === 0) {
            return null;
        }

        const anyValue = series.some((s) => s.data.some((value) => value > 0));
        if (!anyValue) {
            return null;
        }

        return { categories, tooltipLabels, series };
    }

    /**
     * Render a compact legend below the chart. Each item carries a colour
     * swatch matching the corresponding series so the stacking order remains
     * discoverable without hovering.
     *
     * @param {import("d3-selection").Selection<SVGSVGElement, unknown, null, undefined>} svg
     * @param {Array<{name: string, class?: string}>} series
     * @param {import("d3-scale").ScaleOrdinal<string, string>} colour
     * @param {number} width
     * @param {number} height
     * @param {{top: number, right: number, bottom: number, left: number}} margin
     */
    /**
     * Predict how many rows the wrapping legend will use at the supplied width.
     * Shares the per-label width heuristic with {@link _renderLegend} (7 px /
     * char advance + swatch + gap) so the reserved bottom band matches the
     * rendered layout.
     *
     * @param {Array<{name: string}>} series
     * @param {number} width
     * @param {{left: number, right: number}} margin
     * @returns {number}
     */
    _countLegendRows(series, width, margin) {
        const swatchSize = 10;
        const labelGap = 4;
        const itemSpacing = LEGEND_ITEM_SPACING;
        const wrapLimit = width - margin.right;
        let xOffset = margin.left;
        let rows = 1;

        for (const entry of series) {
            const labelWidth = swatchSize + labelGap + entry.name.length * 7;

            if (xOffset > margin.left && xOffset + labelWidth > wrapLimit) {
                xOffset = margin.left;
                rows += 1;
            }

            xOffset += labelWidth + itemSpacing;
        }

        return rows;
    }

    _renderLegend(svg, series, colour, width, height, margin, legendRows) {
        const legend = svg.append("g").attr("class", "stack-legend");
        const swatchSize = 10;
        const labelGap = 4;
        // 28 px matches the line-chart legend's spacing so multi-band
        // labels in this widget read in the same rhythm as the
        // multi-series legends on the line-chart side. 16 px crowded
        // wider glyphs (em-dash, arrow, ×) on smaller cards. Lifted
        // to a module-level constant so the predicted band height in
        // {@link _countLegendRows} can't drift away from the actual
        // spacing used here when the constant is tuned.
        const itemSpacing = LEGEND_ITEM_SPACING;
        const rowHeight = swatchSize + 4;
        let xOffset = margin.left;
        // Place the legend in the reserved bottom band — below the
        // x-axis tick labels rather than above the chart. The
        // `-swatchSize / 2` shifts the swatch's vertical centre to
        // the band's centreline so the labels and swatches share
        // a single optical baseline. For multi-row legends the
        // FIRST row needs to start `(rows - 1) * rowHeight` higher
        // up so the LAST row still lands on the same bottom
        // baseline as a single-row legend.
        const totalRows = Math.max(1, legendRows ?? 1);
        let yOffset = height - 4 - swatchSize / 2 - (totalRows - 1) * rowHeight;
        const wrapLimit = width - margin.right;

        for (const entry of series) {
            // Approximate text width: SVG cannot measure text without
            // a DOM layout pass, so use a conservative 7 px / char
            // advance plus the swatch + gap. This is a best-effort
            // wrap heuristic; the host stylesheet can tighten the
            // legend with letter-spacing if the result is too sparse.
            const labelWidth = swatchSize + labelGap + entry.name.length * 7;

            // Wrap BEFORE drawing when the current item wouldn't
            // fit inside the legend band. The previous "increment
            // first, wrap next" rule placed the overflowing item on
            // the row that already lacked room for it, so its right
            // edge clipped at the SVG boundary on narrow viewports
            // (a long trailing label lost its tail at 393 px). Skip
            // the wrap for the first item on a row to avoid the
            // empty-leading-wrap edge case when an oversized label
            // still doesn't fit even on its own line.
            if (xOffset > margin.left && xOffset + labelWidth > wrapLimit) {
                xOffset = margin.left;
                yOffset += rowHeight;
            }

            const group = legend.append("g").attr("transform", `translate(${xOffset}, ${yOffset})`);
            group
                .append("rect")
                .attr("class", `legend-swatch${entry.class === "" ? "" : ` ${entry.class}`}`)
                .attr("width", swatchSize)
                .attr("height", swatchSize)
                .attr("y", -swatchSize / 2)
                .attr("fill", colour(entry.name) ?? "");
            group
                .append("text")
                .attr("x", swatchSize + labelGap)
                .attr("y", 0)
                .attr("dominant-baseline", "middle")
                .attr("class", "legend-label")
                .text(entry.name);

            xOffset += labelWidth + itemSpacing;
        }
    }

    /**
     * Remove any svg + placeholder this widget rendered earlier so redraw()
     * never stacks.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-stacked-bar, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }
}
