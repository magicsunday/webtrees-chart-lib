/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { sankey, sankeyJustify, sankeyLinkHorizontal } from "d3-sankey";
import { scaleOrdinal } from "d3-scale";
import { schemeTableau10 } from "d3-scale-chromatic";
import { select } from "d3-selection";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { pickPositive } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 320,
    margin: { top: 8, right: 130, bottom: 8, left: 130 },
    nodeWidth: 14,
    nodePad: 10,
};

/**
 * Sankey diagram for directed weighted flows between two columns of nodes (e.g.
 * source category → target category). The caller is responsible for delivering
 * a DAG payload — d3-sankey throws "circular link" otherwise. For bipartite
 * use-cases where a node could appear on both ends, the caller splits the node
 * set so source-side and target-side nodes occupy disjoint index ranges; this
 * widget caches the cycle-failure case and renders the empty state rather than
 * letting the throw take down the consumer.
 *
 * Styling hooks (the consumer's stylesheet owns colour — the widget ships no
 * opinionated palette): `.msc-sankey-flow` (root svg) wraps a
 * `<g class="msc-sankey-flow-links">` group of `path.msc-sankey-flow-link` edges
 * and a `<g class="msc-sankey-flow-nodes">` group whose `g.msc-sankey-flow-node`
 * entries each hold a `rect` and a `text.msc-sankey-flow-node-label`. The edge
 * `stroke` and the node `fill` are set as presentation attributes from an
 * ordinal scale, so a host stylesheet rule overrides them without `!important`.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class SankeyFlow extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     margin?: {top: number, right: number, bottom: number, left: number},
     *     nodeWidth?: number,
     *     nodePad?: number,
     *     emptyMessage?: string,
     *     ariaLabel?: string,
     *     i18n?: {
     *         totalSingular?: string,
     *         totalPlural?: string
     *     }
     * }} [options]
     */
    constructor(target, options) {
        super(target, options, {
            margin: DEFAULT_OPTIONS.margin,
            ariaLabel: "Sankey flow",
        });
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        this.nodeWidth = this.options.nodeWidth;
        this.nodePad = this.options.nodePad;
        this.i18n = this.options.i18n;
    }

    /**
     * The node rectangle width in pixels. A non-positive or non-finite value
     * falls back to the default.
     *
     * @returns {number}
     */
    get nodeWidth() {
        return this._nodeWidth;
    }

    /**
     * @param {number|undefined} value The node width in pixels; a missing or
     *   non-positive value resets to the default. The runtime guard keeps the
     *   JSON dispatcher (which assigns untyped values) safe.
     */
    set nodeWidth(value) {
        this._nodeWidth = pickPositive(value, DEFAULT_OPTIONS.nodeWidth);
    }

    /**
     * The vertical padding between nodes in a column, in pixels. A non-positive
     * or non-finite value falls back to the default.
     *
     * @returns {number}
     */
    get nodePad() {
        return this._nodePad;
    }

    /**
     * @param {number|undefined} value The node padding in pixels; a missing or
     *   non-positive value resets to the default. The runtime guard keeps the
     *   JSON dispatcher (which assigns untyped values) safe.
     */
    set nodePad(value) {
        this._nodePad = pickPositive(value, DEFAULT_OPTIONS.nodePad);
    }

    /**
     * @param {{
     *     nodes: Array<{name: string}>,
     *     links: Array<{
     *         source: number,
     *         target: number,
     *         value: number,
     *         samples?: Array<{name: string, xref?: string}>
     *     }>
     * }|null|undefined} data
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        if (
            !data ||
            !Array.isArray(data.nodes) ||
            data.nodes.length === 0 ||
            !Array.isArray(data.links) ||
            data.links.length === 0
        ) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const height = this._resolveHeight(DEFAULT_OPTIONS.height);
        const margin = this._margin;
        const width = this._resolveWidth(900, 360);
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        const tooltip = createChartTooltip();

        const colour = scaleOrdinal()
            .domain(data.nodes.map((entry) => entry.name))
            .range(schemeTableau10);

        const sankeyLayout = sankey()
            .nodeWidth(this._nodeWidth)
            .nodePadding(this._nodePad)
            .nodeAlign(sankeyJustify)
            .extent([
                [margin.left, margin.top],
                [margin.left + innerWidth, margin.top + innerHeight],
            ]);

        // d3-sankey throws "circular link" the moment its input
        // resolves to a directed cycle. Treat that as "no usable
        // data" rather than letting the whole consumer break.
        let graph;
        try {
            graph = sankeyLayout({
                nodes: data.nodes.map((entry) => ({ ...entry })),
                links: data.links.map((link) => ({ ...link })),
            });
        } catch (_error) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const svg = select(this.target)
            .append("svg")
            .attr("class", "msc-sankey-flow")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel);

        const linkPath = sankeyLinkHorizontal();

        const links = svg
            .append("g")
            .attr("class", "msc-sankey-flow-links")
            .selectAll("path.msc-sankey-flow-link")
            .data(graph.links)
            .enter()
            .append("path")
            .attr("class", "msc-sankey-flow-link")
            .attr("d", linkPath)
            .attr("fill", "none")
            .attr("stroke", (link) => colour(link.source.name))
            .attr("stroke-opacity", 0)
            .attr("stroke-width", 0)
            .attr("tabindex", "0")
            .attr(
                "aria-label",
                (link) => `${link.source.name} → ${link.target.name}: ${link.value}`,
            );

        const i18n = this._i18n;
        const linkValueLabel = (count) => {
            const template =
                count === 1
                    ? (i18n.totalSingular ?? "{count} item")
                    : (i18n.totalPlural ?? "{count} items");
            return template.replace("{count}", String(count));
        };

        links
            .on("mouseover", (event, link) => {
                const head =
                    `<strong>${escapeHtml(link.source.name)} → ${escapeHtml(link.target.name)}</strong><br>` +
                    `<span class="msc-chart-tooltip__stat">${escapeHtml(linkValueLabel(link.value))}</span>`;
                const samples = Array.isArray(link.samples) ? link.samples : [];
                const sampleList = samples
                    .filter((sample) => sample !== null && typeof sample === "object")
                    .map((sample) => escapeHtml(String(sample.name ?? "")))
                    .filter((name) => name !== "")
                    .join("<br>");
                const body = sampleList
                    ? `${head}<div class="msc-chart-tooltip__meta">${sampleList}</div>`
                    : head;
                tooltip.show(event, body);
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        const nodes = svg
            .append("g")
            .attr("class", "msc-sankey-flow-nodes")
            .selectAll("g.msc-sankey-flow-node")
            .data(graph.nodes)
            .enter()
            .append("g")
            .attr("class", "msc-sankey-flow-node");

        const nodeRects = nodes
            .append("rect")
            .attr("x", (entry) => entry.x0)
            .attr("y", (entry) => entry.y0)
            .attr("width", (entry) => Math.max(0, entry.x1 - entry.x0))
            .attr("height", (entry) => Math.max(0, entry.y1 - entry.y0))
            .attr("fill", (entry) => colour(entry.name))
            .attr("opacity", 0);

        const nodeLabels = nodes
            .append("text")
            .attr("class", "msc-sankey-flow-node-label")
            .attr("x", (entry) => (entry.x0 < width / 2 ? entry.x1 + 6 : entry.x0 - 6))
            .attr("y", (entry) => (entry.y0 + entry.y1) / 2)
            .attr("dominant-baseline", "middle")
            .attr("text-anchor", (entry) => (entry.x0 < width / 2 ? "start" : "end"))
            .attr("opacity", 0)
            .text((entry) => entry.name);

        // Entry cascade: links fade + thicken (staggered by index), then node
        // rects fade in, then labels — a left-to-right reveal. Initial keyframes
        // (opacity / stroke 0) are set above; _runEntry animates inline, holds
        // for reveal-on-scroll, or jumps to the final state under reduced
        // motion. All three steps run in one closure so the cascade is preserved
        // whenever it plays.
        this._runEntry((animate) => {
            this._enter(links, animate, "sankey-enter", 900, (_, index) => index * 40)
                .attr("stroke-opacity", 0.45)
                .attr("stroke-width", (link) => Math.max(1, link.width));

            this._enter(nodeRects, animate, "sankey-nodes", 600, 450).attr("opacity", 0.9);

            this._enter(nodeLabels, animate, "sankey-labels", 600, 600).attr("opacity", 1);
        });

        return svg.node();
    }

    /**
     * Remove any svg + placeholder this widget rendered earlier so redraw()
     * never stacks.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.msc-sankey-flow, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }
}
