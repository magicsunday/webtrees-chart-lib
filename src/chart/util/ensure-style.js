/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Adds rules to the head of the document as one style element that carries the attribute. Every
 * further call with the same attribute finds the element and adds nothing, and a document
 * without a head is left alone.
 *
 * @param {string} attribute The name of the attribute that marks the style element
 * @param {string} css       The rules of the style element
 *
 * @returns {void}
 */
export function ensureStyle(attribute, css) {
    const head = document.head;

    if (!head || head.querySelector(`style[${attribute}]`)) {
        return;
    }

    const style = document.createElement("style");
    style.setAttribute(attribute, "");
    style.textContent = css;
    head.appendChild(style);
}
