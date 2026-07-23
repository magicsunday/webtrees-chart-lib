/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { easeBackOut } from "d3-ease";
import { select } from "d3-selection";
import "d3-transition";

import { pickPositive, sanitizeLabelValueRows } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

/**
 * Circle-pack bubble chart. Each row is rendered as a circle whose radius
 * encodes its value (sqrt-scaled so one dominant entry doesn't dwarf the rest),
 * its fill mixing the `accent` token with the host `var(--card)` surface
 * intensity-scaled. Bubbles are placed by an overlap-free outward spiral — the
 * largest sits at the centre and the viewBox grows to fit the final pack — and
 * pop in with a staggered entry animation.
 *
 * Empty / null / undefined data renders the shared empty-state placeholder;
 * redraw replaces both a prior svg and a prior placeholder, so the widget is
 * idempotent in either direction.
 *
 * Styling hooks (the consumer's stylesheet owns the text font family/weight —
 * the widget sets only the radius-fitted font sizes and the intensity-mixed
 * fills inline): the root is `svg.msc-name-bubbles` holding one
 * `g.msc-name-bubbles-bubble` per bubble, each with a native `<title>`, a `circle`,
 * and a `g.msc-name-bubbles-label` wrapping a `text.msc-name-bubbles-label-text`
 * and — on bubbles large enough — a `text.msc-name-bubbles-value-text`.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class NameBubbles extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     width?: number,
     *     height?: number,
     *     spiralAspectX?: number,
     *     spiralAspectY?: number,
     *     rMin?: number,
     *     rMax?: number,
     *     accent?: string,
     *     padding?: number,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options, { emptyMessage: "" });

        // Each config field is applied through its native setter so validation
        // lives in one place. Order matters: rMin before rMax (the rMax setter
        // clamps against the current rMin).
        this.spiralAspectX = this.options.spiralAspectX;
        this.spiralAspectY = this.options.spiralAspectY;
        this.rMin = this.options.rMin;
        this.rMax = this.options.rMax;
        this.accent = this.options.accent;
        this.padding = this.options.padding;
    }

    /**
     * The horizontal bias of the outward spiral. Values above 1 stretch the
     * spiral wider than tall, so bubbles fan out left and right first.
     *
     * @returns {number}
     */
    get spiralAspectX() {
        return this._spiralAspectX;
    }

    /**
     * @param {number|undefined} value A missing or non-positive value falls back to 1.75.
     */
    set spiralAspectX(value) {
        this._spiralAspectX = pickPositive(value, 1.75);
    }

    /**
     * The vertical bias of the outward spiral.
     *
     * @returns {number}
     */
    get spiralAspectY() {
        return this._spiralAspectY;
    }

    /**
     * @param {number|undefined} value A missing or non-positive value falls back to 1.
     */
    set spiralAspectY(value) {
        this._spiralAspectY = pickPositive(value, 1);
    }

    /**
     * The smallest bubble radius, in pixels. Bubble radii are sqrt-scaled by
     * count fraction between `rMin` and `rMax`.
     *
     * @returns {number}
     */
    get rMin() {
        return this._rMin;
    }

    /**
     * @param {number|undefined} value A missing or non-positive value falls back to 50.
     */
    set rMin(value) {
        this._rMin = pickPositive(value, 50);
    }

    /**
     * The largest bubble radius, in pixels.
     *
     * @returns {number}
     */
    get rMax() {
        return this._rMax;
    }

    /**
     * @param {number|undefined} value A value not greater than the current `rMin`
     *   (or a non-finite value) falls back to 110.
     */
    set rMax(value) {
        this._rMax = Number.isFinite(value) && value > this._rMin ? value : 110;
    }

    /**
     * The minimum gap between packed bubbles, in pixels.
     *
     * @returns {number}
     */
    get padding() {
        return this._padding;
    }

    /**
     * @param {number|undefined} value A missing or negative value falls back to 8.
     */
    set padding(value) {
        this._padding = Number.isFinite(value) && value >= 0 ? value : 8;
    }

    /**
     * @param {Array<{label: string, value: number}>|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearRoot("svg.msc-name-bubbles");

        const safe = sanitizeLabelValueRows(data, { dropZero: true });

        if (safe.length === 0) {
            return this.renderEmptyState(this.emptyMessage);
        }

        const sorted = [...safe].sort((a, b) => b.value - a.value);
        const max = sorted[0].value;
        const radiusFor = (value) =>
            this._rMin + Math.sqrt(value / max) * (this._rMax - this._rMin);

        // The reference box defaults to 720×360 (2:1) and the SVG scales
        // responsively via `preserveAspectRatio="xMidYMid meet"`, keeping the
        // bubble pack visually consistent across narrow and wide cards alike —
        // so the box is NOT resolved against the host's pixel size. The default
        // is resolved here (not eagerly in the constructor) so the inherited
        // `width` / `height` accessors report `undefined` when unset, like every
        // other widget.
        const W = this._width ?? 720;
        const H = this._height ?? 360;
        const cx = W / 2;
        const cy = H / 2;
        const padding = this._padding;

        // Spiral-out placement, overlap-free. The biggest bubble sits
        // at the centre; every subsequent bubble walks an outward
        // spiral until it finds a slot that doesn't touch any prior
        // placement. The spiral has no upper bound — if the chosen
        // r-range plus the entry count exceed the initial 720×360
        // box, the spiral simply keeps growing outward, and the
        // final viewBox absorbs the new bounding box (see below).
        // This guarantees that bubbles never overlap, even when the
        // configured r-range produces a total area that the
        // reference box can't hold.
        const leaves = [];

        sorted.forEach((row, idx) => {
            const r = radiusFor(row.value);

            if (idx === 0) {
                leaves.push({ data: row, r, x: cx, y: cy });
                return;
            }

            let placedX = null;
            let placedY = null;

            // Each pack rotates by a random offset AND draws a
            // slightly randomised aspect ratio per call so
            // consecutive reloads don't produce the identical
            // layout. The aspect bias stays inside `[1.2 … 1.6]` so
            // the pack stays landscape-leaning (matching the card
            // proportions) but the next-largest bubbles aren't
            // forced into the same left/right slots every time —
            // sometimes they land top-right, sometimes bottom-left.
            const startAngle = Math.random() * 360;
            const aspectJitterX = this._spiralAspectX * (0.85 + Math.random() * 0.3);
            const aspectJitterY = this._spiralAspectY * (0.85 + Math.random() * 0.3);

            for (let radius = r + padding; placedX === null; radius += 3) {
                const angleStep = Math.max(1.5, 360 / (radius * 0.5));
                for (let theta = 0; theta < 360; theta += angleStep) {
                    const rad = ((theta + startAngle) * Math.PI) / 180;
                    // Elliptical spiral with a small per-call jitter:
                    // x stretches by `aspectJitterX`, y by
                    // `aspectJitterY`. The horizontal default
                    // (`spiralAspectX=1.75`) keeps the pack landscape,
                    // the ±15 % jitter spreads adjacent renders so
                    // the same data doesn't always pack into the
                    // same shape.
                    const x = cx + Math.cos(rad) * radius * aspectJitterX;
                    const y = cy + Math.sin(rad) * radius * aspectJitterY;

                    let overlap = false;
                    for (const placed of leaves) {
                        const dx = placed.x - x;
                        const dy = placed.y - y;
                        if (Math.hypot(dx, dy) < placed.r + r + padding) {
                            overlap = true;
                            break;
                        }
                    }

                    if (!overlap) {
                        placedX = x;
                        placedY = y;
                        break;
                    }
                }
            }

            leaves.push({ data: row, r, x: placedX, y: placedY });
        });

        // Compute the actual bounding box of every placed bubble so
        // the viewBox tracks the outward spiral instead of clipping
        // overflowing bubbles at the initial 720×360 edge. The
        // horizontal margin is wider than the vertical one — the
        // pack is naturally landscape (`spiralAspect = 2:1`) and
        // benefits from a generous gutter on either side so the
        // outer bubbles don't kiss the card edge.
        const vbPadX = 60;
        const vbPadY = 16;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const leaf of leaves) {
            if (leaf.x - leaf.r < minX) minX = leaf.x - leaf.r;
            if (leaf.y - leaf.r < minY) minY = leaf.y - leaf.r;
            if (leaf.x + leaf.r > maxX) maxX = leaf.x + leaf.r;
            if (leaf.y + leaf.r > maxY) maxY = leaf.y + leaf.r;
        }

        const vbX = minX - vbPadX;
        const vbY = minY - vbPadY;
        const vbW = maxX - minX + vbPadX * 2;
        const vbH = maxY - minY + vbPadY * 2;

        const svg = select(this.target)
            .append("svg")
            .attr("class", "msc-name-bubbles")
            .attr("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img");

        const nodeSel = svg
            .selectAll("g.msc-name-bubbles-bubble")
            .data(leaves)
            .enter()
            .append("g")
            .attr("class", "msc-name-bubbles-bubble")
            .attr("transform", (d) => `translate(${d.x},${d.y})`);

        nodeSel.append("title").text((d) => `${d.data.label}: ${d.data.value}`);

        nodeSel
            .append("circle")
            .attr("r", (d) => d.r)
            // `.style()` not `.attr()` — the colour-mix value carries
            // the per-bubble intensity tint and must beat any
            // stylesheet rule a consumer drops on `.msc-name-bubbles
            // circle`.
            .style("fill", (d) => {
                const intensity = d.data.value / (max || 1);
                const pct = Math.round(28 + intensity * 64);
                return `color-mix(in srgb, ${this._accent} ${pct}%, var(--card))`;
            });

        // Name + count as one vertically-centred block around the
        // bubble centre. Both <text> nodes live inside a per-bubble
        // <g class="msc-name-bubbles-label">; the texts are laid out
        // at symmetric y offsets first, then the whole group is
        // re-translated so its rendered bounding-box centre lands
        // exactly on the bubble centre. Using the post-render bbox
        // sidesteps the em-box vs visible-glyph centroid mismatch
        // that every heuristic offset (`dy`, lift ratios, …) gets
        // wrong for at least one font / glyph set.
        //
        // `font-family` / `font-size` / `font-weight` go through
        // `.style()`, not `.attr()`. CSS custom properties like
        // `var(--serif)` only resolve when the value is parsed as a
        // CSS property — as an SVG presentation attribute the
        // literal string `var(--serif)` survives unparsed and the
        // browser falls back to the user-agent default font.
        const blockGap = 8;

        const labelG = nodeSel.append("g").attr("class", "msc-name-bubbles-label");

        labelG
            .append("text")
            .attr("text-anchor", "middle")
            // Font-family / weight / fill live in the host stylesheet
            // (`.msc-name-bubbles-label-text` / `-value-text`). Only the
            // font-size remains inline — it's a function of the
            // bubble radius and would be lossy to recompute in CSS.
            .attr("class", "msc-name-bubbles-label-text")
            .attr("dominant-baseline", "central")
            .attr("y", (d) => {
                if (d.r <= 22) {
                    // Tiny bubbles — single row, sit on the centre.
                    return 0;
                }
                const countFs = fitCountFontSize(d.r, d.data.value);
                return -(blockGap + countFs) / 2;
            })
            .style("font-size", (d) => `${fitNameFontSize(d.r, d.data.label)}px`)
            .style("fill", (d) => bubbleTextFill(d.data.value, max))
            .text((d) => d.data.label);

        labelG
            .filter((d) => d.r > 22)
            .append("text")
            .attr("class", "msc-name-bubbles-value-text")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .attr("y", (d) => {
                const nameFs = fitNameFontSize(d.r, d.data.label);
                return (blockGap + nameFs) / 2;
            })
            .style("font-size", (d) => `${fitCountFontSize(d.r, d.data.value)}px`)
            .style("fill", (d) => bubbleCountFill(d.data.value, max))
            .text((d) => d.data.value);

        // Recentre each label group so its rendered bbox midpoint
        // coincides with the bubble centre. `getBBox()` returns the
        // post-layout extent of every visible glyph, which already
        // accounts for ascender height, descender depth, and any
        // font-specific overshoot — anchoring to that box gives
        // pixel-perfect centring without per-font fudge factors.
        // jsdom returns zero-width bboxes, so the guard keeps unit
        // tests stable while the real browser sees the recentre.
        labelG.each(function () {
            const box = this.getBBox();

            if (box.width === 0 && box.height === 0) {
                return;
            }

            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            this.setAttribute("transform", `translate(${-cx},${-cy})`);
        });

        // Entry "pop": bubbles scale up from zero with an easeBackOut overshoot,
        // in randomised order across a short window, so the pack assembles
        // itself bubble-by-bubble. Only the transform scale animates. The initial
        // keyframe (scale 0) is applied here; _runEntry then animates inline,
        // holds for reveal-on-scroll, or (reduced motion) jumps to scale 1.
        nodeSel.attr("transform", (d) => `translate(${d.x},${d.y}) scale(0)`);
        this._runEntry((animate) => {
            this._enter(
                nodeSel.interrupt("bubble-pop"),
                animate,
                "bubble-pop",
                420,
                () => Math.random() * 600,
                easeBackOut,
            ).attr("transform", (d) => `translate(${d.x},${d.y}) scale(1)`);
        });

        return svg.node();
    }
}

/**
 * Bubble label font size clamped to the bubble radius. Smallest 9 px, largest
 * 22 px so even the giant centre bubble doesn't grow unbound.
 *
 * @param {number} r
 * @returns {number}
 */
