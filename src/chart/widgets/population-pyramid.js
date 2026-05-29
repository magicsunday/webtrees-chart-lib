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
 * Population pyramid — a horizontal mirrored bar chart of one count series per
 * sex across age bands, with a century picker above the chart. Male bars grow
 * left from the centre axis, female bars grow right; the age bands stack
 * vertically with the band label printed once in the centre gutter.
 *
 * Both sexes share a single value scale (the peak count across BOTH sides of
 * the selected century) so the bar lengths are directly comparable. Switching
 * the century via the picker redraws the bars only; the picker chrome persists.
 *
 * Clicking a bar emits `{dimension: "ageBand", value: <band>, sex: "M"|"F"}` to
 * the shared selection bus for cross-widget filtering.
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
     *     maleLabel?: string,
     *     femaleLabel?: string,
     *     centuryLabel?: (century: string) => string,
     *     emptyMessage?: string,
     *     source?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);

        const { width, height } = this.dimensions({ width: 720, height: 460 });
        this._width = width;
        this._height = height;
        this._maleLabel = typeof this.options.maleLabel === "string" ? this.options.maleLabel : "M";
        this._femaleLabel =
            typeof this.options.femaleLabel === "string" ? this.options.femaleLabel : "F";
        this._ariaLabel = typeof this.options.ariaLabel === "string" ? this.options.ariaLabel : "";
        this._centuryFormat =
            typeof this.options.centuryLabel === "function"
                ? this.options.centuryLabel
                : (century) => String(century);

        /**
         * The single shared body-level tooltip, lazily created on first draw and
         * reused across picker re-draws so a hover left visible on a bar that a
         * century switch removes can be hidden explicitly.
         *
         * @type {ReturnType<typeof createChartTooltip>|null}
         * @private
         */
        this._tooltip = null;

        /**
         * Index of the century currently shown by the picker.
         *
         * @type {number}
         * @private
         */
        this._activeCentury = 0;

        /**
         * Normalised payload kept so the picker can redraw a different century
         * without the consumer re-supplying the data.
         *
         * @type {{centuries: Array<string>, bands: Array<string>, data: Array<Array<{m: number, f: number}>>}|null}
         * @private
         */
        this._model = null;
    }

    /**
     * @param {{centuries: Array<string>, bands: Array<string>, data: Array<Array<{m: number, f: number}>>}|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const model = sanitize(data);
        this._model = model;

        if (model === null) {
            return this.renderEmptyState(this._emptyMessage());
        }

        // Default to the most recent century that carries any death; falls back
        // to the last column so an all-zero tree still renders a stable view.
        this._activeCentury = model.centuries.length - 1;
        for (let i = model.centuries.length - 1; i >= 0; i -= 1) {
            if (columnTotal(model.data[i]) > 0) {
                this._activeCentury = i;
                break;
            }
        }

        const root = select(this.target).append("div").attr("class", "wt-stat-pyramid");

        this._picker = root.append("div").attr("class", "wt-stat-pyramid-picker");
        this._picker
            .selectAll("button.wt-stat-pyramid-century")
            .data(model.centuries)
            .enter()
            .append("button")
            .attr("type", "button")
            .attr("class", "wt-stat-pyramid-century")
            .attr("aria-pressed", (_d, i) => (i === this._activeCentury ? "true" : "false"))
            .text((century) => this._centuryFormat(century))
            .on("click", (_event, century) => {
                this._activeCentury = model.centuries.indexOf(century);
                this._syncPicker();
                this._drawBars(true);
            });

        this._chart = root.append("div").attr("class", "wt-stat-pyramid-chart");
        this._drawBars(false);

        return root.node();
    }

    /**
     * Render (or redraw) the bars for the active century. When `animate` is true
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
        const column = model.data[this._activeCentury] ?? [];

        // Hide the shared tooltip before tearing down the SVG: a bar hovered
        // when the century is switched never receives its own mouseleave, so its
        // tooltip would otherwise stay visible over the freshly drawn bars.
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

        // Centre gutter (band labels) plus a small margin for the value
        // captions at the outer bar ends.
        const gutterHalf = 34;
        const margin = 40;
        const centre = W / 2;
        const maleRange = [centre - gutterHalf, margin];
        const femaleRange = [centre + gutterHalf, W - margin];

        const yTop = 24;
        const yBot = H - 18;
        const yBand = scaleBand().domain(bands).range([yTop, yBot]).paddingInner(0.32);

        const maxValue = d3Max(column, (cell) => Math.max(cell.m, cell.f)) || 1;
        const maleScale = scaleLinear().domain([0, maxValue]).range(maleRange);
        const femaleScale = scaleLinear().domain([0, maxValue]).range(femaleRange);

        const barH = Math.min(yBand.bandwidth(), 26);
        const inset = (yBand.bandwidth() - barH) / 2;

        // Side labels (M / F) above the respective columns.
        svg.append("text")
            .attr("class", "wt-stat-pyramid-sidelabel wt-stat-pyramid-sidelabel-m")
            .attr("x", (centre - gutterHalf + margin) / 2)
            .attr("y", 14)
            .attr("text-anchor", "middle")
            .text(this._maleLabel);
        svg.append("text")
            .attr("class", "wt-stat-pyramid-sidelabel wt-stat-pyramid-sidelabel-f")
            .attr("x", (centre + gutterHalf + (W - margin)) / 2)
            .attr("y", 14)
            .attr("text-anchor", "middle")
            .text(this._femaleLabel);

        const tooltip = this._tooltip;
        const tip = (band, sexLabel, value) =>
            `<strong>${escapeHtml(band)} · ${escapeHtml(sexLabel)}</strong><br>` +
            `<span class="wt-chart-tooltip__stat">${value.toLocaleString()}</span>`;

        const rows = bands.map((band, i) => ({
            band,
            m: column[i] ? column[i].m : 0,
            f: column[i] ? column[i].f : 0,
            y: (yBand(band) ?? 0) + inset,
        }));

        // Band labels in the centre gutter.
        svg.selectAll("text.wt-stat-pyramid-band")
            .data(rows)
            .enter()
            .append("text")
            .attr("class", "wt-stat-pyramid-band")
            .attr("x", centre)
            .attr("y", (r) => r.y + barH / 2)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .text((r) => r.band);

        // Apply the final bar geometry, optionally growing it from the centre
        // axis. `duration` differs between the slower first entrance and the
        // snappier picker switch.
        const applyFinal = (selection, finalAttrs, doAnimate, duration) => {
            if (doAnimate) {
                selection
                    .attr("x", centre)
                    .attr("width", 0)
                    .transition()
                    .duration(duration)
                    .attr("x", finalAttrs.x)
                    .attr("width", finalAttrs.width);

                return;
            }

            selection.attr("x", finalAttrs.x).attr("width", finalAttrs.width);
        };

        // Male bars (grow left).
        const maleBars = svg
            .selectAll("rect.wt-stat-pyramid-bar-m")
            .data(rows)
            .enter()
            .append("rect")
            .attr("class", "wt-stat-pyramid-bar-m")
            .attr("y", (r) => r.y)
            .attr("height", barH)
            .attr("rx", 3)
            .style("cursor", "pointer")
            .on("mouseover", (event, r) => tooltip.show(event, tip(r.band, this._maleLabel, r.m)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide())
            .on("click", (_event, r) =>
                this._emitSelection({ dimension: "ageBand", value: r.band, sex: "M" }),
            );
        const maleFinal = {
            x: (r) => maleScale(r.m),
            width: (r) => Math.max(0, centre - gutterHalf - maleScale(r.m)),
        };

        // Female bars (grow right).
        const femaleBars = svg
            .selectAll("rect.wt-stat-pyramid-bar-f")
            .data(rows)
            .enter()
            .append("rect")
            .attr("class", "wt-stat-pyramid-bar-f")
            .attr("y", (r) => r.y)
            .attr("height", barH)
            .attr("rx", 3)
            .style("cursor", "pointer")
            .on("mouseover", (event, r) => tooltip.show(event, tip(r.band, this._femaleLabel, r.f)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide())
            .on("click", (_event, r) =>
                this._emitSelection({ dimension: "ageBand", value: r.band, sex: "F" }),
            );
        const femaleFinal = {
            x: () => centre + gutterHalf,
            width: (r) => Math.max(0, femaleScale(r.f) - centre - gutterHalf),
        };

        // Animate BOTH columns through ONE closure. _runEntry holds a single
        // deferred entry, so the two columns must share it — two separate
        // _runEntry calls would let the second overwrite the first and leave one
        // column stuck at its initial keyframe when the reveal finally plays.
        const applyBoth = (doAnimate, duration) => {
            applyFinal(maleBars, maleFinal, doAnimate, duration);
            applyFinal(femaleBars, femaleFinal, doAnimate, duration);
        };

        // A picker switch re-draws while the card is already on screen, so it
        // animates inline immediately. Routing it through the reveal-gated
        // _runEntry would hold the new bars at width 0 until a playEntry that,
        // for a one-shot reveal, has already fired and will never fire again.
        if (pickerSwitch) {
            // Retire any still-held reveal entry: it captured the previous
            // century's now-removed <rect> nodes, so playing it later would
            // animate detached nodes. The switched-in bars are handled here.
            this._entry = null;
            applyBoth(!this._prefersReducedMotion(), 420);

            return;
        }

        this._runEntry((doAnimate) => applyBoth(doAnimate, 650));
    }

    /** @private */
    _syncPicker() {
        this._picker
            .selectAll("button.wt-stat-pyramid-century")
            .attr("aria-pressed", (_d, i) => (i === this._activeCentury ? "true" : "false"));
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
 * Validate + normalise the payload. Returns null when there is no usable data
 * (no centuries, no bands, or a malformed shape) so the caller can render the
 * empty state.
 *
 * @param {{centuries: Array<string>, bands: Array<string>, data: Array<Array<{m: number, f: number}>>}|null|undefined} data
 * @returns {{centuries: Array<string>, bands: Array<string>, data: Array<Array<{m: number, f: number}>>}|null}
 */
function sanitize(data) {
    if (data === null || typeof data !== "object") {
        return null;
    }

    const centuries = Array.isArray(data.centuries) ? data.centuries.map(String) : [];
    const bands = Array.isArray(data.bands) ? data.bands.map(String) : [];
    const rawData = Array.isArray(data.data) ? data.data : [];

    if (centuries.length === 0 || bands.length === 0) {
        return null;
    }

    const normalised = centuries.map((_century, ci) => {
        const column = Array.isArray(rawData[ci]) ? rawData[ci] : [];
        return bands.map((_band, bi) => {
            const cell = column[bi];
            const m = cell ? Number(cell.m) : 0;
            const f = cell ? Number(cell.f) : 0;
            return {
                m: Number.isFinite(m) && m > 0 ? m : 0,
                f: Number.isFinite(f) && f > 0 ? f : 0,
            };
        });
    });

    return { centuries, bands, data: normalised };
}

/**
 * Sum of male + female counts in a century column.
 *
 * @param {Array<{m: number, f: number}>|undefined} column
 * @returns {number}
 */
function columnTotal(column) {
    if (!Array.isArray(column)) {
        return 0;
    }
    return column.reduce((sum, cell) => sum + cell.m + cell.f, 0);
}
