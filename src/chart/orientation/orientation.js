/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * The orientation of a d3.tree() layout. It picks a layout direction (top-bottom,
 * bottom-top, left-right, right-left) and decides which axis is the spread axis
 * (siblings) and which is the depth axis (generations). All chart modules
 * consuming d3.tree() share this class so layout-shape branching stays in one
 * place.
 *
 * The four layouts differ by two flags only. `vertical` selects the spread axis,
 * `flip` selects the reverse direction along the depth axis (bottom-top,
 * right-left). The horizontal layouts additionally follow the direction of the
 * document, so a left-right layout reads from the right in a right-to-left page.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 */
export default class Orientation {
    /**
     * @param {number}                           boxWidth  The width of a single individual box
     * @param {number}                           boxHeight The height of a single individual box
     * @param {{vertical: boolean, flip: boolean}} layout
     *   `vertical` is TRUE for layouts whose spread axis is X (top-bottom,
     *   bottom-top) and FALSE for layouts whose spread axis is Y (left-right,
     *   right-left). `flip` is TRUE for the reverse direction (bottom-top,
     *   right-left).
     */
    constructor(boxWidth, boxHeight, { vertical, flip }) {
        this._vertical = vertical;
        this._flip = flip;

        this._xOffset = vertical ? 30 : 40;
        this._yOffset = vertical ? 40 : 20;

        this._boxWidth = boxWidth;
        this._boxHeight = boxHeight;
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
     * @returns {number}
     */
    get boxWidth() {
        return this._boxWidth;
    }

    /**
     * @param {number} boxWidth
     */
    set boxWidth(boxWidth) {
        this._boxWidth = boxWidth;
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
        if (this._vertical) {
            return this._flip ? -1 : 1;
        }

        return this.isDocumentRtl === this._flip ? 1 : -1;
    }

    /**
     * TRUE for layouts whose spread axis is X (top-bottom / bottom-top), FALSE
     * for layouts whose spread axis is Y (left-right / right-left). Lets
     * consumers branch on layout shape without instanceof chains.
     *
     * @returns {boolean}
     */
    get isVertical() {
        return this._vertical;
    }

    /**
     * @returns {number}
     */
    get nodeWidth() {
        return this._vertical ? this._boxWidth + this._xOffset : this._boxHeight + this._yOffset;
    }

    /**
     * @returns {number}
     */
    get nodeHeight() {
        return this._vertical ? this._boxHeight + this._yOffset : this._boxWidth + this._xOffset;
    }

    /**
     * Normalizes the x and/or y values of an entry.
     *
     * @param {{x: number, y: number}} d
     */
    norm(d) {
        if (this._vertical) {
            d.y *= this.direction;

            return;
        }

        [d.x, d.y] = [d.y * this.direction, d.x];
    }
}
