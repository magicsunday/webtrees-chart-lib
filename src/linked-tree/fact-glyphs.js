/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Variation selector that asks the browser for the monochrome text presentation of a glyph.
 * Some fonts default to a colour emoji for codepoints like the star or the pencil, which
 * would ignore the colour the glyph column is drawn in.
 *
 * @type {string}
 * @const
 */
const TEXT_PRESENTATION = "︎";

/**
 * The glyph of each fact tag that has a curated one, as single codepoints in the monochrome
 * text presentation. The alternative birth and death events share the glyph of their kind.
 *
 * @type {Readonly<Record<string, string>>}
 * @const
 */
export const FACT_GLYPHS = Object.freeze({
    BIRT: `★${TEXT_PRESENTATION}`,
    CHR: `✝${TEXT_PRESENTATION}`,
    BAPM: `✝${TEXT_PRESENTATION}`,
    DEAT: `†${TEXT_PRESENTATION}`,
    BURI: `⚱${TEXT_PRESENTATION}`,
    CREM: `⚱${TEXT_PRESENTATION}`,
    MARR: `⚭${TEXT_PRESENTATION}`,
    OCCU: `⚒${TEXT_PRESENTATION}`,
    EDUC: `✎${TEXT_PRESENTATION}`,
    RESI: `⌂${TEXT_PRESENTATION}`,
    RELI: `☩${TEXT_PRESENTATION}`,
    CENS: `☷${TEXT_PRESENTATION}`,
    NOTE: `¶${TEXT_PRESENTATION}`,
    WILL: `⚖${TEXT_PRESENTATION}`,
});

/**
 * The glyph of every tag without a curated one, for example a custom tag an administrator
 * added to the facts of the chart box.
 *
 * @type {string}
 * @const
 */
export const FACT_GLYPH_FALLBACK = `▸${TEXT_PRESENTATION}`;

/**
 * The glyphs by tag in a map, so a tag never matches a property of the plain object.
 *
 * @type {ReadonlyMap<string, string>}
 * @const
 */
const GLYPHS_BY_TAG = new Map(Object.entries(FACT_GLYPHS));

/**
 * Returns the glyph for a fact tag. The tag is matched exactly, as the module base hands it
 * over in upper case.
 *
 * @param {string} tag The GEDCOM tag, for example "BIRT" or "OCCU"
 *
 * @return {string}
 */
export function glyphForTag(tag) {
    return GLYPHS_BY_TAG.get(tag) ?? FACT_GLYPH_FALLBACK;
}
