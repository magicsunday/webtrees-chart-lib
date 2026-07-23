/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { select } from "d3-selection";
import { zoom as d3Zoom } from "d3-zoom";
import { createChartTooltip, tooltipHeader } from "../tooltip.js";
import { safeHref } from "../util/safe-href.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    width: 720,
    height: 360,
};

/**
 * Fixed seed for the layout PRNG. Identical input therefore always lays out to
 * identical coordinates, which keeps the static render stable across redraws
 * and lets a consumer cache / snapshot the result.
 */
const LAYOUT_SEED = 20240607;

/** Number of relaxation iterations the static force solver runs. */
const ITERS = 360;

/** Ideal edge length (spring rest length) in layout units. */
const IDEAL = 52;

/** Repulsion constant between every node pair (Coulomb-like). */
const REP = 3200;

/** Padding (layout units) added around the laid-out bounding box. */
const PAD = 34;

/**
 * Upper bound on the anisotropic layout stretch {@see fitToAspect} applies. The
 * force solver relaxes to a roughly round cloud, so a wide card would letterbox
 * it under `preserveAspectRatio="meet"`; stretching the positions to the card's
 * aspect fills the width. The cap stops a near-collinear excerpt (content aspect
 * far from the target) from being blown into a thin, distorted band.
 */
const MAX_STRETCH = 3;

/** Node radii by role. */
const R_HUB = 11;
const R_HIGHLIGHT = 7.5;
const R_PLAIN = 5.5;

/** Vertical gap (px) between a node edge and its name label baseline. */
const LABEL_GAP_ABOVE = 7;

/** Vertical gap (px) between a node edge and the hub label, placed below. */
const LABEL_GAP_BELOW = 14;

/** Approximate label font-size (layout units) used for width estimation; matches the consumer CSS. */
const LABEL_FONT_SIZE = 16;

/**
 * Average glyph width as a fraction of the font size. Lets the collision pass
 * estimate a label's width WITHOUT measuring the DOM (`getBBox` reads 0 while
 * the host tab is hidden), so label placement stays deterministic and testable.
 */
const LABEL_CHAR_WIDTH_RATIO = 0.58;

/** Label extent above the text baseline (layout units) — the glyph ascent plus a halo margin. */
const LABEL_ASCENT = 16;

/** Label extent below the text baseline (layout units) — the glyph descent plus a halo margin. */
const LABEL_DESCENT = 6;

/** Vertical step (layout units) when relocating a collided label; larger than the full box so one step clears. */
const LABEL_LINE_HEIGHT = 22;

/**
 * A deterministic 32-bit PRNG (mulberry32). Returns a function producing a new
 * float in [0, 1) on each call. Seeding it with a constant makes the whole
 * layout reproducible.
 *
 * @param {number} seed Initial 32-bit seed.
 *
 * @returns {() => number} A zero-argument generator returning floats in [0, 1).
 */
