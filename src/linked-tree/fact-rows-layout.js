/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Width of the glyph column in front of every fact row. The value column starts one column
 * width away from the edge of the rows, so glyphs and values read as a two-column table.
 *
 * @type {number}
 * @const
 */
export const FACT_GLYPH_COLUMN_WIDTH = 18;

/**
 * Distance between the birth row and the death row when each of them carries a place row.
 *
 * @type {number}
 * @const
 */
export const FACT_PAIR_OFFSET = 32;

/**
 * Distance of a place row below the date row it belongs to.
 *
 * @type {number}
 * @const
 */
export const FACT_PLACE_OFFSET = 14;

/**
 * Distance between the birth row and the death row when the places are off and each of them
 * is a single row.
 *
 * @type {number}
 * @const
 */
export const FACT_COMPACT_PAIR_OFFSET = 18;

/**
 * Gap between the birth and death block and the optional rows below it.
 *
 * @type {number}
 * @const
 */
export const FACT_BLOCK_GAP = 24;

/**
 * Distance between two optional rows.
 *
 * @type {number}
 * @const
 */
export const FACT_OPTIONAL_ROW_HEIGHT = 16;

/**
 * Returns the distance from the first date row to the last row of the birth and death block,
 * for the worst case of a person that has both.
 *
 * @param {boolean} showPlaces Whether the place rows are shown
 *
 * @return {number}
 */
export function factVitalExtent(showPlaces) {
    return showPlaces ? FACT_PAIR_OFFSET + FACT_PLACE_OFFSET : FACT_COMPACT_PAIR_OFFSET;
}

/**
 * Returns the distance from the first date row to the first optional row.
 *
 * @param {boolean} showPlaces Whether the place rows are shown
 *
 * @return {number}
 */
export function factOptionalOffset(showPlaces) {
    return factVitalExtent(showPlaces) + FACT_BLOCK_GAP;
}

/**
 * Returns the distance from the first date row to the last row of the box in the worst case,
 * so a consumer can size the box for the rows its fullest person needs.
 *
 * @param {{showPlaces: boolean, optionalRows: number}} layout The place switch and the number
 *                                                             of optional rows of the chart
 *
 * @return {number}
 */
export function factRowsExtent({ showPlaces, optionalRows }) {
    if (optionalRows < 1) {
        return factVitalExtent(showPlaces);
    }

    return factOptionalOffset(showPlaces) + (optionalRows - 1) * FACT_OPTIONAL_ROW_HEIGHT;
}
