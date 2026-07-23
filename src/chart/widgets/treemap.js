/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { select } from "d3-selection";
import { truncateToFit } from "../../text/truncate-name.js";
import { createChartTooltip, tooltipHeader, tooltipLines, tooltipStat } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    width: 720,
    height: 360,
};

/**
 * The hierarchy datum: the root carries `children`, each leaf the tile fields.
 * d3-hierarchy types the whole tree with one datum type, so every field is
 * optional here and the renderer guards them.
 *
 * @typedef {object} TreemapDatum
 * @property {Array<TreemapDatum>} [children] Child tiles (root only)
 * @property {number|string}       [rank]     Display rank ("…" for the rest tile)
 * @property {number}              [members]  Tile weight
 * @property {string}              [label]    Tile caption
 * @property {boolean}             [isRest]   Whether this is the aggregated rest tile
 */

/**
 * Treemap — a squarified treemap of weighted items. Each leaf's area is
 * proportional to its `members` weight; the tiles are tinted within a single
 * accent hue, the largest fully saturated and smaller ones mixed toward the
 * card background, so size reads twice (area AND colour). An optional "rest"
 * tile aggregates everything the caller capped off the long tail.
 *
 * The payload is domain-neutral: `items` is an ordered `[{rank, members,
 * label}]` list and `restMembers` is the summed weight of the omitted tail.
 * Units and the rest-tile caption come from options (`valueLabel`, `restLabel`)
 * so the consumer owns all translatable copy; the widget paints only geometry
 * and the accent.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class Treemap extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     width?: number,
     *     height?: number,
     *     accent?: string,
     *     valueLabel?: string,
     *     restLabel?: string,
     *     ariaLabel?: string,
     *     emptyMessage?: string
     * }} [options]
     */
    constructor(target, options) {
        super(target, options, { emptyMessage: "" });
        this.accent = this.options.accent;
        this.valueLabel = this.options.valueLabel;
        this.restLabel = this.options.restLabel;
    }

    /**
     * The unit appended to a tile's value in the tooltip (e.g. "persons").
     * Defaults to an empty string so the tooltip shows the bare count.
     *
     * @returns {string}
     */
    get valueLabel() {
        return this._valueLabel;
    }

    /**
     * @param {string|undefined} value A non-string value resets to an empty
     *   string. The runtime guard keeps the JSON dispatcher safe.
     */
    set valueLabel(value) {
        this._valueLabel = typeof value === "string" ? value : "";
    }

    /**
     * The caption for the aggregated "rest" tile. Defaults to "Rest" so a caller
     * that ships `restMembers` without a translated caption still labels it.
     *
     * @returns {string}
     */
    get restLabel() {
        return this._restLabel;
    }

    /**
     * @param {string|undefined} value A non-empty string sets the caption; any
     *   other value resets to the "Rest" default. The runtime guard keeps the
     *   JSON dispatcher safe.
     */
    set restLabel(value) {
        this._restLabel = typeof value === "string" && value !== "" ? value : "Rest";
    }

    /**
     * @param {{items: Array<{rank: number|string, members: number, label: string}>, restMembers?: number}|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearRoot("div.msc-treemap");

        const tiles = sanitize(data, this._restLabel);

        if (tiles.length === 0) {
            return this.renderEmptyState(this._emptyMessage);
        }

        const W = this._resolveWidth(DEFAULT_OPTIONS.width);
        const H = this._resolveHeight(DEFAULT_OPTIONS.height);

        const total = tiles.reduce((sum, tile) => sum + tile.members, 0);
        const largest = tiles.reduce((peak, tile) => Math.max(peak, tile.members), 0);

        const root = hierarchy(/** @type {TreemapDatum} */ ({ children: tiles }))
            .sum((node) => node.members ?? 0)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

        const layout = /** @type {import("d3-hierarchy").TreemapLayout<TreemapDatum>} */ (
            treemap().tile(treemapSquarify).size([W, H]).paddingInner(2).round(true)
        );
        const laidOut = layout(root);

        const wrapper = select(this.target).append("div").attr("class", "msc-treemap");

        const svg = wrapper
            .append("svg")
            .attr("class", "msc-treemap-svg")
            .attr("viewBox", `0 0 ${W} ${H}`)
            .attr("preserveAspectRatio", "none")
            .attr("role", "img")
            .attr("aria-label", this._ariaLabel === "" ? null : this._ariaLabel);

        const tooltip = createChartTooltip();

        const leaf = svg
            .selectAll("g.msc-treemap-tile")
            .data(laidOut.leaves())
            .enter()
            .append("g")
            .attr("class", "msc-treemap-tile")
            .attr("transform", (node) => `translate(${node.x0},${node.y0})`);

        leaf.append("rect")
            .attr("class", (node) =>
                node.data.isRest ? "msc-treemap-rect msc-treemap-rect--rest" : "msc-treemap-rect",
            )
            .attr("width", (node) => Math.max(0, node.x1 - node.x0))
            .attr("height", (node) => Math.max(0, node.y1 - node.y0))
            .attr("rx", 2)
            .style("fill", (node) => this._fill(node.data, largest))
            .on("mouseover", (event, node) => tooltip.show(event, this._tip(node.data, total)))
            .on("mousemove", (event) => tooltip.move(event))
            .on("mouseleave", () => tooltip.hide());

        this._renderLabels(leaf, largest, total);

        return wrapper.node();
    }

    /**
     * Tile fill: the rest tile takes a neutral border tone, a weighted tile is
     * mixed within the accent — fuller for larger members so area and colour
     * agree. Intensity is the square root of the relative weight so mid-sized
     * tiles stay legible rather than collapsing toward the background.
     *
     * @param {TreemapDatum} tile
     * @param {number}       largest
     * @returns {string}
     * @private
     */
    _fill(tile, largest) {
        if (tile.isRest === true) {
            return "var(--border-soft, #d8d8d8)";
        }

        const intensity = largest > 0 ? Math.sqrt((tile.members ?? 0) / largest) : 0;
        const mix = Math.round(intensity * 78 + 14);

        return `color-mix(in srgb, ${this._accent} ${mix}%, var(--card, #ffffff))`;
    }

    /**
     * Append the per-tile text at one of three density tiers, mirroring the
     * design: a big tile carries rank, label, value and share; a medium tile a
     * compact label and value; a small tile only the value.
     *
     * @param {import("d3-selection").Selection<SVGGElement, import("d3-hierarchy").HierarchyRectangularNode<TreemapDatum>, SVGSVGElement, unknown>} leaf
     * @param {number} largest
     * @param {number} total
     * @returns {void}
     * @private
     */
    _renderLabels(leaf, largest, total) {
        leaf.each((node, index, group) => {
            const cell = select(group[index]);
            const width = node.x1 - node.x0;
            const height = node.y1 - node.y0;
            const data = node.data;
            const members = data.members ?? 0;
            const label = data.label ?? "";
            const rank = data.rank ?? "";
            const intensity = largest > 0 ? Math.sqrt(members / largest) : 0;
            const onDark = data.isRest !== true && intensity > 0.5;
            const fg = onDark ? "msc-treemap-text--on-dark" : "";
            const share = total > 0 ? (members / total) * 100 : 0;

            if (width > 90 && height > 50) {
                cell.append("text")
                    .attr("class", `msc-treemap-rank ${fg}`)
                    .attr("x", 12)
                    .attr("y", 26)
                    .text(`#${rank}`);
                truncateToFit(
                    cell
                        .append("text")
                        .attr("class", `msc-treemap-label ${fg}`)
                        .attr("x", 12)
                        .attr("y", 50)
                        .text(label),
                    width - 24,
                );
                cell.append("text")
                    .attr("class", `msc-treemap-value ${fg}`)
                    .attr("x", 12)
                    .attr("y", 78)
                    .text(members.toLocaleString());
                cell.append("text")
                    .attr("class", `msc-treemap-pct ${fg}`)
                    .attr("x", 12)
                    .attr("y", 94)
                    .text(`${formatShare(share)}%`);

                return;
            }

            if (width > 54 && height > 32) {
                truncateToFit(
                    cell
                        .append("text")
                        .attr("class", `msc-treemap-label-sm ${fg}`)
                        .attr("x", 7)
                        .attr("y", 18)
                        .text(label),
                    width - 14,
                );
                cell.append("text")
                    .attr("class", `msc-treemap-value-sm ${fg}`)
                    .attr("x", 7)
                    .attr("y", 34)
                    .text(members.toLocaleString());

                return;
            }

            if (width > 22 && height > 14) {
                cell.append("text")
                    .attr("class", `msc-treemap-value-xs ${fg}`)
                    .attr("x", 4)
                    .attr("y", 12)
                    .text(members.toLocaleString());
            }
        });
    }

    /**
     * Tooltip markup for a tile: label, count (+ unit) and the share of the
     * whole.
     *
     * @param {TreemapDatum} tile
     * @param {number}       total
     * @returns {string}
     * @private
     */
    _tip(tile, total) {
        const members = tile.members ?? 0;
        const label = tile.label ?? "";
        const unit = this._valueLabel === "" ? "" : ` ${this._valueLabel}`;
        const share = total > 0 ? (members / total) * 100 : 0;

        return tooltipLines(
            tooltipHeader(label),
            tooltipStat(`${members.toLocaleString()}${unit} · ${formatShare(share)}%`),
        );
    }
}

