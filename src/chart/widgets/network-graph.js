/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * @import { NetworkLink, NetworkModel, NetworkNode } from "../layout/network-layout.js"
 */

import { select } from "d3-selection";
import { computeLayout, nodeRadius } from "../layout/network-layout.js";
import { createChartTooltip, tooltipHeader } from "../tooltip.js";
import { safeHref } from "../util/safe-href.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    width: 720,
    height: 360,
};

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
 *
 * Emitted DOM / `msc-*` classes:
 *   - `svg.msc-network-graph` — root, carries `role="img"` + optional aria-label
 *   - `g.msc-network-graph-viewport` — the group holding the edges and the nodes
 *   - `g.msc-network-graph-edges` > `line.msc-network-graph-edge`
 *       (+ `…-edge--highlighted` for accent edges)
 *   - `g.msc-network-graph-nodes` > `a` > `circle.msc-network-graph-node`
 *       (+ `…-node--highlighted`, `…-node--hub`, `…-node--emphasis`); each
 *       circle carries `data-group`
 *   - `text.msc-network-graph-label` — the visible name label for a
 *       highlight-path endpoint (placed above its node by default) or the hub
 *       (below its node by default). A collision pass ({@see placeLabels} of the
 *       layout module) may relocate either one further out to clear an overlap.
 *       The text-anchor is `middle`, the hub label additionally
 *       `dominant-baseline: text-before-edge`
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
     *     emptyMessage?: string
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
            return this.renderEmptyState(this.emptyMessage);
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
            .attr("aria-label", this.ariaLabel === "" ? null : this.ariaLabel);

        const viewport = svg.append("g").attr("class", "msc-network-graph-viewport");

        this._renderEdges(viewport, model, layout);
        this._renderNodes(viewport, model, layout);

        return /** @type {SVGSVGElement} */ (svg.node());
    }

    /**
     * Render the cap badge when fewer nodes are shown than the total. The text
     * comes from the `i18n.capBadge` template with `{shown}` / `{total}`
     * substituted, so the widget hard-codes no English.
     *
     * @param {import("d3-selection").Selection<HTMLDivElement, unknown, null, undefined>} wrapper
     * @param {import("../layout/network-layout.js").NetworkModel} model
     *
     * @returns {void}
     * @private
     */
    _renderBadge(wrapper, model) {
        if (!(model.shownCount < model.totalCount)) {
            return;
        }

        const template =
            typeof this.i18n.capBadge === "string" ? this.i18n.capBadge : "{shown} / {total}";
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
     * @param {import("../layout/network-layout.js").NetworkModel} model
     * @param {import("../layout/network-layout.js").Layout} layout
     *
     * @returns {void}
     * @private
     */
    _renderEdges(viewport, model, layout) {
        // The accent is activated in the constructor over the `currentColor`
        // baseline, so it is always a string here.
        const accent = /** @type {string} */ (this._accent);

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
            .attr(
                "x1",
                (link) => /** @type {{x: number, y: number}} */ (layout.byId[link.source]).x,
            )
            .attr(
                "y1",
                (link) => /** @type {{x: number, y: number}} */ (layout.byId[link.source]).y,
            )
            .attr(
                "x2",
                (link) => /** @type {{x: number, y: number}} */ (layout.byId[link.target]).x,
            )
            .attr(
                "y2",
                (link) => /** @type {{x: number, y: number}} */ (layout.byId[link.target]).y,
            )
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
     * @param {import("../layout/network-layout.js").NetworkModel} model
     * @param {import("../layout/network-layout.js").Layout} layout
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
            .attr("cx", (node) => /** @type {{x: number, y: number}} */ (layout.byId[node.id]).x)
            .attr("cy", (node) => /** @type {{x: number, y: number}} */ (layout.byId[node.id]).y)
            .attr("r", (node) => nodeRadius(node));

        // Name labels for the highlight-path endpoints and the hub. The text is
        // the node's own label (the widget invents no domain text). Their resolved
        // positions come from `placeLabels` of the layout module. Endpoint labels
        // sit ABOVE the node, the hub label BELOW it (`dominant-baseline:
        // text-before-edge`), and any pair that would overlap is pushed apart
        // there, so two long names never collide and become unreadable.
        group
            .selectAll("text.msc-network-graph-label")
            .data(model.nodes.filter((node) => node.showLabel))
            .enter()
            .append("text")
            .attr("class", "msc-network-graph-label")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", (node) => (node.isHub ? "text-before-edge" : null))
            .attr(
                "x",
                (node) => /** @type {{x: number, y: number}} */ (layout.labelById[node.id]).x,
            )
            .attr(
                "y",
                (node) => /** @type {{x: number, y: number}} */ (layout.labelById[node.id]).y,
            )
            .text((node) => node.label);
    }
}

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
