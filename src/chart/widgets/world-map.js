/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { extent } from "d3-array";
import { geoEquirectangular, geoPath } from "d3-geo";
import { scaleSequential } from "d3-scale";
import { interpolateBlues } from "d3-scale-chromatic";
import { select } from "d3-selection";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import BaseWidget from "./base-widget.js";

/**
 * D3-powered choropleth world map. Geojson is consumer-owned (not bundled).
 *
 * Data joins to features by case-insensitive ISO-3166-1 alpha-2, with the
 * row's countryCode trimmed before lookup so backend whitespace (NBSP,
 * leading/trailing spaces from CSV imports) does not silently drop rows.
 * Features without a matching row render with data-count="0" and a
 * neutral fill via the `--chart-empty-fill` CSS variable.
 *
 * Caller-overridable: projection (must implement d3-geo's fitSize) and
 * color scale (d3-scale-compatible). Bad geojson (missing FeatureCollection
 * type, non-object features, missing/non-string iso_a2) is filtered in
 * the constructor so render never aborts mid-flight after clearing target.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class WorldMap extends BaseWidget {
    /**
     * @param {string|HTMLElement} target
     * @param {{
     *     geojson: object,
     *     projection?: {fitSize: Function},
     *     colorScale?: (value: number) => string,
     *     emptyMessage?: string,
     *     width?: number,
     *     height?: number
     * }} options
     */
    constructor(target, options) {
        super(target, options);

        const geojson = this.options.geojson;
        if (geojson === null || typeof geojson !== "object") {
            throw new Error(`${this.constructor.name}: options.geojson is required`);
        }
        if (geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
            throw new Error(
                `${this.constructor.name}: options.geojson must be a GeoJSON FeatureCollection`,
            );
        }
        if (
            this.options.projection !== undefined &&
            typeof this.options.projection?.fitSize !== "function"
        ) {
            throw new Error(`${this.constructor.name}: options.projection must implement fitSize`);
        }

        const { width, height } = this.dimensions({ width: 640, height: 320 });
        this._width = width;
        this._height = height;
        this._geojson = {
            ...geojson,
            features: geojson.features.filter(
                (feature) => feature !== null && typeof feature === "object",
            ),
        };
    }

    /**
     * @param {Array<{countryCode: string, label?: string, count: number}>|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        const rows = sanitizeRows(data);
        if (rows.length === 0) {
            return this.renderEmptyState(
                typeof this.options.emptyMessage === "string"
                    ? this.options.emptyMessage
                    : "No data available",
            );
        }

        const byIso = new Map(rows.map((row) => [row.countryCode, row]));

        const projection = (this.options.projection ?? geoEquirectangular()).fitSize(
            [this._width, this._height],
            this._geojson,
        );
        const path = geoPath(projection);

        const colorDomain = extent(rows, (row) => row.count);
        const color =
            this.options.colorScale ??
            scaleSequential(interpolateBlues).domain(
                colorDomain[0] === colorDomain[1] ? [0, colorDomain[1] || 1] : colorDomain,
            );

        const svg = select(this.target)
            .append("svg")
            .attr("class", "world-map")
            .attr("width", this._width)
            .attr("height", this._height)
            .attr("viewBox", `0 0 ${this._width} ${this._height}`)
            .attr("style", "max-width: 100%; height: auto;");

        const countries = svg
            .append("g")
            .selectAll("path.country")
            .data(this._geojson.features)
            .join("path")
            .attr("class", "country")
            .attr("d", path)
            .attr("data-iso", (feature) => upperIso(feature))
            .attr("data-count", (feature) => String(byIso.get(upperIso(feature))?.count ?? 0));

        countries.each(function (feature) {
            const row = byIso.get(upperIso(feature));
            this.style.fill = row ? color(row.count) : "var(--chart-empty-fill, #eee)";
        });

        // Native <title> stays as the no-JS / accessibility fallback —
        // but only on countries that actually have data, so an empty
        // continent doesn't show a "Country: 0" browser tooltip on
        // every hover.
        countries
            .filter((feature) => byIso.get(upperIso(feature)) !== undefined)
            .append("title")
            .text((feature) => {
                const iso = upperIso(feature);
                const row = byIso.get(iso);
                const label = row?.label ?? feature.properties?.name ?? iso;
                const count = row?.count ?? 0;
                return `${label}: ${count.toLocaleString()}`;
            });

        const tooltip = createChartTooltip();

        const tooltipHtml = (feature, row) => {
            const iso = upperIso(feature);
            const label = row?.label ?? feature.properties?.name ?? iso;
            const count = row?.count ?? 0;
            return (
                `<strong>${escapeHtml(String(label))}</strong><br>` +
                `<span class="wt-chart-tooltip__stat">${count.toLocaleString()}</span>`
            );
        };

        countries
            .on("mouseover", (event, feature) => {
                const row = byIso.get(upperIso(feature));
                // Countries with no recorded data stay quiet — a tooltip
                // showing "0 individuals" reads as noise on a Mercator
                // covered in unused territories.
                if (row === undefined) {
                    return;
                }
                tooltip.show(event, tooltipHtml(feature, row));
            })
            .on("mousemove", (event, feature) => {
                if (byIso.get(upperIso(feature)) === undefined) {
                    return;
                }
                tooltip.move(event);
            })
            .on("mouseleave", () => tooltip.hide());

        return svg.node();
    }

    /**
     * Remove any svg and placeholder this widget rendered earlier so
     * redraw is idempotent in both directions.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.world-map, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }
}

/**
 * @param {unknown} data
 * @returns {Array<{countryCode: string, label?: string, count: number}>}
 */