function clampFontSize(r) {
    // Radius-based ceiling. The actual emitted size is further
    // clamped against the bubble's interior chord (`fitNameFontSize`
    // / `fitCountFontSize`) so long labels never overflow the
    // circle's edge.
    return Math.max(11, Math.min(r / 2.5, 36));
}

/**
 * Count caption font size — radius-based ceiling. Always paired with the
 * chord-based fit below so the count digit never spills out of the bubble.
 *
 * @param {number} r
 * @returns {number}
 */
function clampCountFontSize(r) {
    return Math.max(11, Math.min(r / 3, 28));
}

/**
 * Approximate average serif glyph width as a fraction of em. Used by the
 * chord-fit clamp so we don't have to ship a measurement canvas just to pick a
 * label size.
 */
const SERIF_GLYPH_RATIO = 0.55;

/**
 * Mono glyph ratio is wider — tabular-figure mono fonts ship a uniform `0.6 em`
 * per digit.
 */
const MONO_GLYPH_RATIO = 0.6;

/**
 * Pick the largest serif font size that still fits the bubble's inner chord at
 * the label baseline (roughly the bubble diameter minus a 10 % margin). Returns
 * the radius-ceiling clamp when the label is short enough that the radius is
 * the binding constraint.
 *
 * @param {number} r
 * @param {string} label
 * @returns {number}
 */
