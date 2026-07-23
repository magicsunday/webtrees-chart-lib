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

import { createChartTooltip, tooltipHeader, tooltipLines, tooltipStat } from "../tooltip.js";
import { pickFraction } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    // 600 leaves comfortable room for both the arc circle AND its
    // outer labels — anything below ~440 squashed 90°-rotated
    // labels at top/bottom against the SVG edge; 600 gives the
    // arc band itself enough diameter to read at a glance on a
    // full-width statistics card.
    height: 600,
    padAngle: 0.04,
};

/**
 * Whitelist for the `classes[i]` payload field — accepts one or more standard
 * CSS-identifier tokens separated by whitespace. Anything else (e.g. `"x
 * onclick=alert(1)"`) is dropped at normalisation time so the hostile token
 * cannot ride into the arc's `class` attribute.
 */
const CLASS_TOKEN_LIST = /^[A-Za-z_][A-Za-z0-9_-]*(\s+[A-Za-z_][A-Za-z0-9_-]*)*$/;

/**
 * Chord diagram (circular arcs + ribbons) for symmetric N×N matrix payloads.
 * Each arc represents one category; the ribbon between two arcs encodes the
 * connection strength between them. Used for any payload where the interesting
 * view is "who connects to whom" rather than "how much per category" (e.g.
 * pairwise flow between categories).
 *
 * The widget assumes a symmetric matrix (the flow A↔B equals B↔A); it does not
 * enforce it, but unbalanced input renders ribbon thickness based on row sums
 * per d3-chord's contract. Hovering a ribbon dims everything else so the visual
 * chain becomes traceable in a dense diagram. The widget emits no selection
 * event.
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget ships no
 * opinionated palette): `.msc-chord-diagram` (root svg) wraps one inner
 * `g.msc-chord-diagram-inner` holding two layers. The arc layer is a
 * `g.msc-chord-diagram-arcs`; each category is a `g.msc-chord-diagram-arc`
 * (plus any caller-supplied `class`) holding `path.msc-chord-diagram-arc-path`
 * and `text.msc-chord-diagram-arc-label`. The ribbon layer is a
 * `g.msc-chord-diagram-ribbons` of `path.msc-chord-diagram-ribbon` elements,
 * one per connection.
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
     *     ariaLabel?: string,
     *     i18n?: {
     *         tooltipValueSingular?: string,
     *         tooltipValuePlural?: string
     *     }
     * }} [options]
     */
    constructor(target, options) {
        super(target, options, { ariaLabel: "Chord diagram" });
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.padAngle = this.options.padAngle;
        this.i18n = this.options.i18n;
    }

    /**
     * The padding angle (in radians) between adjacent arcs. A non-finite value
     * falls back to the default; the value is clamped into `[0, 0.5]` because
     * beyond ~0.5 rad the gaps eat into the arc thickness and the diagram
     * becomes unreadable.
     *
     * @returns {number}
     */
    get padAngle() {
        return this._padAngle;
    }

    /**
     * @param {number|undefined} value The padding angle in radians; a missing or
     *   non-finite value resets to the default and the value is clamped into
     *   `[0, 0.5]`. The runtime guard keeps the JSON dispatcher (which assigns
     *   untyped values) safe.
     */
    set padAngle(value) {
        // d3-chord's recommended padAngle ceiling is around 0.5 rad —
        // beyond that the gaps eat into the arc thickness and the
        // diagram becomes unreadable.
        this._padAngle = pickFraction(value, DEFAULT_OPTIONS.padAngle, 0.5);
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
        this._clearRoot("svg.msc-chord-diagram");

        const validated = this._validate(data);
        if (validated === null) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const { labels, matrix, classes } = validated;
        const height = this._resolveHeight(DEFAULT_OPTIONS.height);
        const width = this._resolveWidth(height, 240);
        const size = Math.min(width, height);
        // Outer padding holds the arc-tip labels. Each label sits at
        // `outerRadius + 6` and extends outwards by roughly its
        // pixel-length (10–14 chars × 7px / char ≈ 100px). A flat 24px
        // padding clipped longer category labels at the SVG bounds;
        // 88px keeps eight-character labels fully visible on the
        // default 600×600 viewBox (the width falls back to the resolved
        // height) without forcing every consumer to grow the container.
        const labelPadding = 88;
        const outerRadius = size / 2 - labelPadding;
        const innerRadius = outerRadius - 12;

        const chordLayout = d3Chord()
            .padAngle(this._padAngle)
            .sortSubgroups((a, b) => b - a);
        const chords = chordLayout(matrix);

        const colour = scaleOrdinal().domain(labels).range(schemeTableau10);
        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "msc-chord-diagram")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel);

        const root = svg
            .append("g")
            .attr("class", "msc-chord-diagram-inner")
            .attr("transform", `translate(${width / 2}, ${height / 2})`);

        const arcGenerator =
            /** @type {import("d3-shape").Arc<unknown, import("d3-chord").ChordGroup>} */ (
                /** @type {unknown} */ (d3Arc().innerRadius(innerRadius).outerRadius(outerRadius))
            );
        // Cast to a plain path-string function: d3-chord types the ribbon
        // generator's call signature as `void` (it assumes a canvas context),
        // but without a context it returns the SVG path string we need.
        const ribbonGenerator = /** @type {(chord: import("d3-chord").Chord) => string} */ (
            /** @type {unknown} */ (ribbon().radius(innerRadius))
        );

        // Arc groups — one per category.
        const groups = root
            .append("g")
            .attr("class", "msc-chord-diagram-arcs")
            .selectAll("g.msc-chord-diagram-arc")
            .data(chords.groups)
            .enter()
            .append("g")
            .attr("class", (d) => {
                const cls = classes[d.index] ?? "";
                return cls === "" ? "msc-chord-diagram-arc" : `msc-chord-diagram-arc ${cls}`;
            })
            .attr("data-label", (d) => labels[d.index] ?? "");

        groups
            .append("path")
            .attr("class", "msc-chord-diagram-arc-path")
            .attr("d", (group) => arcGenerator(group))
            // .style() so the computed scale colour wins against any
            // .msc-chord-diagram-arc-path CSS rule downstream; consumers that supply a
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
            .attr("class", "msc-chord-diagram-arc-label")
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
            .attr("class", "msc-chord-diagram-ribbons")
            .selectAll("path.msc-chord-diagram-ribbon")
            .data(chords)
            .enter()
            .append("path")
            .attr("class", "msc-chord-diagram-ribbon")
            .attr("d", (chord) => ribbonGenerator(chord))
            .style("fill", (d) =>
                classes[d.source.index] === ""
                    ? (colour(labels[d.source.index] ?? "") ?? "")
                    : null,
            )
            // .style("opacity") so the hover-dim presentation value
            // beats any default `.msc-chord-diagram-ribbon { opacity }` rule a consumer
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

        const i18n = this._i18n;
        const ribbonValueLabel = (value) => {
            const template =
                value === 1
                    ? (i18n.tooltipValueSingular ?? "{count}")
                    : (i18n.tooltipValuePlural ?? "{count}");
            return template.replace("{count}", value.toLocaleString());
        };
        ribbons
            .on("mouseover", (event, d) => {
                const source = String(labels[d.source.index] ?? "");
                const target = String(labels[d.target.index] ?? "");
                const value = Number(d.source.value ?? 0);
                tooltip.show(
                    event,
                    tooltipLines(
                        tooltipHeader(`${source} ↔ ${target}`),
                        tooltipStat(ribbonValueLabel(value)),
                    ),
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
     * Validate the input payload into `{labels, matrix, classes}` where matrix
     * is square and every row has the same number of columns as labels. Returns
     * null to signal the empty state path.
     *
     * @param {unknown} data
     *
     * @returns {{labels: string[], matrix: number[][], classes: string[]}|null}
     */
    _validate(data) {
        if (data === null || data === undefined || typeof data !== "object") {
            return null;
        }
        const payload = /** @type {{labels?: unknown, matrix?: unknown, classes?: unknown}} */ (
            data
        );
        const labels = Array.isArray(payload.labels)
            ? payload.labels.filter((label) => typeof label === "string" && label !== "")
            : [];
        const rawMatrix = Array.isArray(payload.matrix) ? payload.matrix : [];
        const rawClasses = Array.isArray(payload.classes) ? payload.classes : [];

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
}
