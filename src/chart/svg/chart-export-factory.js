/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import PngChartExport from "./export/png-chart-export.js";
import SvgChartExport from "./export/svg-chart-export.js";

/**
 * @typedef {new (options?: {minimumSize?: [number, number]}) => PngChartExport | SvgChartExport} ExportConstructor
 */

/**
 * Export handler constructors by type string.
 *
 * @type {Map<string, ExportConstructor>}
 */
const EXPORT_TYPES = new Map(
    /** @type {Array<[string, ExportConstructor]>} */ ([
        ["png", PngChartExport],
        ["svg", SvgChartExport],
    ]),
);

/**
 * Creates the export handler (PNG or SVG) for a given type string.
 *
 * @param {string} type The export type ("png" or "svg")
 * @param {{minimumSize?: [number, number]}} [options] Handed to the export
 *   handler. Only the PNG export reads it, `minimumSize` lowers its smallest
 *   canvas from A3 at 300 DPI.
 *
 * @return {PngChartExport|SvgChartExport}
 * @throws {Error} When the type is not a known export type
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default function createChartExport(type, options = {}) {
    const ExportClass = EXPORT_TYPES.get(type);

    if (!ExportClass) {
        throw new Error(`Unknown export type: ${type}`);
    }

    return new ExportClass(options);
}
