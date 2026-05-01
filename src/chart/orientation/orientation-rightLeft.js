/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import Orientation from "./orientation.js";

export default class OrientationRightLeft extends Orientation {
    constructor(boxWidth, boxHeight) {
        super(boxWidth, boxHeight);
        this._xOffset = 40;
        this._yOffset = 20;
    }

    get direction() {
        return this.isDocumentRtl ? 1 : -1;
    }

    get nodeWidth() {
        return this._boxHeight + this._yOffset;
    }

    get nodeHeight() {
        return this._boxWidth + this._xOffset;
    }

    norm(d) {
        // Swap x and y values
        [d.x, d.y] = [d.y * this.direction, d.x];
    }
}
