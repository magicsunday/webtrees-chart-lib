/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import PngChartExport from "./export/PngChartExport.js";
import SvgChartExport from "./export/SvgChartExport.js";

/**
 * Instantiates the correct export handler (PNG or SVG) for a given type string.
 * New export formats can be added by extending EXPORT_TYPES without modifying
 * call sites.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class ChartExportFactory {
    /**
     * Registry mapping type strings to their export handler constructors.
     *
     * @type {Object<string, Function>}
     */
    static EXPORT_TYPES = {
        png: PngChartExport,
        svg: SvgChartExport,
    };

    /**
     * Creates an export instance for the given type.
     *
     * @param {string} type The export type ("png" or "svg")
     *
     * @return {PngChartExport|SvgChartExport}
     * @throws {Error} When the type is not registered in EXPORT_TYPES
     */
    createExport(type) {
        const ExportClass = ChartExportFactory.EXPORT_TYPES[type];

        if (!ExportClass) {
            throw new Error(`Unknown export type: ${type}`);
        }

        return new ExportClass();
    }
}
