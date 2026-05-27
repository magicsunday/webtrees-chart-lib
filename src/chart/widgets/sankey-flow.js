/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { easeCubicOut } from "d3-ease";
import { sankey, sankeyJustify, sankeyLinkHorizontal } from "d3-sankey";
import { scaleOrdinal } from "d3-scale";
import { schemeTableau10 } from "d3-scale-chromatic";
import { select } from "d3-selection";
import "d3-transition";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 320,
    margin: { top: 8, right: 130, bottom: 8, left: 130 },
    nodeWidth: 14,
    nodePad: 10,
};

/**
 * Sankey diagram for directed weighted flows between two columns of
 * nodes (e.g. birth-country → death-country migration). The caller
 * is responsible for delivering a DAG payload — d3-sankey throws
 * "circular link" otherwise. For bipartite use-cases where a node
 * could appear on both ends, the caller splits the node set so
 * source-side and target-side nodes occupy disjoint index ranges;
 * this widget caches the cycle-failure case and renders the empty
 * state rather than letting the throw take down the consumer.
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
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._height = pickPositive(this.options.height, DEFAULT_OPTIONS.height);
        this._margin = { ...DEFAULT_OPTIONS.margin, ...(this.options.margin ?? {}) };
        this._nodeWidth = pickPositive(this.options.nodeWidth, DEFAULT_OPTIONS.nodeWidth);
        this._nodePad = pickPositive(this.options.nodePad, DEFAULT_OPTIONS.nodePad);
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
            return this.renderEmptyState(this._emptyMessage());
        }

        const height = this._height;
        const margin = this._margin;
        const width = Math.max(
            360,
            pickPositive(this.options.width, this.target.clientWidth) || 900,
        );
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
            return this.renderEmptyState(this._emptyMessage());
        }

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-sankey")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Sankey flow");

        const linkPath = sankeyLinkHorizontal();

        const links = svg
            .append("g")
            .attr("class", "links")
            .selectAll("path.link")
            .data(graph.links)
            .enter()
            .append("path")
            .attr("class", "link")
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

        links
            .transition("sankey-enter")
            .duration(900)
            .delay((_, index) => index * 40)
            .ease(easeCubicOut)
            .attr("stroke-opacity", 0.45)
            .attr("stroke-width", (link) => Math.max(1, link.width));

        const i18n = this.options.i18n ?? {};
        const linkValueLabel = (count) => {
            const template =
                count === 1
                    ? (i18n.totalSingular ?? "{count} individual")
                    : (i18n.totalPlural ?? "{count} individuals");
            return template.replace("{count}", String(count));
        };

        links
            .on("mouseover", (event, link) => {
                const head =
                    `<strong>${escapeHtml(link.source.name)} → ${escapeHtml(link.target.name)}</strong><br>` +
                    `<span class="wt-chart-tooltip__stat">${escapeHtml(linkValueLabel(link.value))}</span>`;
                const samples = Array.isArray(link.samples) ? link.samples : [];
                const sampleList = samples
                    .filter((sample) => sample !== null && typeof sample === "object")
                    .map((sample) => escapeHtml(String(sample.name ?? "")))
                    .filter((name) => name !== "")
                    .join("<br>");
                const body = sampleList
                    ? `${head}<div class="wt-chart-tooltip__meta">${sampleList}</div>`
                    : head;
                tooltip.show(event, body);
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        // Click → toggle selection on a link. Predicate carries
        // both endpoints so the dashboard-bus consumer can derive
        // either a node filter or an edge filter.
        const self = this;
        links.style("cursor", "pointer").on("click", function onClick(_event, link) {
            const { predicate } = self._emitSelection({
                source: link.source.name,
                target: link.target.name,
            });
            self._applyLinkSelectionStyles(links, predicate);
        });

        const nodes = svg
            .append("g")
            .attr("class", "nodes")
            .selectAll("g.node")
            .data(graph.nodes)
            .enter()
            .append("g")
            .attr("class", "node");

        nodes
            .append("rect")
            .attr("x", (entry) => entry.x0)
            .attr("y", (entry) => entry.y0)
            .attr("width", (entry) => Math.max(0, entry.x1 - entry.x0))
            .attr("height", (entry) => Math.max(0, entry.y1 - entry.y0))
            .attr("fill", (entry) => colour(entry.name))
            .attr("opacity", 0)
            .transition("sankey-nodes")
            .duration(600)
            .delay(450)
            .ease(easeCubicOut)
            .attr("opacity", 0.9);

        nodes
            .append("text")
            .attr("class", "node-label")
            .attr("x", (entry) => (entry.x0 < width / 2 ? entry.x1 + 6 : entry.x0 - 6))
            .attr("y", (entry) => (entry.y0 + entry.y1) / 2)
            .attr("dominant-baseline", "middle")
            .attr("text-anchor", (entry) => (entry.x0 < width / 2 ? "start" : "end"))
            .attr("opacity", 0)
            .text((entry) => entry.name)
            .transition("sankey-labels")
            .duration(600)
            .delay(600)
            .ease(easeCubicOut)
            .attr("opacity", 1);

        return svg.node();
    }

    /**
     * Remove any svg + placeholder this widget rendered earlier so
     * redraw() never stacks.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-sankey, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }

    /**
     * Toggle the `.is-selected` class on whichever link matches
     * the current predicate's source/target pair; cleared
     * selection removes the class from every link. The widget
     * never sets inline stroke-opacity — dim is a host-stylesheet
     * concern via `:has(.is-selected) :not(.is-selected)` rules
     * mirroring the existing `:has(path.link:hover) path.link:not(:hover)`
     * hover-dim rule, so click + hover read identically.
     *
     * @param {import("d3-selection").Selection<SVGPathElement, {source: {name: string}, target: {name: string}}, SVGGElement, unknown>} links
     * @param {object|null} predicate
     */
    _applyLinkSelectionStyles(links, predicate) {
        if (predicate === null) {
            links.classed("is-selected", false);
            return;
        }
        // Visual dim of non-selected links is a host-stylesheet
        // concern via `:has(.is-selected) :not(.is-selected)`,
        // mirroring the existing `:has(path.link:hover) path.link:not(:hover)`
        // hover-dim rule.
        links.classed(
            "is-selected",
            (link) =>
                link.source.name === predicate.source && link.target.name === predicate.target,
        );
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
