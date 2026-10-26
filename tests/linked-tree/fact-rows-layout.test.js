/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { describe, expect, test } from "@jest/globals";
import {
    FACT_BLOCK_GAP,
    FACT_COMPACT_PAIR_OFFSET,
    FACT_OPTIONAL_ROW_HEIGHT,
    FACT_PAIR_OFFSET,
    FACT_PLACE_OFFSET,
    factOptionalOffset,
    factRowsExtent,
    factVitalExtent,
} from "src/linked-tree/fact-rows-layout.js";

describe("factVitalExtent", () => {
    test("spans from the first date to the last place when places are shown", () => {
        expect(factVitalExtent(true)).toBe(FACT_PAIR_OFFSET + FACT_PLACE_OFFSET);
    });

    test("spans from the first date to the second date when places are off", () => {
        expect(factVitalExtent(false)).toBe(FACT_COMPACT_PAIR_OFFSET);
    });
});

describe("factOptionalOffset", () => {
    test("starts the optional rows one gap below the vital block", () => {
        expect(factOptionalOffset(true)).toBe(factVitalExtent(true) + FACT_BLOCK_GAP);
        expect(factOptionalOffset(false)).toBe(factVitalExtent(false) + FACT_BLOCK_GAP);
    });
});

describe("factRowsExtent", () => {
    test("is the vital block alone when the chart has no optional row", () => {
        expect(factRowsExtent({ showPlaces: true, optionalRows: 0 })).toBe(46);
        expect(factRowsExtent({ showPlaces: false, optionalRows: 0 })).toBe(18);
    });

    test("adds the gap and the rows below the first one when optional rows exist", () => {
        expect(factRowsExtent({ showPlaces: false, optionalRows: 1 })).toBe(18 + FACT_BLOCK_GAP);
        expect(factRowsExtent({ showPlaces: true, optionalRows: 3 })).toBe(
            46 + FACT_BLOCK_GAP + 2 * FACT_OPTIONAL_ROW_HEIGHT,
        );
    });

    test("grows by one row height for every further optional row", () => {
        const two = factRowsExtent({ showPlaces: true, optionalRows: 2 });
        const three = factRowsExtent({ showPlaces: true, optionalRows: 3 });

        expect(three - two).toBe(FACT_OPTIONAL_ROW_HEIGHT);
    });
});