/**
 * Validate + normalise the payload into a flat list of tiles, appending the
 * aggregated rest tile when `restMembers` is positive. Returns an empty array
 * when there is no usable item, so the caller renders the empty state. Items
 * with a non-positive member count are dropped.
 *
 * @param {{items: Array<{rank: number|string, members: number, label: string}>, restMembers?: number}|null|undefined} data
 * @param {string} restLabel
 * @returns {Array<{rank: number|string, members: number, label: string, isRest: boolean}>}
 */
function sanitize(data, restLabel) {
    if (data === null || typeof data !== "object") {
        return [];
    }

    const rawItems = Array.isArray(data.items) ? data.items : [];
    const tiles = [];

    for (const item of rawItems) {
        if (item === null || typeof item !== "object") {
            continue;
        }

        const members = Number(item.members);

        if (!Number.isFinite(members) || members <= 0) {
            continue;
        }

        tiles.push({
            rank: item.rank ?? "",
            members,
            label: typeof item.label === "string" ? item.label : "",
            isRest: false,
        });
    }

    const restMembers = Number(data.restMembers);

    if (Number.isFinite(restMembers) && restMembers > 0) {
        tiles.push({ rank: "…", members: restMembers, label: restLabel, isRest: true });
    }

    return tiles;
}

/**
 * Format a 0–100 share with one decimal, using a comma as the decimal mark to
 * match the locale of the surrounding copy.
 *
 * @param {number} share
 * @returns {string}
 */
function formatShare(share) {
    return share.toFixed(1).replace(".", ",");
}
