/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import Orientation from "./orientation.js";

export default class OrientationBottomTop extends Orientation {
    /**
     * @param {number} boxWidth  The width of a single individual box
     * @param {number} boxHeight The height of a single individual box
     */
    constructor(boxWidth, boxHeight) {
        super(boxWidth, boxHeight);
        this._splitNames = true;
    }

    /** @override */
    get direction() {
        return -1;
    }

    /** @override */
    get isVertical() {
        return true;
    }

    /** @override */
    get nodeWidth() {
        return this._boxWidth + this._xOffset;
    }

    /** @override */
    get nodeHeight() {
        return this._boxHeight + this._yOffset;
    }

    /**
     * @override
     * @param {{x: number, y: number}} d
     */
    norm(d) {
        d.y *= this.direction;
    }
}
