/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * @typedef {Object} LabelElementData
 * @property {string}  label       Display text for this name part.
 * @property {boolean} isPreferred Whether this is the preferred given name.
 * @property {boolean} isLastName  Whether this is a last/family name.
 * @property {boolean} [isNameRtl] Whether this name part is right-to-left.
 */

/**
 * Abbreviation strategy: shrink given (first) names first when the line is
 * too narrow, leaving the surname intact as long as possible. Western
 * default — names are addressed by surname so that part stays readable.
 *
 * @type {string}
 */
export const ABBREV_GIVEN = "GIVEN";

/**
 * Abbreviation strategy: shrink surnames first, leaving given names intact.
 * Used in cultures where the given name carries the primary identity (e.g.
 * Iceland, where surnames are typically patronymics and people are
 * addressed by their given name).
 *
 * @type {string}
 */
export const ABBREV_SURNAME = "SURNAME";

const ELLIPSIS = "…";

const isGivenNameNonPreferred = (name) => name.isPreferred === false && name.isLastName === false;
const isGivenNamePreferred = (name) => name.isPreferred === true;
const isSurname = (name) => name.isLastName === true;

/**
 * Pass order per strategy. Each pass walks the name list right-to-left and
 * abbreviates one category to its first letter (e.g. "Maria" -> "M.")
 * until the joined string fits the available width or the pass exhausts.
 */
const PASS_ORDER = {
    [ABBREV_GIVEN]: [isGivenNameNonPreferred, isGivenNamePreferred, isSurname],
    [ABBREV_SURNAME]: [isSurname, isGivenNameNonPreferred, isGivenNamePreferred],
};

/**
 * Reduces name parts to initial-letter abbreviations until the joined
 * string fits within `availableWidth`. Strategy controls which category
 * shrinks first.
 *
 * Optional `dropEmptyBracketed` skips first-letter truncation for entries
 * wrapped in parentheses (e.g. a married-name suffix `"(Müller)"`) and
 * removes them entirely instead — `"(."` would render meaningless. Use
 * when parenthesised name parts are supplementary metadata, not primary
 * identifiers.
 *
 * @param {LabelElementData[]} names                       Name parts to truncate (caller-owned, not mutated)
 * @param {number}             availableWidth              Maximum pixel width for the joined string
 * @param {(text: string) => number} measureFn             Returns rendered width of a text string
 * @param {Object}             [options]
 * @param {string}             [options.strategy]          {@link ABBREV_GIVEN} (default) or {@link ABBREV_SURNAME}
 * @param {boolean}            [options.dropEmptyBracketed] If true, parenthesised entries are dropped entirely instead of shrunk to "(."
 *
 * @returns {LabelElementData[]} Possibly-shrunk copies; entries with empty
 *                               labels are filtered out so the renderer
 *                               does not emit empty tspans.
 */
export function truncateNames(names, availableWidth, measureFn, options = {}) {
    const strategy = options.strategy ?? ABBREV_GIVEN;
    const dropEmptyBracketed = options.dropEmptyBracketed === true;

    const passes = PASS_ORDER[strategy] ?? PASS_ORDER[ABBREV_GIVEN];

    // Shallow clone — all LabelElementData fields are primitives, so a spread
    // copy is safe and avoids mutating the caller's data.
    const workNames = names.map((name) => ({ ...name }));

    // Helper rebuilds the string we measure against. Empty labels (left
    // behind by dropEmptyBracketed) are filtered out so they do not
    // contribute spurious spaces to the width measurement.
    const joinedText = () =>
        workNames
            .map((item) => item.label)
            .filter((label) => label !== "")
            .join(" ");

    let text = joinedText();

    if (measureFn(text) <= availableWidth) {
        return workNames;
    }

    const abbreviate = (predicate) => {
        for (let i = workNames.length - 1; i >= 0; i--) {
            const name = workNames[i];

            if (!predicate(name) || measureFn(text) <= availableWidth) {
                continue;
            }

            if (dropEmptyBracketed && name.label.startsWith("(") && name.label.endsWith(")")) {
                name.label = "";
            } else {
                name.label = `${name.label.slice(0, 1)}.`;
            }

            text = joinedText();
        }
    };

    for (const predicate of passes) {
        abbreviate(predicate);
    }

    return workNames.filter((name) => name.label !== "");
}

/**
 * Progressively removes trailing characters from the text content of a
 * tspan element until the rendered width fits within `maxWidth`, then
 * appends an ellipsis. If the text already fits, returns it unchanged.
 *
 * Note: the appended ellipsis character is not included in the width
 * check, so the final rendered text may slightly exceed `maxWidth`. Call
 * sites typically subtract padding before passing `maxWidth`, which
 * absorbs the extra ellipsis width.
 *
 * @param {Object} tspan    D3 selection of a `<tspan>` element
 * @param {number} maxWidth Maximum allowed rendered width in pixels
 *
 * @returns {string} The final (possibly truncated) text
 */
export function truncateToFit(tspan, maxWidth) {
    let text = tspan.text();
    const originalText = text;

    while (tspan.node().getComputedTextLength() > maxWidth && text.length > 1) {
        text = text.slice(0, -1).trim();
        tspan.text(text);
    }

    if (text !== originalText || tspan.node().getComputedTextLength() > maxWidth) {
        // Single character still too wide — give up, render nothing.
        if (tspan.node().getComputedTextLength() > maxWidth) {
            text = "";
        }

        // Avoid trailing ".…" which reads as a typo.
        if (text.endsWith(".")) {
            text = text.slice(0, -1).trim();
        }

        text += ELLIPSIS;
        tspan.text(text);
    }

    return text;
}
