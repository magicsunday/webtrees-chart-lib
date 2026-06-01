/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { extent } from "d3-array";
import { geoEquirectangular, geoPath } from "d3-geo";
import { interpolateRgb } from "d3-interpolate";
import { scaleSequential } from "d3-scale";
import { interpolateBlues } from "d3-scale-chromatic";
import { select } from "d3-selection";

import { createChartTooltip, escapeHtml } from "../tooltip.js";
import { pickPositive } from "../util/coerce.js";
import BaseWidget from "./base-widget.js";

const DEFAULT_OPTIONS = {
    width: 640,
    height: 320,
};

/**
 * D3-powered choropleth map. Geojson is consumer-owned (not bundled).
 *
 * Each data row joins to a map feature by case-insensitive ISO-3166-1 alpha-2,
 * with the row's `code` trimmed before lookup so backend whitespace (NBSP,
 * leading/trailing spaces from CSV imports) does not silently drop rows.
 * Features without a matching row render with `data-count="0"` and a neutral
 * fill via the `--chart-empty-fill` CSS variable.
 *
 * Caller-overridable: projection (must implement d3-geo's fitSize) and colour
 * scale (d3-scale-compatible). Bad geojson (missing FeatureCollection type,
 * non-object features, missing/non-string iso_a2) is filtered in the
 * constructor so render never aborts mid-flight after clearing the target.
 *
 * The widget emits no selection event.
 *
 * Styling hooks (the consumer's stylesheet owns the `--chart-empty-fill` tint —
 * the widget fills matched features inline from the colour scale): the root is
 * `svg.wt-world-map` holding one `path.wt-world-map-region` per feature, each
 * carrying `data-iso` (the feature's resolved ISO code) and `data-count` (the
 * joined value, `0` when no row matched).
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
     *     projection?: ({fitSize: ((size: [number, number], object: object) => import("d3-geo").GeoProjection)})|undefined,
     *     colorScale?: ((value: number) => string)|undefined,
     *     accent?: string|undefined,
     *     emptyMessage?: string|undefined,
     *     width?: number|undefined,
     *     height?: number|undefined
     * }} options
     */
    constructor(target, options) {
        super(target, options);
        // Each config field is applied through its native setter so the
        // validation/normalisation lives in one place; the options object stays
        // the convenient bulk-init path and `widget.field = …` works afterwards.
        // `geojson` and `projection` are the exception: a map with no usable
        // geometry cannot render, so their setters throw rather than tolerantly
        // defaulting like the rest.
        this.geojson = this.options.geojson;
        this.projection = this.options.projection;
        this.colorScale = this.options.colorScale;
        this.accent = this.options.accent;
    }

    /**
     * The GeoJSON `FeatureCollection` whose features are rendered as choropleth
     * regions. Null and undefined features are filtered out so draw never aborts
     * mid-flight after clearing the target.
     *
     * @returns {object}
     */
    get geojson() {
        return this._geojson;
    }

    /**
     * @param {object|undefined} value The GeoJSON FeatureCollection. Unlike the
     *   other options this is REQUIRED and its setter THROWS — a map without
     *   geometry cannot render, so there is no sensible tolerant default. The
     *   throw is the documented exception to the tolerant-setter contract.
     *
     * @throws {Error} When the value is missing, not an object, or not a GeoJSON
     *   FeatureCollection with a features array.
     */
    set geojson(value) {
        if (value === null || typeof value !== "object") {
            throw new Error(`${this.constructor.name}: options.geojson is required`);
        }
        const collection = /** @type {{type?: unknown, features?: unknown}} */ (value);
        if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
            throw new Error(
                `${this.constructor.name}: options.geojson must be a GeoJSON FeatureCollection`,
            );
        }
        this._geojson = {
            ...value,
            features: collection.features.filter(
                (feature) => feature !== null && typeof feature === "object",
            ),
        };
    }

    /**
     * The d3-geo projection used to lay the features out, or `undefined` to use
     * the default equirectangular projection resolved at draw time.
     *
     * @returns {({fitSize: ((size: [number, number], object: object) => import("d3-geo").GeoProjection)})|undefined}
     */
    get projection() {
        return this._projection;
    }

    /**
     * @param {({fitSize: ((size: [number, number], object: object) => import("d3-geo").GeoProjection)})|undefined} value A d3-geo-style projection.
     *   A missing value clears the override so draw falls back to the default
     *   equirectangular projection. When present it MUST implement `fitSize` —
     *   the setter THROWS otherwise (a projection that cannot fit the geometry
     *   to the SVG extent cannot render the map).
     *
     * @throws {Error} When a non-undefined value does not implement `fitSize`.
     */
    set projection(value) {
        if (value !== undefined && typeof value?.fitSize !== "function") {
            throw new Error(`${this.constructor.name}: options.projection must implement fitSize`);
        }
        this._projection = value;
    }

    /**
     * The colour scale used to fill matched regions, or `undefined` to derive a
     * sequential scale from `accent` (or the default blues palette) at draw time.
     *
     * @returns {((value: number) => string)|undefined}
     */
    get colorScale() {
        return this._colorScale;
    }

    /**
     * @param {((value: number) => string)|undefined} value A function mapping a
     *   joined count to a CSS colour string; a non-function value clears the
     *   override so draw derives its own scale. The runtime guard keeps the JSON
     *   dispatcher (which assigns untyped values) safe.
     */
    set colorScale(value) {
        this._colorScale = typeof value === "function" ? value : undefined;
    }

    /**
     * The accent colour (a CSS colour or `var(--token)` string) used to build a
     * sequential scale when no explicit `colorScale` is supplied, or `undefined`
     * to fall back to the default blues palette.
     *
     * @returns {string|undefined}
     */
    get accent() {
        return this._accent;
    }

    /**
     * @param {string|undefined} value The accent colour; a missing or empty
     *   value clears the override so draw falls back to the default blues
     *   palette. The runtime guard keeps the JSON dispatcher safe.
     */
    set accent(value) {
        this._accent = typeof value === "string" && value !== "" ? value : undefined;
    }

    /**
     * @param {Array<{code: string, label?: string, count: number}>|null|undefined} data
     * @returns {SVGSVGElement|HTMLElement}
     */
    draw(data) {
        this._clearChart();

        // Unlike the other widgets, the map's geometry IS the
        // primary signal — readers expect to see the world even
        // when no records landed on it. Skip the empty-state
        // placeholder and render the map with every country on
        // `emptyFill` instead; that still distinguishes "no data
        // recorded" without hiding the chart.
        const rows = sanitizeRows(data);
        const byIso = new Map(rows.map((row) => [row.code, row]));

        const width = pickPositive(this._width, this.target.clientWidth) || DEFAULT_OPTIONS.width;
        const height =
            pickPositive(this._height, this.target.clientHeight) || DEFAULT_OPTIONS.height;

        const projection = (this._projection ?? geoEquirectangular()).fitSize(
            [width, height],
            this._geojson,
        );
        const path = geoPath(projection);

        const colorDomain = extent(rows, (row) => row.count);
        const domain = colorDomain[0] === colorDomain[1] ? [0, colorDomain[1] || 1] : colorDomain;
        let color = this._colorScale;
        if (color === undefined) {
            // `accent` overrides the default blues palette with a
            // host-supplied colour. The scale fades countries from a
            // pale paper-toned start to the full accent at the
            // domain's top end so the Places-tab map stays in sync
            // with the tab pill + progress-list bars (sage / slate /
            // wine) instead of always painting blue. Falls back to
            // the d3-blues palette when no accent is supplied.
            //
            // `var(--token)` strings are resolved against the chart
            // host's computed style before being handed to
            // `interpolateRgb` — d3-interpolate can't follow CSS
            // custom properties on its own.
            const accentRaw = this._accent ?? null;
            const accent = accentRaw === null ? null : resolveCssColor(this.target, accentRaw);
            if (accent === null) {
                color = scaleSequential(interpolateBlues).domain(domain);
            } else {
                // Start the scale at a pale-accent tint (15 % accent
                // over white) so even the lowest-count country reads
                // as the view's colour family rather than washed-out
                // white. The high end stays at the full accent.
                const palest = interpolateRgb("#ffffff", accent)(0.15);
                color = scaleSequential(interpolateRgb(palest, accent)).domain(domain);
            }
        }
        // Countries without any data stay on the neutral
        // `--chart-empty-fill` so the map still reads as "no record"
        // for those territories — the accent scale is reserved for
        // countries that contributed a count.
        const emptyFill = "var(--chart-empty-fill, #eee)";

        const svg = select(this.target)
            .append("svg")
            .attr("class", "wt-world-map")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("style", "max-width: 100%; height: auto;");

        const countries = svg
            .append("g")
            .selectAll("path.wt-world-map-region")
            .data(this._geojson.features)
            .join("path")
            .attr("class", "wt-world-map-region")
            .attr("d", path)
            .attr("data-iso", (feature) => upperIso(feature))
            .attr("data-count", (feature) => String(byIso.get(upperIso(feature))?.count ?? 0));

        countries.each(
            /** @this {SVGPathElement} */ function (feature) {
                const row = byIso.get(upperIso(feature));
                this.style.fill = row ? color(row.count) : emptyFill;
            },
        );

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
                // Features with no recorded data stay quiet — a tooltip
                // showing "0" reads as noise on a map covered in unused
                // territories.
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
     * Remove any svg and placeholder this widget rendered earlier so redraw is
     * idempotent in both directions.
     *
     * @returns {void}
     */
    _clearChart() {
        for (const node of this.target.querySelectorAll(
            ":scope > svg.wt-world-map, :scope > .chart-empty-state",
        )) {
            node.remove();
        }
    }
}

