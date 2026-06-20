/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import BaseWidget from "./base-widget.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// How far (px) the scroll position must be from an edge before that edge is
// considered scrolled away from — a small dead-band so a sub-pixel rounding
// error does not flip the fade flag.
const EDGE_THRESHOLD_PX = 4;

/**
 * Plain-HTML horizontal sequence strip — a row of "bead" items joined by a small
 * connector glyph, scrollable sideways when the strip overflows. It is a DOM/CSS
 * widget, not an SVG plot (the only SVG is the inline ring glyph in each
 * connector), so long labels respect native wrapping and the consumer's
 * stylesheet owns all colour and shape.
 *
 * Data contract — `draw({items})` takes `{items: Array<{id?, label?, sublabel?,
 * group?, href?}>}`:
 *   - `label`    captions the bead and seeds its disc initials (first letter of
 *                up to the first two whitespace-separated words).
 *   - `sublabel` is a secondary caption line under the label.
 *   - `group`    is an opaque category written verbatim to a `data-group`
 *                attribute on the bead — the widget assigns NO colour or shape;
 *                the consumer styles `[data-group="…"]`. A missing/empty group
 *                leaves the attribute off.
 *   - `href`     turns the bead into a link; a missing href leaves the `<a>`
 *                without an `href` attribute (still a focusable container).
 *   - `id`       is opaque to the widget (caller bookkeeping); it is not read.
 *
 * Between every two consecutive beads the widget inserts a connector element
 * holding a small inline ring glyph. N beads therefore produce N-1 connectors.
 *
 * Scroll edge-fade — the scroll container carries `data-start` / `data-end`
 * attributes (set from `scrollLeft` / `clientWidth` / `scrollWidth` on a scroll
 * listener) so the consumer's stylesheet can fade the overflowing edge. The flag
 * is present only when that edge has content scrolled past it; at rest (and in
 * jsdom, where every scroll metric is 0) neither flag is set.
 *
 * Empty / null / `{items: []}` input renders the shared empty-state placeholder
 * and no beads. A redraw fully replaces the previous strip (never stacks).
 *
 * Strings are written via `textContent`, so HTML in a label or sublabel renders
 * as text, never parsed. The widget emits no selection event.
 *
 * Options — `emptyMessage` (placeholder text) with a native get/set accessor.
 *
 * Styling hooks (the consumer's stylesheet owns colour, shape and the edge-fade
 * gradient — the widget ships no opinionated palette): the root is a
 * `div.msc-sequence-chain`; it wraps a `div.msc-sequence-chain-scroll` scroll
 * container carrying the `data-start`/`data-end` flags, which wraps a
 * `div.msc-sequence-chain-track`. Each item is an `a.msc-sequence-chain-bead`
 * (with optional `href` + `data-group`) holding a `span.msc-sequence-chain-disc`
 * (initials), a `span.msc-sequence-chain-label` and a
 * `span.msc-sequence-chain-sublabel`. Each connector is a
 * `span.msc-sequence-chain-link` wrapping an `svg.msc-sequence-chain-ring`.
 * Empty data renders the shared `.chart-empty-state` placeholder instead.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class SequenceChain extends BaseWidget {
    /**
     * @param {{items?: Array<{id?: string, label?: string, sublabel?: string, group?: string, href?: string}>}|null|undefined} data
     * @returns {HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const items = sanitizeItems(data);
        if (items.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const root = document.createElement("div");
        root.className = "msc-sequence-chain";

        const scroll = document.createElement("div");
        scroll.className = "msc-sequence-chain-scroll";

        const track = document.createElement("div");
        track.className = "msc-sequence-chain-track";

        items.forEach((item, index) => {
            track.appendChild(buildBead(item));
            if (index < items.length - 1) {
                track.appendChild(buildLink());
            }
        });

        scroll.appendChild(track);
        root.appendChild(scroll);

        // The edge-fade flags depend on live scroll metrics, so wire the listener
        // and prime the flags from the resting position. In jsdom every metric is
        // 0, so both flags stay cleared — the structure is what the tests assert.
        scroll.addEventListener("scroll", () => updateEdgeFlags(scroll));
        updateEdgeFlags(scroll);

        this.target.appendChild(root);
        return root;
    }

    /**
     * Remove any chain this widget rendered earlier plus any empty-state
     * placeholder so redraw is idempotent in both directions.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > div.msc-sequence-chain, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }
}

/**
 * Drop null/non-object entries and coerce each item's string fields. The `id`
 * field is opaque and passed through untouched.
 *
 * @param {unknown} data
 * @returns {Array<{label: string, sublabel: string, group: string, href: string}>}
 */
