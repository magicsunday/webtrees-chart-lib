/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * The orientation base class. Subclasses pick a layout direction
 * (top-bottom, bottom-top, left-right, right-left) and decide which
 * axis is the spread axis (siblings) and which is the depth axis
 * (generations). All chart modules consuming d3.tree() share this
 * abstraction so layout-shape branching stays in one place.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 */
export default class Orientation {
    /**
     * @param {number} boxWidth  The width of a single individual box
     * @param {number} boxHeight The height of a single individual box
     */
    constructor(boxWidth, boxHeight) {
        this._xOffset = 30;
        this._yOffset = 40;

        this._boxWidth = boxWidth;
        this._boxHeight = boxHeight;
        this._splitNames = false;
    }

    /**
     * @returns {boolean}
     */
    get isDocumentRtl() {
        return document.dir === "rtl";
    }

    /**
     * @returns {number}
     */
    get xOffset() {
        return this._xOffset;
    }

    /**
     * @returns {number}
     */
    get yOffset() {
        return this._yOffset;
    }

    /**
     * @returns {boolean}
     */
    get splitNames() {
        return this._splitNames;
    }

    /**
     * @returns {number}
     */
    get boxWidth() {
        return this._boxWidth;
    }

    /**
     * @returns {number}
     */
    get boxHeight() {
        return this._boxHeight;
    }

    /**
     * @param {number} boxHeight
     */
    set boxHeight(boxHeight) {
        this._boxHeight = boxHeight;
    }

    /**
     * @returns {number}
     */
    get direction() {
        throw "Abstract method direction() not implemented";
    }

    /**
     * TRUE for layouts whose spread axis is X (top-bottom / bottom-top),
     * FALSE for layouts whose spread axis is Y (left-right / right-left).
     * Lets consumers branch on layout shape without instanceof chains.
     *
     * @returns {boolean}
     */
    get isVertical() {
        return false;
    }

    /**
     * @returns {number}
     */
    get nodeWidth() {
        throw "Abstract method nodeWidth() not implemented";
    }

    /**
     * @returns {number}
     */
    get nodeHeight() {
        throw "Abstract method nodeHeight() not implemented";
    }

    /**
     * Normalizes the x and/or y values of an entry.
     *
     * @param {object} _d
     */
    norm(_d) {
        throw "Abstract method norm() not implemented";
    }
}