function mulberry32(seed) {
    let state = seed | 0;

    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * NetworkGraph — a domain-neutral, force-directed graph widget. It lays nodes
 * and edges out with a SEEDED, fixed-iteration static force solver (NOT
 * `d3-force`, which is neither a dependency here nor deterministic), so the same
 * payload always produces the same coordinates. There is no live simulation:
 * the layout is solved once at draw time, which also means it honours
 * `prefers-reduced-motion` for free (a reduced-motion entrance simply skips the
 * fade-in transition; the geometry is identical either way).
 *
 * The widget paints only geometry and the highlight accent. It assigns NO colour
 * or shape by `group` — each node's `group` becomes a `data-group` attribute the
 * consumer styles via CSS. Every node is wrapped in an `<a href>` (the consumer
 * supplies `href`), so a node is a real link.
 *
 * Data contract — `draw(data)` with:
 *   - `nodes`: `[{ id, label, title?, group?, emphasis?, href? }]`
 *       - `id`        — stable key, referenced by links / highlightPath / hubId
 *       - `label`     — accessible label (applied to the node's `<a>` title) and
 *                       the text of the visible name label, when the node carries
 *                       one (a highlight-path endpoint or the hub)
 *       - `title`     — optional rich hover text → styled tooltip body; absent →
 *                       the tooltip falls back to `label` (the widget invents no
 *                       domain text)
 *       - `group`     — opaque category → `data-group` attr (no widget colour)
 *       - `emphasis`  — render at the larger highlight radius
 *       - `href`      — anchor target (omitted → an inert `<a>` with no href)
 *   - `links`: `[{ source, target, highlighted? }]` — `source`/`target` are node
 *     ids; an unknown id drops the link. `highlighted` paints the edge in accent.
 *   - `highlightPath`: `string[]` — node ids forming a path; the nodes get the
 *     highlight class and every consecutive id pair, in either direction, is
 *     treated as a highlighted edge (in addition to per-link `highlighted`).
 *   - `hubId`: `string` — the central node; rendered at the largest radius with
 *     an emphasis ring.
 *   - `totalCount` / `shownCount` — when `shownCount < totalCount` a cap badge
 *     renders, its text taken from the `i18n.capBadge` template.
 *
 * Options:
 *   - `width` / `height` — explicit pixel size; otherwise responsive to the host
 *     element at draw time, falling back to 720 × 360.
 *   - `accent` — CSS colour applied to highlighted edges' stroke (default
 *     `currentColor`). Plain nodes/edges carry no widget colour; CSS styles them.
 *   - `i18n` — copy pack. `capBadge` is a template with `{shown}` / `{total}`
 *     placeholders (default `"{shown} / {total}"`).
 *   - `ariaLabel` — accessible label on the root `<svg>`.
 *   - `emptyMessage` — placeholder text for an empty / null payload.
 *   - `zoom` — when `true`, attaches a `d3-zoom` pan/zoom behaviour to the svg.
 *
 * Emitted DOM / `msc-*` classes:
 *   - `svg.msc-network-graph` — root, carries `role="img"` + optional aria-label
 *   - `g.msc-network-graph-viewport` — the pan/zoom transform target
 *   - `g.msc-network-graph-edges` > `line.msc-network-graph-edge`
 *       (+ `…-edge--highlighted` for accent edges)
 *   - `g.msc-network-graph-nodes` > `a` > `circle.msc-network-graph-node`
 *       (+ `…-node--highlighted`, `…-node--hub`, `…-node--emphasis`); each
 *       circle carries `data-group`
 *   - `text.msc-network-graph-label` — the visible name label for a
 *       highlight-path endpoint (placed above its node by default) or the hub
 *       (below its node by default); a collision pass ({@see placeLabels}) may
 *       relocate either one further out to clear an overlap; text-anchor
 *       `middle`, the hub label additionally `dominant-baseline: text-before-edge`
 *   - `div.msc-chart-tooltip` — the shared body-level styled hover tooltip
 *   - `div.msc-network-graph-badge` — the cap badge (only when capped)
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class NetworkGraph extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     width?: number,
     *     height?: number,
     *     accent?: string,
     *     i18n?: { capBadge?: string },
     *     ariaLabel?: string,
     *     emptyMessage?: string,
     *     zoom?: boolean
     * }} [options]
     */
    constructor(target, options) {
        super(target, options, { emptyMessage: "" });
        this.accent = this.options.accent;
        this.i18n = this.options.i18n;
    }

    /**
     * @param {{
     *     nodes: Array<{id: string, label?: string, title?: string, group?: string, emphasis?: boolean, href?: string}>,
     *     links?: Array<{source: string, target: string, highlighted?: boolean}>,
     *     highlightPath?: Array<string>,
     *     hubId?: string,
     *     totalCount?: number,
     *     shownCount?: number
     * }|null|undefined} data
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearRoot("div.msc-network-graph-wrapper");

        const model = sanitize(data);

        if (model.nodes.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const width = this._resolveWidth(DEFAULT_OPTIONS.width);
        const height = this._resolveHeight(DEFAULT_OPTIONS.height);

        const layout = computeLayout(model, width, height);

        const wrapper = select(this.target)
            .append("div")
            .attr("class", "msc-network-graph-wrapper");

        this._renderBadge(wrapper, model);

        const reduce = this._prefersReducedMotion();

        const svg = wrapper
            .append("svg")
            .attr(
                "class",
                reduce ? "msc-network-graph" : "msc-network-graph msc-network-graph--anim",
            )
            .attr("width", "100%")
            .attr("height", height)
            .attr("viewBox", layout.viewBox)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel === "" ? null : this._ariaLabel);

        const viewport = svg.append("g").attr("class", "msc-network-graph-viewport");

        this._renderEdges(viewport, model, layout);
        this._renderNodes(viewport, model, layout);

        if (this.options.zoom === true) {
            this._attachZoom(svg, viewport);
        }

        return svg.node();
    }

    /**
     * Render the cap badge when fewer nodes are shown than the total. The text
     * comes from the `i18n.capBadge` template with `{shown}` / `{total}`
     * substituted, so the widget hard-codes no English.
     *
     * @param {import("d3-selection").Selection<HTMLDivElement, unknown, null, undefined>} wrapper
     * @param {NetworkModel} model
     *
     * @returns {void}
     * @private
     */
    _renderBadge(wrapper, model) {
        if (!(model.shownCount < model.totalCount)) {
            return;
        }

        const template =
            typeof this._i18n.capBadge === "string" ? this._i18n.capBadge : "{shown} / {total}";
        const text = template
            .replace("{shown}", String(model.shownCount))
            .replace("{total}", String(model.totalCount));

        wrapper.append("div").attr("class", "msc-network-graph-badge").text(text);
    }

    /**
     * Render the edge layer FIRST (so nodes paint on top). A highlighted edge —
     * either flagged `highlighted` or lying on the highlight path — takes the
     * accent class and the accent stroke; plain edges carry no widget colour.
     *
     * @param {import("d3-selection").Selection<SVGGElement, unknown, null, undefined>} viewport
     * @param {NetworkModel} model
     * @param {Layout}       layout
     *
     * @returns {void}
     * @private
     */
    _renderEdges(viewport, model, layout) {
        const accent = this._accent;

        viewport
            .append("g")
            .attr("class", "msc-network-graph-edges")
            .selectAll("line")
            .data(model.links)
            .enter()
            .append("line")
            .attr("class", (link) =>
                link.isHighlighted
                    ? "msc-network-graph-edge msc-network-graph-edge--highlighted"
                    : "msc-network-graph-edge",
            )
            .attr("x1", (link) => layout.byId[link.source].x)
            .attr("y1", (link) => layout.byId[link.source].y)
            .attr("x2", (link) => layout.byId[link.target].x)
            .attr("y2", (link) => layout.byId[link.target].y)
            // Inline style so the consumer-supplied accent wins over any stroke
            // rule the `…-edge--highlighted` CSS class carries (a presentation
            // attribute would lose to that class).
            .style("stroke", (link) => (link.isHighlighted ? accent : null))
            .attr("stroke-linecap", "round");
    }

    /**
     * Render the node layer on top of the edges. Each node is an `<a href>`
     * wrapping a circle; `group` becomes `data-group` (the widget never colours
     * by group). A hub / emphasis / highlight-path node gets a larger radius and
     * the matching class.
     *
     * @param {import("d3-selection").Selection<SVGGElement, unknown, null, undefined>} viewport
     * @param {NetworkModel} model
     * @param {Layout}       layout
     *
     * @returns {void}
     * @private
     */
    _renderNodes(viewport, model, layout) {
        const group = viewport.append("g").attr("class", "msc-network-graph-nodes");

        const anchors = group
            .selectAll("a")
            .data(model.nodes)
            .enter()
            .append("a")
            // Route the consumer-supplied href through the scheme guard: a
            // hostile `javascript:` / `data:` / `vbscript:` target is dropped,
            // leaving an inert `<a>` with no href rather than a live exploit.
            .attr("href", (node) => {
                const href = safeHref(node.href);
                return href === "" ? null : href;
            });

        // Keep the native `<title>` for accessibility, and add the styled
        // follow-cursor tooltip as the primary hover affordance (mirroring the
        // other widgets). The tooltip body is `node.title` when the consumer
        // supplies it, otherwise the bare label.
        anchors.append("title").text((node) => node.label);

        const tooltip = createChartTooltip();
        anchors
            // Set the body once on enter (it is constant per node), then only
            // reposition on move — avoids re-writing the tooltip innerHTML on
            // every mousemove.
            .on("mouseenter", (event, node) => {
                const body = node.title === "" ? node.label : node.title;
                tooltip.show(event, tooltipHeader(body));
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        anchors
            .append("circle")
            .attr("class", (node) => nodeClass(node))
            .attr("data-group", (node) => (node.group === "" ? null : node.group))
            .attr("cx", (node) => layout.byId[node.id].x)
            .attr("cy", (node) => layout.byId[node.id].y)
            .attr("r", (node) => nodeRadius(node));

        // Name labels for the highlight-path endpoints and the hub. The text is
        // the node's own label (the widget invents no domain text). Their resolved
        // positions come from {@link placeLabels}: endpoint labels sit ABOVE the
        // node, the hub label BELOW it (`dominant-baseline: text-before-edge`),
        // and any pair that would overlap is pushed apart there, so two long
        // names never collide and become unreadable.
        group
            .selectAll("text.msc-network-graph-label")
            .data(model.nodes.filter((node) => node.showLabel))
            .enter()
            .append("text")
            .attr("class", "msc-network-graph-label")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", (node) => (node.isHub ? "text-before-edge" : null))
            .attr("x", (node) => layout.labelById[node.id].x)
            .attr("y", (node) => layout.labelById[node.id].y)
            .text((node) => node.label);
    }

    /**
     * Attach an optional `d3-zoom` pan/zoom behaviour, transforming the viewport
     * group. Only wired when `options.zoom === true`.
     *
     * @param {import("d3-selection").Selection<SVGSVGElement, unknown, null, undefined>} svg
     * @param {import("d3-selection").Selection<SVGGElement, unknown, null, undefined>}  viewport
     *
     * @returns {void}
     * @private
     */
    _attachZoom(svg, viewport) {
        const behavior = d3Zoom().scaleExtent([0.5, 6]);
        behavior.on("zoom", (event) => {
            viewport.attr("transform", event.transform.toString());
        });
        svg.call(behavior);
    }
}

/**
 * @typedef {object} NetworkNode
 * @property {string}  id
 * @property {string}  label
 * @property {string}  title        Rich hover text (empty string → fall back to label).
 * @property {string}  group
 * @property {boolean} emphasis
 * @property {string}  href
 * @property {boolean} isHub        Whether this node is the hub.
 * @property {boolean} onHighlight  Whether this node is on the highlight path.
 * @property {boolean} showLabel    Whether this node carries a visible name label.
 */

/**
 * @typedef {object} NetworkLink
 * @property {string}  source
 * @property {string}  target
 * @property {boolean} isHighlighted
 */

/**
 * @typedef {object} NetworkModel
 * @property {Array<NetworkNode>} nodes
 * @property {Array<NetworkLink>} links
 * @property {number}             totalCount
 * @property {number}             shownCount
 */

/**
 * @typedef {object} Layout
 * @property {Object<string, {x: number, y: number}>}                 byId      Node id → resolved coordinates.
 * @property {Object<string, {x: number, y: number}>} labelById Labelled node id → resolved label anchor.
 * @property {string}                                                 viewBox   The fitted svg viewBox string.
 */

/**
 * The CSS class for a node circle, layering hub / highlight modifiers onto the
 * base class.
 *
 * @param {NetworkNode} node
 *
 * @returns {string}
 */
function nodeClass(node) {
    let cls = "msc-network-graph-node";

    if (node.onHighlight) {
        cls += " msc-network-graph-node--highlighted";
    }

    if (node.isHub) {
        cls += " msc-network-graph-node--hub";
    }

    if (node.emphasis) {
        cls += " msc-network-graph-node--emphasis";
    }

    return cls;
}

/**
 * The rendered radius for a node: the hub is largest, an emphasised or
 * highlight-path node mid-sized, everything else the plain radius.
 *
 * @param {NetworkNode} node
 *
 * @returns {number}
 */
function nodeRadius(node) {
    if (node.isHub) {
        return R_HUB;
    }

    if (node.emphasis || node.onHighlight) {
        return R_HIGHLIGHT;
    }

    return R_PLAIN;
}

/**
 * Validate + normalise the payload into a typed model. Drops nodes without a
 * usable id, de-duplicates them by id, and drops links whose endpoints are not
 * both present. Resolves the per-node hub / highlight flags and the per-link
 * highlighted flag (explicit flag OR consecutive pair on the highlight path).
 * Returns an empty `nodes` array when there is nothing to draw.
 *
 * @param {unknown} data
 *
 * @returns {NetworkModel}
 */
function sanitize(data) {
    if (data === null || typeof data !== "object") {
        return { nodes: [], links: [], totalCount: 0, shownCount: 0 };
    }

    const source = /** @type {Record<string, unknown>} */ (data);
    const highlightPath = (Array.isArray(source.highlightPath) ? source.highlightPath : []).filter(
        (id) => typeof id === "string" && id !== "",
    );
    const hubId = typeof source.hubId === "string" ? source.hubId : "";

    // The nodes that carry a visible name label: the two endpoints of the
    // highlight path plus the hub (de-duplicated — an endpoint can be the hub).
    const labelled = new Set();
    if (highlightPath.length > 0) {
        labelled.add(highlightPath[0]);
        labelled.add(highlightPath[highlightPath.length - 1]);
    }
    if (hubId !== "") {
        labelled.add(hubId);
    }

    const nodes = sanitizeNodes(source.nodes, hubId, new Set(highlightPath), labelled);
    const known = new Set(nodes.map((node) => node.id));
    const links = sanitizeLinks(source.links, known, buildPathPairs(highlightPath));

    const totalCount = Number(source.totalCount);
    const shownCount = Number(source.shownCount);

    return {
        nodes,
        links,
        totalCount: Number.isFinite(totalCount) ? totalCount : nodes.length,
        shownCount: Number.isFinite(shownCount) ? shownCount : nodes.length,
    };
}

/**
 * Normalise the raw node list into typed, de-duplicated {@link NetworkNode}s,
 * dropping entries without a usable string id and resolving the per-node hub /
 * highlight flags.
 *
 * @param {unknown}     raw          The raw `nodes` field.
 * @param {string}      hubId        The hub node id (empty string for none).
 * @param {Set<string>} highlightSet The highlight-path node ids.
 * @param {Set<string>} labelledSet  The node ids that carry a visible name label.
 *
 * @returns {Array<NetworkNode>}
 */
function sanitizeNodes(raw, hubId, highlightSet, labelledSet) {
    const rawNodes = Array.isArray(raw) ? raw : [];

    /** @type {Array<NetworkNode>} */
    const nodes = [];
    const seen = new Set();

    for (const entry of rawNodes) {
        if (entry === null || typeof entry !== "object") {
            continue;
        }

        const node = /** @type {Record<string, unknown>} */ (entry);
        const id = typeof node.id === "string" ? node.id : "";

        if (id === "" || seen.has(id)) {
            continue;
        }

        seen.add(id);
        nodes.push({
            id,
            label: typeof node.label === "string" ? node.label : id,
            title: typeof node.title === "string" ? node.title : "",
            group: typeof node.group === "string" ? node.group : "",
            emphasis: node.emphasis === true,
            href: typeof node.href === "string" ? node.href : "",
            isHub: id === hubId,
            onHighlight: highlightSet.has(id),
            showLabel: labelledSet.has(id),
        });
    }

    return nodes;
}

/**
 * Build the set of highlighted edge keys: every consecutive id pair on the
 * highlight path, stored in both directions so an edge matches regardless of
 * its source/target order.
 *
 * @param {Array<string>} highlightPath
 *
 * @returns {Set<string>}
 */
function buildPathPairs(highlightPath) {
    const pairs = new Set();

    for (let i = 0; i < highlightPath.length - 1; i++) {
        pairs.add(`${highlightPath[i]}|${highlightPath[i + 1]}`);
        pairs.add(`${highlightPath[i + 1]}|${highlightPath[i]}`);
    }

    return pairs;
}

/**
 * Normalise the raw link list into typed {@link NetworkLink}s, dropping links
 * whose endpoints are not both present in `known` and flagging the highlighted
 * ones (explicit `highlighted` OR a consecutive pair on the highlight path).
 *
 * @param {unknown}     raw       The raw `links` field.
 * @param {Set<string>} known     The ids of the surviving nodes.
 * @param {Set<string>} pathPairs The highlighted edge keys from {@link buildPathPairs}.
 *
 * @returns {Array<NetworkLink>}
 */
function sanitizeLinks(raw, known, pathPairs) {
    const rawLinks = Array.isArray(raw) ? raw : [];

    /** @type {Array<NetworkLink>} */
    const links = [];

    for (const entry of rawLinks) {
        if (entry === null || typeof entry !== "object") {
            continue;
        }

        const link = /** @type {Record<string, unknown>} */ (entry);
        const sourceId = typeof link.source === "string" ? link.source : "";
        const targetId = typeof link.target === "string" ? link.target : "";

        if (!known.has(sourceId) || !known.has(targetId)) {
            continue;
        }

        links.push({
            source: sourceId,
            target: targetId,
            isHighlighted: link.highlighted === true || pathPairs.has(`${sourceId}|${targetId}`),
        });
    }

    return links;
}

/**
 * Run the deterministic static force solver and fit a viewBox around the
 * result. Ports the prototype's spring/repulsion/centering relaxation: nodes
 * seed on a ring (with seeded jitter), repel pairwise (Coulomb), springs pull
 * linked pairs toward `IDEAL`, a weak centering force keeps the graph framed,
 * and a per-iteration cooling factor anneals the motion. Because the PRNG is
 * seeded with a constant and the iteration count is fixed, identical input
 * yields identical coordinates.
 *
 * @param {NetworkModel} model
 * @param {number}       width
 * @param {number}       height
 *
 * @returns {Layout}
 */
function computeLayout(model, width, height) {
    const count = model.nodes.length;
    const index = {};
    model.nodes.forEach((node, i) => {
        index[node.id] = i;
    });

    const rng = mulberry32(LAYOUT_SEED);
    const ring = Math.min(width, height) * 0.32;

    /** @type {Array<{x: number, y: number, vx: number, vy: number}>} */
    const points = model.nodes.map((_, i) => {
        const angle = (i / count) * Math.PI * 2;

        return {
            x: width / 2 + Math.cos(angle) * ring + (rng() - 0.5) * 24,
            y: height / 2 + Math.sin(angle) * ring + (rng() - 0.5) * 24,
            vx: 0,
            vy: 0,
        };
    });

    for (let iteration = 0; iteration < ITERS; iteration++) {
        const cool = 1 - iteration / ITERS;

        for (let i = 0; i < count; i++) {
            for (let j = i + 1; j < count; j++) {
                const dx = points[i].x - points[j].x;
                const dy = points[i].y - points[j].y;
                const d2 = dx * dx + dy * dy || 0.01;
                const d = Math.sqrt(d2);
                const f = REP / d2;
                const fx = (f * dx) / d;
                const fy = (f * dy) / d;
                points[i].vx += fx;
                points[i].vy += fy;
                points[j].vx -= fx;
                points[j].vy -= fy;
            }
        }

        for (const link of model.links) {
            const a = points[index[link.source]];
            const b = points[index[link.target]];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
            const f = (d - IDEAL) * 0.09;
            const fx = (f * dx) / d;
            const fy = (f * dy) / d;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
        }

        for (let i = 0; i < count; i++) {
            points[i].vx += (width / 2 - points[i].x) * 0.004;
            points[i].vy += (height / 2 - points[i].y) * 0.004;
            points[i].x += Math.max(-14, Math.min(14, points[i].vx)) * cool * 0.55;
            points[i].y += Math.max(-14, Math.min(14, points[i].vy)) * cool * 0.55;
            points[i].vx *= 0.86;
            points[i].vy *= 0.86;
        }
    }

    // Stretch the solved positions to the card's aspect ratio so the isotropic
    // force cloud fills the full width instead of being letterboxed by
    // `preserveAspectRatio="meet"`. Only positions move — node radii are applied
    // later at render, so the dots stay perfect circles; only the (metric-free)
    // edge lengths stretch. Runs BEFORE label placement so the de-collision and
    // the fitted viewBox both see the final geometry.
    fitToAspect(points, width / height);

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    /** @type {Object<string, {x: number, y: number}>} */
    const byId = {};

    model.nodes.forEach((node, i) => {
        const point = points[i];
        byId[node.id] = { x: point.x, y: point.y };
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    });

    // Place the visible labels (highlight-path endpoints + hub) and resolve any
    // overlap between them, then frame the viewBox around BOTH the nodes and the
    // resolved label boxes so a long name never collides with its neighbour nor
    // clips at the frame edge.
    const labelled = model.nodes
        .filter((node) => node.showLabel)
        .map((node) => ({
            id: node.id,
            x: byId[node.id].x,
            y: byId[node.id].y,
            r: nodeRadius(node),
            isHub: node.isHub,
            label: node.label,
        }));

    const placement = placeLabels(labelled);

    let extMinX = minX;
    let extMinY = minY;
    let extMaxX = maxX;
    let extMaxY = maxY;

    for (const box of placement.boxes) {
        extMinX = Math.min(extMinX, box.left);
        extMinY = Math.min(extMinY, box.top);
        extMaxX = Math.max(extMaxX, box.right);
        extMaxY = Math.max(extMaxY, box.bottom);
    }

    const viewBox = `${extMinX - PAD} ${extMinY - PAD} ${extMaxX - extMinX + PAD * 2} ${extMaxY - extMinY + PAD * 2}`;

    return { byId, viewBox, labelById: placement.byId };
}

/**
 * Stretch a solved point cloud (in place) toward a target aspect ratio so it
 * fills a non-square card instead of being letterboxed. Only the axis that is
 * UNDER-used grows, scaled around the cloud's centre, so the layout keeps its
 * centre of mass; the other axis is left untouched. The scale is bounded by
 * {@see MAX_STRETCH} so a near-collinear cloud (content aspect far from the
 * target) cannot blow into a thin distorted band, and a degenerate cloud with no
 * extent on an axis is left unchanged (no division by zero). Point radii are not
 * touched here — they are applied at render — so the rendered nodes stay circles.
 *
 * @param {Array<{x: number, y: number}>} points       The solved positions, mutated in place
 * @param {number}                        targetAspect The card's width / height ratio
 *
 * @returns {void}
 */
export function fitToAspect(points, targetAspect) {
    if (points.length === 0 || !(targetAspect > 0)) {
        return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;

    // A cloud with no extent on either axis cannot define an aspect ratio.
    if (spanX < 1 || spanY < 1) {
        return;
    }

    const contentAspect = spanX / spanY;

    if (contentAspect < targetAspect) {
        const scale = Math.min(targetAspect / contentAspect, MAX_STRETCH);
        const centerX = (minX + maxX) / 2;

        for (const point of points) {
            point.x = centerX + (point.x - centerX) * scale;
        }

        return;
    }

    if (contentAspect > targetAspect) {
        const scale = Math.min(contentAspect / targetAspect, MAX_STRETCH);
        const centerY = (minY + maxY) / 2;

        for (const point of points) {
            point.y = centerY + (point.y - centerY) * scale;
        }
    }
}

/**
 * Estimate a label's rendered width in layout units without touching the DOM
 * (`getBBox` reads 0 while the host tab is hidden), so the collision pass stays
 * deterministic and unit-testable.
 *
 * @param {string} label
 *
 * @returns {number}
 */
function estimateLabelWidth(label) {
    return label.length * LABEL_FONT_SIZE * LABEL_CHAR_WIDTH_RATIO;
}

/**
 * Axis-aligned box overlap test.
 *
 * @param {{left: number, right: number, top: number, bottom: number}} a
 * @param {{left: number, right: number, top: number, bottom: number}} b
 *
 * @returns {boolean}
 */
function overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Resolve the (few) visible labels' positions: an endpoint label sits above its
 * node, the hub label below. When a later label's box would overlap one already
 * placed, it is pushed further in its own direction (endpoints up, the hub down)
 * by whole line-heights until it clears every placed label — so two long names
 * never collide. The first label of each kind keeps the exact default offset.
 *
 * Returns both the resolved anchor per node id and the occupied boxes so the
 * caller can fit the viewBox around the labels too.
 *
 * @param {Array<{id: string, x: number, y: number, r: number, isHub: boolean, label: string}>} labelled
 *
 * @returns {{byId: Object<string, {x: number, y: number}>, boxes: Array<{left: number, right: number, top: number, bottom: number}>}}
 */
export function placeLabels(labelled) {
    /** @type {Object<string, {x: number, y: number}>} */
    const byId = {};

    /** @type {Array<{left: number, right: number, top: number, bottom: number}>} */
    const boxes = [];

    for (const node of labelled) {
        const halfWidth = Math.max(estimateLabelWidth(node.label), node.r * 2) / 2;

        // The anchor is the SVG text origin: a hub label's top edge (it carries
        // `dominant-baseline: text-before-edge`, growing down), an endpoint
        // label's baseline (growing up, with a descent reaching below it). The
        // box spans the real inked extent so a descender can't graze the label
        // below it.
        /** @param {number} anchorY */
        const boxFor = (anchorY) =>
            node.isHub
                ? {
                      left: node.x - halfWidth,
                      right: node.x + halfWidth,
                      top: anchorY,
                      bottom: anchorY + LABEL_ASCENT + LABEL_DESCENT,
                  }
                : {
                      left: node.x - halfWidth,
                      right: node.x + halfWidth,
                      top: anchorY - LABEL_ASCENT,
                      bottom: anchorY + LABEL_DESCENT,
                  };

        /** @param {{left: number, right: number, top: number, bottom: number}} candidate */
        const isClear = (candidate) => !boxes.some((placed) => overlaps(placed, candidate));

        const defaultY = node.isHub
            ? node.y + node.r + LABEL_GAP_BELOW
            : node.y - node.r - LABEL_GAP_ABOVE;

        let anchorY = defaultY;
        let box = boxFor(anchorY);

        // When the default position collides, scan OUTWARD for the nearest clear
        // slot — trying the label's natural side first (endpoints up, the hub
        // down), then the opposite — so even three mutually overlapping labels
        // each land in free space instead of a fixed-direction push trapping
        // them against one another.
        if (!isClear(box)) {
            const naturalDir = node.isHub ? 1 : -1;

            for (let step = 1; step <= 40; ++step) {
                const natural = boxFor(defaultY + naturalDir * step * LABEL_LINE_HEIGHT);

                if (isClear(natural)) {
                    anchorY = defaultY + naturalDir * step * LABEL_LINE_HEIGHT;
                    box = natural;
                    break;
                }

                const opposite = boxFor(defaultY - naturalDir * step * LABEL_LINE_HEIGHT);

                if (isClear(opposite)) {
                    anchorY = defaultY - naturalDir * step * LABEL_LINE_HEIGHT;
                    box = opposite;
                    break;
                }
            }
        }

        boxes.push(box);
        byId[node.id] = { x: node.x, y: anchorY };
    }

    return { byId, boxes };
}