function sanitizeItems(data) {
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
        return [];
    }
    const items = /** @type {{items?: unknown}} */ (data).items;
    if (!Array.isArray(items)) {
        return [];
    }
    const out = [];
    for (const item of items) {
        if (item === null || typeof item !== "object") {
            continue;
        }
        out.push({
            label: coerceString(item.label),
            sublabel: coerceString(item.sublabel),
            group: coerceString(item.group),
            href: coerceString(item.href),
        });
    }
    return out;
}

/**
 * Build one bead `<a>` from a sanitised item.
 *
 * @param {{label: string, sublabel: string, group: string, href: string}} item
 * @returns {HTMLAnchorElement}
 */
function buildBead(item) {
    const bead = document.createElement("a");
    bead.className = "msc-sequence-chain-bead";
    if (item.href !== "") {
        bead.setAttribute("href", item.href);
    }
    if (item.group !== "") {
        bead.setAttribute("data-group", item.group);
    }

    const disc = document.createElement("span");
    disc.className = "msc-sequence-chain-disc";
    disc.textContent = initials(item.label);
    disc.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "msc-sequence-chain-label";
    label.textContent = item.label;

    const sublabel = document.createElement("span");
    sublabel.className = "msc-sequence-chain-sublabel";
    sublabel.textContent = item.sublabel;

    bead.append(disc, label, sublabel);
    return bead;
}

/**
 * Build one connector element holding the inline ring glyph.
 *
 * @returns {HTMLSpanElement}
 */
function buildLink() {
    const link = document.createElement("span");
    link.className = "msc-sequence-chain-link";
    link.setAttribute("aria-hidden", "true");
    link.appendChild(buildRing());
    return link;
}

/**
 * Build the two-interlocked-rings glyph as an inline SVG. It paints in
 * `currentColor` so the consumer's stylesheet owns its colour.
 *
 * @returns {SVGSVGElement}
 */
function buildRing() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "msc-sequence-chain-ring");
    svg.setAttribute("viewBox", "0 0 44 24");
    svg.setAttribute("width", "44");
    svg.setAttribute("height", "24");
    svg.setAttribute("aria-hidden", "true");
    for (const cx of [18, 26]) {
        const circle = document.createElementNS(SVG_NS, "circle");
        circle.setAttribute("cx", String(cx));
        circle.setAttribute("cy", "12");
        circle.setAttribute("r", "6.5");
        circle.setAttribute("fill", "none");
        circle.setAttribute("stroke", "currentColor");
        circle.setAttribute("stroke-width", "2");
        svg.appendChild(circle);
    }
    return svg;
}

/**
 * Set / clear the `data-start` / `data-end` edge-fade flags from the scroll
 * container's live scroll metrics. A flag is present only when that edge has
 * content scrolled past it.
 *
 * @param {HTMLElement} scroll
 * @returns {void}
 */
function updateEdgeFlags(scroll) {
    const start = scroll.scrollLeft > EDGE_THRESHOLD_PX;
    const end = scroll.scrollLeft + scroll.clientWidth < scroll.scrollWidth - EDGE_THRESHOLD_PX;
    toggleAttribute(scroll, "data-start", start);
    toggleAttribute(scroll, "data-end", end);
}

/**
 * Set the attribute (value "1") when `on`, otherwise remove it.
 *
 * @param {HTMLElement} el
 * @param {string}      name
 * @param {boolean}     on
 * @returns {void}
 */
function toggleAttribute(el, name, on) {
    if (on) {
        el.setAttribute(name, "1");
    } else {
        el.removeAttribute(name);
    }
}

/**
 * Derive up to two uppercase initials from the first two whitespace-separated
 * words of a label. An empty label yields an empty string.
 *
 * @param {string} label
 * @returns {string}
 */
function initials(label) {
    return label
        .split(/\s+/)
        .filter((word) => word !== "")
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join("");
}

/**
 * Coerce any value to a trimmed string; null/undefined become "".
 *
 * @param {unknown} value
 * @returns {string}
 */
function coerceString(value) {
    if (typeof value === "string") {
        return value.trim();
    }
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).trim();
}
