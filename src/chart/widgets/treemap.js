/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { hierarchy, treemap as d3Treemap, treemapSquarify } from "d3-hierarchy";
import { scaleOrdinal } from "d3-scale";
import { schemeTableau10 } from "d3-scale-chromatic";
import { select } from "d3-selection";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    height: 320,
    padding: 2,
    paddingTop: 18,
};

/**
 * Hierarchical proportional area chart. Each leaf tile's area is
 * proportional to its `value`; tiles within a parent share a
 * rectangle, and parent labels sit above their group via a
 * paddingTop reservation. Layout uses d3-hierarchy's
 * `treemapSquarify` so tiles approximate square aspect ratios,
 * which is what makes individual leaves readable across orders
 * of magnitude.
 *
 * Designed for two-level payloads — `{children: [{name, children:
 * [{name, value}, …]}, …]}` — but the underlying d3-hierarchy
 * accepts arbitrary depth. The widget paints leaves only; the
 * non-leaf parent group is communicated via the paddingTop label
 * strip and via the per-child `data-parent` attribute, so a
 * consumer building a drill-down can read it back from the DOM
 * without reconstructing the hierarchy.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class Treemap extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     height?: number,
     *     width?: number,
     *     padding?: number,
     *     paddingTop?: number,
     *     emptyMessage?: string,
     *     ariaLabel?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options);
        this._height = pickPositive(this.options.height, DEFAULT_OPTIONS.height);
        this._padding = pickNonNegative(this.options.padding, DEFAULT_OPTIONS.padding);
        this._paddingTop = pickNonNegative(this.options.paddingTop, DEFAULT_OPTIONS.paddingTop);
    }

    /**
     * @param {{
     *     name?: string,
     *     children?: Array<{
     *         name?: string,
     *         value?: number,
     *         class?: string,
     *         children?: Array<{name?: string, value?: number, class?: string}>
     *     }>
     * }|null|undefined} data
     *   Root with at least one level of `children`. Leaves carry
     *   `{name, value, class?}`. Parents carry `{name, children}`.
     *   `value` is summed up the tree by d3-hierarchy; non-finite
     *   or negative leaf values render as zero-area (effectively
     *   dropped).
     *
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        if (data === null || data === undefined || typeof data !== "object") {
            return this.renderEmptyState(this._emptyMessage());
        }

        const width = Math.max(
            240,
            pickPositive(this.options.width, this.target.clientWidth) || 600,
        );
        const height = this._height;

        const root = hierarchy(data)
            .sum((d) => {
                const value = Number(d?.value ?? 0);
                return Number.isFinite(value) && value > 0 ? value : 0;
            })
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

        if ((root.value ?? 0) === 0) {
            return this.renderEmptyState(this._emptyMessage());
        }

        d3Treemap()
            .size([width, height])
            .tile(treemapSquarify)
            .padding(this._padding)
            .paddingTop(this._paddingTop)
            .round(true)(root);

        const rootChildren = Array.isArray(root.children) ? root.children : [];
        const validRootChildren = rootChildren.filter(
            (node) => node !== null && typeof node === "object",
        );
        const leafColour = scaleOrdinal()
            .domain(validRootChildren.map((node) => String(node.data?.name ?? "")))
            .range(schemeTableau10);

        const tooltip = createChartTooltip();

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-treemap")
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("role", "img")
            .attr("aria-label", this.options.ariaLabel ?? "Treemap chart");

        // Parent group labels: one <text> per non-leaf at depth
        // 1, anchored top-left of the parent rectangle inside the
        // paddingTop strip.
        const parents = validRootChildren.filter(
            (node) => Array.isArray(node.children) && node.children.length > 0,
        );
        const parentGroup = svg.append("g").attr("class", "parents");
        for (const parent of parents) {
            const x0 = parent.x0 ?? 0;
            const y0 = parent.y0 ?? 0;
            parentGroup
                .append("text")
                .attr("class", "parent-label")
                .attr("x", x0 + 4)
                .attr("y", y0 + this._paddingTop - 6)
                .text(String(parent.data?.name ?? ""));
        }

        // Leaf tiles. Each leaf carries its parent's name on
        // `data-parent` so a downstream consumer can read the
        // hierarchy back without a second pass over the data.
        const leaves = root.leaves();
        const tiles = svg
            .append("g")
            .attr("class", "tiles")
            .selectAll("g.tile")
            .data(leaves)
            .enter()
            .append("g")
            .attr("class", (node) => {
                const cls = typeof node.data?.class === "string" ? node.data.class : "";
                return cls === "" ? "tile" : `tile ${cls}`;
            })
            .attr("data-parent", (node) => String(node.parent?.data?.name ?? ""));

        tiles
            .append("rect")
            .attr("class", "tile-rect")
            .attr("x", (node) => node.x0 ?? 0)
            .attr("y", (node) => node.y0 ?? 0)
            .attr("width", (node) => Math.max(0, (node.x1 ?? 0) - (node.x0 ?? 0)))
            .attr("height", (node) => Math.max(0, (node.y1 ?? 0) - (node.y0 ?? 0)))
            .attr("fill", (node) =>
                typeof node.data?.class === "string" && node.data.class !== ""
                    ? null
                    : leafColour(String(node.parent?.data?.name ?? "")),
            )
            .attr("tabindex", "0")
            .attr("aria-label", (node) => {
                const parentName = node.parent?.data?.name ? `${node.parent.data.name} / ` : "";
                return `${parentName}${node.data?.name ?? ""}: ${(node.value ?? 0).toLocaleString()}`;
            });

        // Leaf name label, anchored inside the tile when it fits.
        // Tiles too small to host a readable label drop the text
        // — d3-hierarchy leaves nothing visible at sub-12px sizes
        // anyway.
        tiles
            .append("text")
            .attr("class", "tile-label")
            .attr("x", (node) => (node.x0 ?? 0) + 4)
            .attr("y", (node) => (node.y0 ?? 0) + 14)
            .attr("dominant-baseline", "hanging")
            .each(function (node) {
                const w = (node.x1 ?? 0) - (node.x0 ?? 0);
                const h = (node.y1 ?? 0) - (node.y0 ?? 0);
                if (w < 40 || h < 18) {
                    select(this).remove();
                    return;
                }
                select(this).text(String(node.data?.name ?? ""));
            });

        tiles
            .on("mouseover", (event, node) => {
                const leafName = String(node.data?.name ?? "");
                const parentName = String(node.parent?.data?.name ?? "");
                const header = leafName === "" ? "" : `<strong>${escapeHtml(leafName)}</strong>`;
                const subline =
                    parentName === ""
                        ? ""
                        : `<br><span class="wt-chart-tooltip__sub">${escapeHtml(parentName)}</span>`;
                const tooltipBody = `${header}${subline}<br><span class="wt-chart-tooltip__stat">${escapeHtml((node.value ?? 0).toLocaleString())}</span>`;
                tooltip.show(event, tooltipBody);
            })
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

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
            ":scope > svg.wt-treemap, :scope > .chart-empty-state",
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
 * @param {number}  fallback
 *
 * @returns {number}
 */
function pickNonNegative(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
