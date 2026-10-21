/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { afterEach, describe, expect, test } from "@jest/globals";
import ImageBox from "src/linked-tree/box/image.js";
import TextBox from "src/linked-tree/box/text.js";
import { LAYOUT_LEFTRIGHT, LAYOUT_TOPBOTTOM } from "src/linked-tree/constants.js";
import OrientationCollection from "src/linked-tree/orientation-collection.js";

const CORNER_RADIUS = 10;

afterEach(() => {
    document.dir = "";
});

const orientationOf = (key) => new OrientationCollection().get()[key];

describe("ImageBox", () => {
    test("sits at the top of the vertical box and centres on its width", () => {
        const image = new ImageBox(orientationOf(LAYOUT_TOPBOTTOM), CORNER_RADIUS);

        expect(image.width).toBe(80);
        expect(image.height).toBe(80);
        expect(image.x).toBe(-40);
        expect(image.y).toBe(-80);
        expect(image.rx).toBe(5);
        expect(image.ry).toBe(5);
    });

    test("sits at the leading edge of a horizontal box in a left-to-right document", () => {
        document.dir = "ltr";

        const image = new ImageBox(orientationOf(LAYOUT_LEFTRIGHT), CORNER_RADIUS);

        expect(image.x).toBe(-155);
        expect(image.y).toBe(-40);
    });

    test("mirrors the horizontal position in a right-to-left document", () => {
        document.dir = "rtl";

        const image = new ImageBox(orientationOf(LAYOUT_LEFTRIGHT), CORNER_RADIUS);

        expect(image.x).toBe(75);
        expect(image.y).toBe(-40);
    });
});

describe("TextBox", () => {
    test("starts below the image of a vertical box with the narrow padding", () => {
        const orientation = orientationOf(LAYOUT_TOPBOTTOM);
        const text = new TextBox(orientation, new ImageBox(orientation, CORNER_RADIUS));

        expect(text.x).toBe(-75);
        expect(text.y).toBe(30);
        expect(text.width).toBe(150);
    });

    test("runs beside the image of a horizontal box with the wide padding", () => {
        const orientation = orientationOf(LAYOUT_LEFTRIGHT);
        const text = new TextBox(orientation, new ImageBox(orientation, CORNER_RADIUS));

        expect(text.x).toBe(-147.5);
        expect(text.y).toBe(-15);
        expect(text.width).toBe(295);
    });
});
