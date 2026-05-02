/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

let measureCanvas = null;

/**
 * Returns the rendered pixel width of text using a lazily-created off-screen
 * canvas. The canvas is reused across calls; the font property is only updated
 * when it changes to avoid unnecessary state mutations.
 *
 * @param {string} text       The text to measure
 * @param {string} fontFamily CSS font-family string
 * @param {string} fontSize   CSS font-size string (e.g. "14px")
 * @param {number} fontWeight CSS font-weight (default 400)
 *
 * @return {number} Width of the text in pixels
 */
export function measureText(text, fontFamily, fontSize, fontWeight = 400) {
    // Re-create the canvas when it belongs to a stale document realm (e.g.
    // after the host page navigates within a single-page-app shell, or the
    // chart is re-rendered into a different iframe). A canvas attached to a
    // detached document still measures, but its font metrics may diverge.
    if (measureCanvas === null || measureCanvas.ownerDocument !== document) {
        measureCanvas = document.createElement("canvas");
    }

    const context = measureCanvas.getContext("2d");
    const font = `${fontWeight || ""} ${fontSize} ${fontFamily}`;

    if (context.font !== font) {
        context.font = font;
    }

    return context.measureText(text).width;
}
