/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { describe, expect, test } from "@jest/globals";
import { FACT_GLYPH_FALLBACK, FACT_GLYPHS, glyphForTag } from "src/linked-tree/fact-glyphs.js";

const TEXT_PRESENTATION = "︎";

describe("glyphForTag", () => {
    test("returns the curated glyph of a known tag", () => {
        expect(glyphForTag("BIRT")).toBe(`★${TEXT_PRESENTATION}`);
        expect(glyphForTag("DEAT")).toBe(`†${TEXT_PRESENTATION}`);
        expect(glyphForTag("OCCU")).toBe(`⚒${TEXT_PRESENTATION}`);
    });

    test("gives the alternative birth and death events the glyph of their kind", () => {
        expect(glyphForTag("CHR")).toBe(glyphForTag("BAPM"));
        expect(glyphForTag("BURI")).toBe(glyphForTag("CREM"));
    });

    test("falls back to the neutral glyph for a tag nobody curated", () => {
        expect(glyphForTag("_MILT")).toBe(FACT_GLYPH_FALLBACK);
    });

    test("does not mistake a property of the glyph map for a tag", () => {
        expect(glyphForTag("constructor")).toBe(FACT_GLYPH_FALLBACK);
        expect(glyphForTag("toString")).toBe(FACT_GLYPH_FALLBACK);
    });

    test("matches the tag exactly, as the resolver hands it over in upper case", () => {
        expect(glyphForTag("birt")).toBe(FACT_GLYPH_FALLBACK);
    });
});

describe("FACT_GLYPHS", () => {
    test("asks every glyph for the monochrome text presentation", () => {
        const glyphs = [...Object.values(FACT_GLYPHS), FACT_GLYPH_FALLBACK];

        for (const glyph of glyphs) {
            expect(glyph.endsWith(TEXT_PRESENTATION)).toBe(true);
            expect([...glyph]).toHaveLength(2);
        }
    });
});
