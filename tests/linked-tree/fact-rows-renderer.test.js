/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { select } from "d3-selection";

const CHAR_WIDTH = 10;
const measureTextMock = jest.fn((text) => text.length * CHAR_WIDTH);

jest.unstable_mockModule("src/chart/text/measure.js", () => ({
    measureText: measureTextMock,
}));

const { default: TextRenderer } = await import("src/linked-tree/text-renderer.js");
const { default: FactRowsRenderer } = await import("src/linked-tree/fact-rows-renderer.js");
const { glyphForTag } = await import("src/linked-tree/fact-glyphs.js");

const FIRST_ROW_Y = 100;
const IMAGE_WIDTH = 80;
const TEXT_X = -30;
const TEXT_WIDTH = 300;
const GLYPH_COLUMN = 18;

/**
 * Builds a fact view the way the module base hands it over.
 */
const fact = (tag, { label = tag, date = "", place = "", value = "" } = {}) => ({
    tag,
    label,
    date,
    place,
    placeFull: place,
    value,
});

/**
 * Renders the fact rows of one person box and returns the attached svg group.
 */
const render = ({
    facts,
    vertical = true,
    showPlaces = true,
    showOptionalRows = true,
    isDocumentRtl = false,
    thumbnail = "",
    textX = TEXT_X,
}) => {
    const renderer = new FactRowsRenderer(
        { style: jest.fn(() => "Arial") },
        { isVertical: vertical, isDocumentRtl },
        { width: IMAGE_WIDTH },
        { x: textX, y: 20, width: TEXT_WIDTH },
    );

    const parent = select(document.body)
        .append("svg")
        .append("g")
        .datum({ data: { data: { facts, thumbnail } } });

    renderer.appendFacts(parent, { firstRowY: FIRST_ROW_Y, showPlaces, showOptionalRows });

    return parent;
};

const rows = (parent, selector) =>
    parent
        .selectAll(selector)
        .nodes()
        .map((node) => ({
            text: node.textContent.replace(node.querySelector("title")?.textContent ?? "", ""),
            title: node.querySelector("title")?.textContent ?? null,
            x: Number(node.getAttribute("x")),
            y: Number(node.getAttribute("y")),
            anchor: node.getAttribute("text-anchor"),
        }));

afterEach(() => {
    document.body.innerHTML = "";
});

