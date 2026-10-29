/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { ensureStyle } from "./util/ensure-style.js";

/**
 * Marks the style element that carries the rules of the help popover.
 *
 * @type {string}
 */
export const HELP_POPOVER_STYLE_ATTRIBUTE = "data-webtrees-help-popover-style";

/**
 * The rules of the help popover, scoped to the class that its markup carries. Both widths are
 * bound by the viewport, so the popover never reaches past the edge of a narrow screen.
 *
 * @type {string}
 */
export const HELP_POPOVER_CSS = `.help-popover {
    min-width: min(400px, calc(100vw - 2rem));
    max-width: calc(100vw - 2rem);
    z-index: 1000;
}
`;

/**
 * Adds the rules of the help popover to the head of the document as one style element. Every
 * further call finds the element and adds nothing, and a document without a head is left alone.
 *
 * @returns {void}
 */
export function ensureHelpPopoverStyle() {
    ensureStyle(HELP_POPOVER_STYLE_ATTRIBUTE, HELP_POPOVER_CSS);
}
