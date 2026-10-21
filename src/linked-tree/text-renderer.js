/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { measureText } from "../chart/text/measure.js";

/**
 * @import Orientation from "../chart/orientation/orientation.js"
 * @import LinkedTreeSvg from "./svg.js"
 * @import ImageBox from "./box/image.js"
 * @import TextBox from "./box/text.js"
 */

/**
 * Shared state and text helpers of the renderers that place text elements next to the
 * image of a person box.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class TextRenderer {
    /**
     * Constructor.
     *
     * @param {LinkedTreeSvg} svg
     * @param {Orientation} orientation
     * @param {ImageBox}    image
     * @param {TextBox}     text
     */
    constructor(svg, orientation, image, text) {
        this._svg = svg;
        this._orientation = orientation;
        this._image = image;
        this._text = text;
    }

    /**
     * Returns the x position of a text element, shifted by the image width when the
     * descriptor reserves room for an image.
     *
     * @param {{withImage?: boolean}} d The element descriptor
     *
     * @return {number}
     *
     * @protected
     */
    textX(d) {
        const xPos = this._text.x + (d.withImage ? this._image.width : 0);

        // Reverse direction of text elements for RTL layouts
        return this._orientation.isDocumentRtl ? -xPos : xPos;
    }

    /**
     * Measures the given text and returns its width depending on the used font
     * (including size and weight).
     *
     * @param {string}        text
     * @param {string}        fontSize
     * @param {string|number} fontWeight
     *
     * @return {number}
     *
     * @protected
     */
    measureText(text, fontSize, fontWeight = 400) {
        const fontFamily = this._svg.style("font-family");

        return measureText(text, fontFamily, fontSize, fontWeight);
    }
}