describe("FactRowsRenderer", () => {
    test("shares the text helpers of the other renderers", () => {
        expect(Object.getPrototypeOf(FactRowsRenderer)).toBe(TextRenderer);
    });

    describe("vital rows in a vertical layout with places", () => {
        const facts = [
            fact("BIRT", { label: "Birth", date: "12.05.1832", place: "Berlin" }),
            fact("DEAT", { label: "Death", date: "1890", place: "Paris" }),
        ];

        test("puts a glyph column left of the date and the place under the date", () => {
            const parent = render({ facts });
            const left = -TEXT_WIDTH / 2;

            expect(rows(parent, "text.fact-glyph")).toEqual([
                expect.objectContaining({
                    text: glyphForTag("BIRT"),
                    x: left + GLYPH_COLUMN / 2,
                    y: FIRST_ROW_Y,
                    anchor: "middle",
                }),
                expect.objectContaining({
                    text: glyphForTag("DEAT"),
                    x: left + GLYPH_COLUMN / 2,
                    y: FIRST_ROW_Y + 32,
                }),
            ]);

            expect(rows(parent, "text.fact-date")).toEqual([
                expect.objectContaining({
                    text: "12.05.1832",
                    x: left + GLYPH_COLUMN,
                    y: FIRST_ROW_Y,
                    anchor: "start",
                }),
                expect.objectContaining({ text: "1890", y: FIRST_ROW_Y + 32 }),
            ]);

            expect(rows(parent, "text.fact-place")).toEqual([
                expect.objectContaining({
                    text: "Berlin",
                    x: left + GLYPH_COLUMN,
                    y: FIRST_ROW_Y + 14,
                }),
                expect.objectContaining({ text: "Paris", y: FIRST_ROW_Y + 32 + 14 }),
            ]);
        });

        test("names label, date and place in the tooltip of a date row", () => {
            const parent = render({ facts });

            expect(rows(parent, "text.fact-date")[0].title).toBe("Birth · 12.05.1832 · Berlin");
        });

        test("draws the glyph of the tag that was found, not of the slot", () => {
            const parent = render({ facts: [fact("CHR", { date: "1832" }), null] });

            expect(rows(parent, "text.fact-glyph")[0].text).toBe(glyphForTag("CHR"));
        });

        test("shows an ellipsis for a fact that has no date", () => {
            const parent = render({ facts: [fact("BIRT", { place: "Berlin" }), null] });

            expect(rows(parent, "text.fact-date")[0].text).toBe("…");
        });

        test("leaves out the place row of a fact without a place", () => {
            const parent = render({ facts: [fact("BIRT", { date: "1832" }), null] });

            expect(rows(parent, "text.fact-place")).toEqual([]);
        });

        test("packs the rows when a slot is empty", () => {
            const parent = render({ facts: [null, fact("DEAT", { date: "1890" })] });

            expect(rows(parent, "text.fact-date")).toEqual([
                expect.objectContaining({ text: "1890", y: FIRST_ROW_Y }),
            ]);
        });
    });

    describe("vital rows in a vertical layout of a right-to-left document", () => {
        test("puts the glyph column on the side the text starts on", () => {
            const parent = render({
                isDocumentRtl: true,
                facts: [fact("BIRT", { date: "1832" }), null],
            });
            const right = TEXT_WIDTH / 2;

            expect(rows(parent, "text.fact-glyph")[0].x).toBe(right - GLYPH_COLUMN / 2);
            expect(rows(parent, "text.fact-date")[0].x).toBe(right - GLYPH_COLUMN);
        });
    });

    describe("vital rows in a vertical layout without places", () => {
        test("centres the dates without a glyph column and closes the gap to 18", () => {
            const parent = render({
                showPlaces: false,
                facts: [
                    fact("BIRT", { date: "12.05.1832", place: "Berlin" }),
                    fact("DEAT", { date: "1890" }),
                ],
            });

            expect(rows(parent, "text.fact-glyph")).toEqual([]);
            expect(rows(parent, "text.fact-place")).toEqual([]);
            expect(rows(parent, "text.fact-date")).toEqual([
                expect.objectContaining({
                    text: "12.05.1832",
                    x: 0,
                    y: FIRST_ROW_Y,
                    anchor: "middle",
                }),
                expect.objectContaining({ text: "1890", x: 0, y: FIRST_ROW_Y + 18 }),
            ]);
        });
    });

    describe("optional rows", () => {
        const facts = [
            fact("BIRT", { date: "1832" }),
            fact("DEAT", { date: "1890" }),
            fact("OCCU", { label: "Occupation", value: "Smith", place: "Berlin", date: "1850" }),
            null,
            fact("RESI", { place: "Paris", date: "1860" }),
            fact("EDUC", { date: "1845" }),
        ];

        test("start one gap below the vital block and pack without a hole", () => {
            const parent = render({ facts });
            const base = FIRST_ROW_Y + 46 + 24;

            expect(rows(parent, "text.fact-optional").map(({ y }) => y)).toEqual([
                base,
                base + 16,
                base + 32,
            ]);
        });

        test("start closer to the vital block when places are off", () => {
            const parent = render({ facts, showPlaces: false });

            expect(rows(parent, "text.fact-optional")[0].y).toBe(FIRST_ROW_Y + 18 + 24);
        });

        test("show the value first, then the place, then the date", () => {
            const parent = render({ facts });

            expect(rows(parent, "text.fact-optional").map(({ text }) => text)).toEqual([
                "Smith",
                "Paris",
                "1845",
            ]);
        });

        test("carry a glyph of their own tag, aligned with the vital glyphs", () => {
            const parent = render({ facts });
            const glyphs = rows(parent, "text.fact-glyph");

            expect(glyphs.slice(2).map(({ text }) => text)).toEqual([
                glyphForTag("OCCU"),
                glyphForTag("RESI"),
                glyphForTag("EDUC"),
            ]);
            expect(new Set(glyphs.map(({ x }) => x))).toEqual(new Set([-150 + GLYPH_COLUMN / 2]));
        });

        test("name every part of the fact in the tooltip", () => {
            const parent = render({ facts });

            expect(rows(parent, "text.fact-optional")[0].title).toBe(
                "Occupation · 1850 · Berlin · Smith",
            );
        });

        test("are left out when the chart does not show them", () => {
            const parent = render({ facts, showOptionalRows: false });

            expect(rows(parent, "text.fact-optional")).toEqual([]);
            expect(rows(parent, "text.fact-date")).toHaveLength(2);
        });

        test("use the glyph column even when the dates of a vertical box are centred", () => {
            const parent = render({ facts, showPlaces: false });

            expect(rows(parent, "text.fact-glyph")).toHaveLength(3);
        });
    });

    describe("a person box without facts", () => {
        test("draws nothing for a person that has no facts payload", () => {
            const parent = render({ facts: undefined });

            expect(parent.selectAll("text").size()).toBe(0);
        });

        test("draws nothing for a list of empty slots", () => {
            const parent = render({ facts: [null, null, null] });

            expect(parent.selectAll("text").size()).toBe(0);
        });
    });

    describe("in a horizontal layout", () => {
        const facts = [fact("BIRT", { date: "1832", place: "Berlin" }), null];

        test("starts at the text column and moves right of the image when there is one", () => {
            const noImage = render({ facts, vertical: false });
            const withImage = render({ facts, vertical: false, thumbnail: "x.png" });

            expect(rows(noImage, "text.fact-date")[0].x).toBe(TEXT_X + GLYPH_COLUMN);
            expect(rows(withImage, "text.fact-date")[0].x).toBe(
                TEXT_X + IMAGE_WIDTH + GLYPH_COLUMN,
            );
        });

        test("keeps the dates in a glyph column even without places", () => {
            const parent = render({ facts, vertical: false, showPlaces: false });

            expect(rows(parent, "text.fact-glyph")).toHaveLength(1);
            expect(rows(parent, "text.fact-date")[0].anchor).toBe("start");
        });

        test("mirrors the column for a right-to-left document", () => {
            const parent = render({ facts, vertical: false, isDocumentRtl: true });
            const startX = -TEXT_X;

            expect(rows(parent, "text.fact-glyph")[0].x).toBe(startX - GLYPH_COLUMN / 2);
            expect(rows(parent, "text.fact-date")[0].x).toBe(startX - GLYPH_COLUMN);
            expect(rows(parent, "text.fact-place")[0].x).toBe(startX - GLYPH_COLUMN);
        });
    });

    describe("truncation", () => {
        const longPlace = "Charlottenburg, Berlin, Brandenburg, Germany";

        test("cuts a vertical row that is wider than the box and reserves room for the ellipsis", () => {
            const parent = render({
                facts: [fact("BIRT", { date: "1832", place: longPlace }), null],
            });
            const [place] = rows(parent, "text.fact-place");
            const available = TEXT_WIDTH - GLYPH_COLUMN;

            expect(place.text.endsWith("…")).toBe(true);
            expect(place.text.length * CHAR_WIDTH).toBeLessThanOrEqual(available);
            expect(place.title).toBe(longPlace);
        });

        test("keeps a row that fits as it is", () => {
            const parent = render({
                facts: [fact("BIRT", { date: "1832", place: "Berlin" }), null],
            });

            expect(rows(parent, "text.fact-place")[0].text).toBe("Berlin");
        });

        test("measures a horizontal row from its own start to the far edge of the column", () => {
            const parent = render({
                facts: [fact("BIRT", { date: "1832", place: longPlace }), null],
                vertical: false,
                thumbnail: "x.png",
            });
            const [place] = rows(parent, "text.fact-place");
            const available = TEXT_X + TEXT_WIDTH - (TEXT_X + IMAGE_WIDTH) - GLYPH_COLUMN;

            expect(place.text.length * CHAR_WIDTH).toBeLessThanOrEqual(available);
        });

        test("measures a right-to-left row towards the opposite edge", () => {
            const parent = render({
                facts: [fact("BIRT", { date: "1832", place: longPlace }), null],
                vertical: false,
                isDocumentRtl: true,
            });
            const [place] = rows(parent, "text.fact-place");
            const available = -TEXT_X + (TEXT_X + TEXT_WIDTH) - GLYPH_COLUMN;

            expect(place.text.length * CHAR_WIDTH).toBeLessThanOrEqual(available);
            expect(place.text.length * CHAR_WIDTH).toBeGreaterThan(available - 2 * CHAR_WIDTH);
        });

        test("drops a trailing full stop in front of the ellipsis", () => {
            // The cut falls right behind the full stop: room for 27 characters.
            const place = `${"A".repeat(26)}.${"B".repeat(15)}`;
            const parent = render({ facts: [fact("BIRT", { date: "1832", place }), null] });

            expect(rows(parent, "text.fact-place")[0].text).toBe(`${"A".repeat(26)}…`);
        });
    });
});