/**
 * @param {unknown} data
 * @returns {Array<{code: string, label?: string, count: number}>}
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
        if (typeof row.code !== "string") {
            continue;
        }
        const code = row.code.trim().toUpperCase();
        if (code.length === 0) {
            continue;
        }
        out.push({
            ...row,
            code,
            count: Number.isFinite(row.count) ? row.count : 0,
        });
    }
    return out;
}

/**
 * Natural Earth ships a handful of features with `ISO_A2 = "-99"` — France,
 * Norway, Kosovo, N. Cyprus, Somaliland — because their extended-hierarchy
 * entries are split across multiple territories and the public-domain dataset
 * deliberately leaves the field sentinel-valued. Fall back to the country name
 * when the ISO field is the "-99" sentinel so the choropleth still colours
 * those countries on a regular tree.
 */
const NAME_TO_ISO2_FALLBACK = {
    france: "FR",
    norway: "NO",
    kosovo: "XK",
    "n. cyprus": "CY",
    "northern cyprus": "CY",
    somaliland: "SO",
};

/**
 * Resolve a CSS colour string against the host element's computed style so
 * d3-interpolate sees a concrete hex / rgb() value. Accepts either
 * `var(--token)` (extracted via getPropertyValue) or any plain CSS colour
 * (returned as-is). Falls back to the input when the lookup yields an empty
 * string (the host element isn't in the live DOM yet during unit-test
 * snapshots).
 *
 * @param {HTMLElement} host
 * @param {string} value
 * @returns {string}
 */
function resolveCssColor(host, value) {
    const trimmed = value.trim();
    const match = /^var\(\s*(--[^,\s)]+)/.exec(trimmed);
    if (match === null) {
        return trimmed;
    }
    if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
        return trimmed;
    }
    const resolved = window.getComputedStyle(host).getPropertyValue(match[1]).trim();
    return resolved === "" ? trimmed : resolved;
}

/**
 * Safe ISO accessor — coerces non-string iso_a2 (numeric sentinel values like
 * -99 emitted by some Natural Earth converters, null/undefined properties, or
 * null feature itself) into an uppercase string.
 *
 * @param {unknown} feature
 * @returns {string}
 */
function upperIso(feature) {
    if (feature === null || typeof feature !== "object") {
        return "";
    }
    // Natural Earth GeoJSONs ship uppercase keys (`ISO_A2`, `ISO_A2_EH`),
    // hand-cleaned exports often switch to lowercase (`iso_a2`). Accept
    // whichever variant is present so the widget is compatible with the
    // common public GeoJSON sources without forcing the caller to
    // pre-transform their data.
    const feat = /** @type {{properties?: Record<string, unknown>}} */ (feature);
    const props = feat.properties ?? /** @type {Record<string, unknown>} */ ({});
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
