/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { chord as d3Chord, ribbon } from "d3-chord";
import { scaleOrdinal } from "d3-scale";
import { schemeTableau10 } from "d3-scale-chromatic";
import { select } from "d3-selection";
import { arc as d3Arc } from "d3-shape";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 360,
    padAngle: 0.04,
};

/**
 * Whitelist for the `classes[i]` payload field — accepts one or
 * more standard CSS-identifier tokens separated by whitespace.
 * Anything else (e.g. `"x onclick=alert(1)"`) is dropped at
 * normalisation time so the hostile token cannot ride into the
 * arc's `class` attribute.
 */
const CLASS_TOKEN_LIST = /^[A-Za-z_][A-Za-z0-9_-]*(\s+[A-Za-z_][A-Za-z0-9_-]*)*$/;

/**
 * Chord diagram (circular arcs + ribbons) for symmetric N×N
 * matrix payloads. Each arc represents one category; the
 * ribbon between two arcs encodes the connection strength
 * between them. Used for surname-pair distributions, family-
 * by-family kinship density, and any payload where the
 * interesting view is "who connects to whom" rather than
 * "how much per category".
 *
 * The widget assumes a symmetric matrix (marriage A↔B same as
 * B↔A); it does not enforce it, but unbalanced input renders
 * ribbon thickness based on row sums per d3-chord's contract.
 * Hovering a ribbon dims everything else so the visual chain
 * becomes traceable in a dense diagram.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class ChordDiagram extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     padAngle?: number,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._height = pickPositive(this.options.height, DEFAULT_OPTIONS.height);
        this._padAngle = pickFraction(this.options.padAngle, DEFAULT_OPTIONS.padAngle);
    }

    /**
     * @param {{
     *     labels: string[],
     *     matrix: number[][],
     *     classes?: string[]
     * }|null|undefined} data
     *   `labels[i]` names the i-th arc. `matrix[i][j]` is the
     *   connection strength from i to j; the widget treats it
     *   as symmetric. Optional per-arc `classes[i]` overrides
     *   the schemeTableau10 fallback fill via a CSS class hook.
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const validated = this._validate(data);
        if (validated === null) {
            return this.renderEmptyState(this._emptyMessage());
        }

        const { labels, matrix, classes } = validated;
        const height = this._height;
        const width = Math.max(
            240,
            pickPositive(this.options.width, this.target.clientWidth) || height,
        );
        const size = Math.min(width, height);
        const outerRadius = size / 2 - 24;
        const innerRadius = outerRadius - 12;

        const chordLayout = d3Chord()
            .padAngle(this._padAngle)
            .sortSubgroups((a, b) => b - a);
        const chords = chordLayout(matrix);

        const colour = scaleOrdinal().domain(labels).range(schemeTableau10);
        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-chord-diagram")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Chord diagram");

        const root = svg
            .append("g")
            .attr("class", "chord-root")
            .attr("transform", `translate(${width / 2}, ${height / 2})`);

        const arcGenerator = d3Arc().innerRadius(innerRadius).outerRadius(outerRadius);
        const ribbonGenerator = ribbon().radius(innerRadius);

        // Arc groups — one per category.
        const groups = root
            .append("g")
            .attr("class", "arcs")
            .selectAll("g.arc")
            .data(chords.groups)
            .enter()
            .append("g")
            .attr("class", (d) => {
                const cls = classes[d.index] ?? "";
                return cls === "" ? "arc" : `arc ${cls}`;
            })
            .attr("data-label", (d) => labels[d.index] ?? "");

        groups
            .append("path")
            .attr("class", "arc-path")
            .attr("d", arcGenerator)
            // .style() so the computed scale colour wins against any
            // .arc-path CSS rule downstream; consumers that supply a
            // class via `classes[i]` get null here so the stylesheet
            // wins instead.
            .style("fill", (d) =>
                classes[d.index] === "" ? (colour(labels[d.index] ?? "") ?? "") : null,
            )
            .attr("tabindex", "0")
            .attr("aria-label", (d) => {
                const label = labels[d.index] ?? "";
                const total = d.value ?? 0;
                return `${label}: ${total.toLocaleString()}`;
            });

        // Arc labels. dominant-baseline keeps the text centred on
        // the radial anchor across redraws (dy="0.35em" compounds
        // with any host stylesheet line-height override).
        groups
            .append("text")
            .attr("class", "arc-label")
            .attr("dominant-baseline", "middle")
            .attr("text-anchor", (d) =>
                (d.startAngle + d.endAngle) / 2 > Math.PI ? "end" : "start",
            )
            .attr("transform", (d) => {
                const angle = (d.startAngle + d.endAngle) / 2;
                const rotate = (angle * 180) / Math.PI - 90;
                const flip = angle > Math.PI ? "rotate(180)" : "";
                return `rotate(${rotate}) translate(${outerRadius + 6}, 0) ${flip}`;
            })
            .text((d) => labels[d.index] ?? "");

        // Ribbons.
        const ribbons = root
            .append("g")
            .attr("class", "ribbons")
            .selectAll("path.ribbon")
            .data(chords)
            .enter()
            .append("path")
            .attr("class", "ribbon")
            .attr("d", ribbonGenerator)
            .style("fill", (d) =>
                classes[d.source.index] === ""
                    ? (colour(labels[d.source.index] ?? "") ?? "")
                    : null,
            )
            // .style("opacity") so the hover-dim presentation value
            // beats any default `.ribbon { opacity }` rule a consumer
            // stylesheet might ship.
            .style("opacity", 0.6)
            .attr("data-source", (d) => labels[d.source.index] ?? "")
            .attr("data-target", (d) => labels[d.target.index] ?? "")
            .attr("tabindex", "0")
            .attr("aria-label", (d) => {
                const source = labels[d.source.index] ?? "";
                const target = labels[d.target.index] ?? "";
                const value = d.source.value ?? 0;
                return `${source} ↔ ${target}: ${value.toLocaleString()}`;
            });

        ribbons
            .on("mouseover", (event, d) => {
                const source = String(labels[d.source.index] ?? "");
                const target = String(labels[d.target.index] ?? "");
                const value = Number(d.source.value ?? 0);
                tooltip.show(
                    event,
                    `<strong>${escapeHtml(source)} ↔ ${escapeHtml(target)}</strong><br>` +
                        `<span class="wt-chart-tooltip__stat">${escapeHtml(value.toLocaleString())}</span>`,
                );
                ribbons.style("opacity", 0.1);
                select(event.currentTarget).style("opacity", 0.9);
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => {
                tooltip.hide();
                ribbons.style("opacity", 0.6);
            });

        return svg.node();
    }

    /**
     * Validate the input payload into `{labels, matrix, classes}`
     * where matrix is square and every row has the same number
     * of columns as labels. Returns null to signal the empty
     * state path.
     *
     * @param {unknown} data
     *
     * @returns {{labels: string[], matrix: number[][], classes: string[]}|null}
     */
    _validate(data) {
        if (data === null || data === undefined || typeof data !== "object") {
            return null;
        }
        const labels = Array.isArray(data.labels)
            ? data.labels.filter((label) => typeof label === "string" && label !== "")
            : [];
        const rawMatrix = Array.isArray(data.matrix) ? data.matrix : [];
        const rawClasses = Array.isArray(data.classes) ? data.classes : [];

        if (labels.length < 2 || rawMatrix.length !== labels.length) {
            return null;
        }

        const matrix = rawMatrix.map((row) => {
            if (!Array.isArray(row)) {
                return labels.map(() => 0);
            }
            return labels.map((_, index) => {
                const value = Number(row[index] ?? 0);
                return Number.isFinite(value) && value >= 0 ? value : 0;
            });
        });

        const anyConnection = matrix.some((row, i) => row.some((value, j) => i !== j && value > 0));
        if (!anyConnection) {
            return null;
        }

        // Class tokens are whitespace-separated CSS identifiers; the
        // allowlist regex rejects anything that does not look like a
        // standard CSS class token list so a hostile payload cannot
        // smuggle additional attributes via the class hook.
        const classes = labels.map((_, index) => {
            const raw = rawClasses[index];
            if (typeof raw !== "string" || raw === "") {
                return "";
            }
            return CLASS_TOKEN_LIST.test(raw) ? raw : "";
        });

        return { labels, matrix, classes };
    }

    /**
     * Remove any svg + placeholder this widget rendered earlier so
     * redraw() never stacks.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-chord-diagram, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }

    /**
     * @returns {string}
     */
    _emptyMessage() {
        return typeof this.options.emptyMessage === "string"
            ? this.options.emptyMessage
            : "No data available";
    }
}

/**
 * @param {unknown} value
 * @param {number}  fallback
 *
 * @returns {number}
 */
function pickPositive(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * @param {unknown} value
 * @param {number}  defaultValue
 *
 * @returns {number}
 */
function pickFraction(value, defaultValue) {
    // d3-chord's recommended padAngle ceiling is around 0.5 rad —
    // beyond that the gaps eat into the arc thickness and the
    // diagram becomes unreadable.
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return defaultValue;
    }
    if (value < 0) {
        return 0;
    }
    if (value > 0.5) {
        return 0.5;
    }
    return value;
}