function fitNameFontSize(r, label) {
    const chord = r * 2 * 0.85;
    const ceiling = clampFontSize(r);
    if (typeof label !== "string" || label.length === 0) {
        return ceiling;
    }
    const widthCap = chord / (label.length * SERIF_GLYPH_RATIO);
    return Math.max(11, Math.min(ceiling, widthCap));
}

/**
 * Same idea for the mono count caption — the chord cap is slightly tighter
 * (`0.8`) so the count never butts up against the bubble edge.
 *
 * @param {number} r
 * @param {number} value
 * @returns {number}
 */
function fitCountFontSize(r, value) {
    const chord = r * 2 * 0.8;
    const ceiling = clampCountFontSize(r);
    const digits = String(value).length || 1;
    const widthCap = chord / (digits * MONO_GLYPH_RATIO);
    return Math.max(11, Math.min(ceiling, widthCap));
}

/**
 * Label colour chosen by intensity — dark text on light bubbles, light text on
 * saturated bubbles.
 *
 * @param {number} value
 * @param {number} max
 * @returns {string}
 */
function bubbleTextFill(value, max) {
    return value / (max || 1) > 0.45 ? "var(--card)" : "var(--ink)";
}

/**
 * Count caption colour matched to the bubble's intensity (one step paler than
 * the name label for visual hierarchy).
 *
 * @param {number} value
 * @param {number} max
 * @returns {string}
 */
function bubbleCountFill(value, max) {
    return value / (max || 1) > 0.45 ? "var(--card-warm)" : "var(--ink-3)";
}
