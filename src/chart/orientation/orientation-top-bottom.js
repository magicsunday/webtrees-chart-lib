/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import Orientation from "./orientation.js";

export default class OrientationTopBottom extends Orientation {
    constructor(boxWidth, boxHeight) {
        super(boxWidth, boxHeight);
        this._splitNames = true;
    }

    get direction() {
        return 1;
    }

    get isVertical() {
        return true;
    }

    get nodeWidth() {
        return this._boxWidth + this._xOffset;
    }

    get nodeHeight() {
        return this._boxHeight + this._yOffset;
    }

    norm(d) {
        d.y *= this.direction;
    }
}
