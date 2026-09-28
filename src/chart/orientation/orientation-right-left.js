/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import Orientation from "./orientation.js";

export default class OrientationRightLeft extends Orientation {
    /**
     * @param {number} boxWidth  The width of a single individual box
     * @param {number} boxHeight The height of a single individual box
     */
    constructor(boxWidth, boxHeight) {
        super(boxWidth, boxHeight);
        this._xOffset = 40;
        this._yOffset = 20;
    }

    /** @override */
    get direction() {
        return this.isDocumentRtl ? 1 : -1;
    }

    /** @override */
    get nodeWidth() {
        return this._boxHeight + this._yOffset;
    }

    /** @override */
    get nodeHeight() {
        return this._boxWidth + this._xOffset;
    }

    /**
     * @override
     * @param {{x: number, y: number}} d
     */
    norm(d) {
        [d.x, d.y] = [d.y * this.direction, d.x];
    }
}