function sanitizeRows(data) {
    if (!Array.isArray(data)) {
        return [];
    }
    const out = [];
    for (const row of data) {
        if (row === null || typeof row !== "object") {
            continue;
        }
        if (typeof row.countryCode !== "string") {
            continue;
        }
        const code = row.countryCode.trim().toUpperCase();
        if (code.length === 0) {
            continue;
        }
        out.push({
            ...row,
            countryCode: code,
            count: Number.isFinite(row.count) ? row.count : 0,
        });
    }
    return out;
}

/**
 * Safe ISO accessor — coerces non-string iso_a2 (numeric sentinel values
 * like -99 emitted by some Natural Earth converters, null/undefined
 * properties, or null feature itself) into an uppercase string.
 *
 * @param {unknown} feature
 * @returns {string}
 */
/**
 * Natural Earth ships a handful of features with `ISO_A2 = "-99"`
 * — France, Norway, Kosovo, N. Cyprus, Somaliland — because their
 * extended-hierarchy entries are split across multiple territories
 * and the public-domain dataset deliberately leaves the field
 * sentinel-valued. Fall back to the country name when the ISO field
 * is the "-99" sentinel so the choropleth still colours those
 * countries on a regular tree.
 */
const NAME_TO_ISO2_FALLBACK = {
    france: "FR",
    norway: "NO",
    kosovo: "XK",
    "n. cyprus": "CY",
    "northern cyprus": "CY",
    somaliland: "SO",
};

function upperIso(feature) {
    if (feature === null || typeof feature !== "object") {
        return "";
    }
    // Natural Earth GeoJSONs ship uppercase keys (`ISO_A2`, `ISO_A2_EH`),
    // hand-cleaned exports often switch to lowercase (`iso_a2`). Accept
    // whichever variant is present so the widget is compatible with the
    // common public GeoJSON sources without forcing the caller to
    // pre-transform their data.
    const props = feature.properties ?? {};
    const iso = props.iso_a2 ?? props.ISO_A2 ?? props.ISO_A2_EH ?? null;
    if (iso !== null && iso !== undefined && iso !== "-99") {
        return String(iso).toUpperCase();
    }

    // ISO sentinel — fall back to name lookup.
    const name = props.NAME ?? props.NAME_LONG ?? props.name ?? null;
    if (typeof name === "string") {
        const fallback = NAME_TO_ISO2_FALLBACK[name.toLowerCase()];
        if (fallback !== undefined) {
            return fallback;
        }
    }

    return "";
}
