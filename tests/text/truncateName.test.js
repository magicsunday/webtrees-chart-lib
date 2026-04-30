import { describe, expect, test } from "@jest/globals";
import { ABBREV_GIVEN, ABBREV_SURNAME, truncateNames } from "src/text/truncateName.js";

/**
 * Synthetic measureFn: each character costs `charWidth` pixels regardless
 * of letter. Lets the tests control "what fits" deterministically without
 * a DOM, since chart-lib's real measurement uses canvas which jsdom does
 * not implement.
 */
const charWidth = 10;
const measureFn = (text) => text.length * charWidth;

const labelsOf = (names) => names.map((n) => n.label);

describe("truncateNames — fits already", () => {
    test("returns input unchanged when the joined string fits", () => {
        const names = [
            { label: "Maria", isPreferred: true, isLastName: false },
            { label: "Müller", isPreferred: false, isLastName: true },
        ];

        const result = truncateNames(names, 10_000, measureFn);

        expect(labelsOf(result)).toEqual(["Maria", "Müller"]);
    });

    test("returns empty array unchanged for empty input", () => {
        expect(truncateNames([], 10, measureFn)).toEqual([]);
    });

    test("is idempotent on already-abbreviated input", () => {
        const names = [
            { label: "M.", isPreferred: true, isLastName: false },
            { label: "M.", isPreferred: false, isLastName: true },
        ];

        // Joined "M. M." = 5 chars * 10 = 50, allow 30 → algorithm has
        // nowhere to shrink further; both labels stay as "M.", not "M..".
        const result = truncateNames(names, 30, measureFn);

        expect(labelsOf(result)).toEqual(["M.", "M."]);
    });
});

describe("truncateNames — GIVEN strategy (default)", () => {
    test("truncates non-preferred given names first, surnames last", () => {
        const names = [
            { label: "Anna", isPreferred: false, isLastName: false },
            { label: "Maria", isPreferred: true, isLastName: false },
            { label: "Müller", isPreferred: false, isLastName: true },
        ];

        // "Anna Maria Müller" = 17 chars * 10 = 170. Allow 160 — only the
        // non-preferred "Anna" needs to shrink. "A. Maria Müller" = 15 chars
        // = 150 ≤ 160 → preferred and surname stay full.
        const result = truncateNames(names, 160, measureFn);

        expect(labelsOf(result)).toEqual(["A.", "Maria", "Müller"]);
    });

    test("falls back to truncating surname when given-name shrinks are not enough", () => {
        const names = [
            { label: "Maria", isPreferred: true, isLastName: false },
            { label: "Müller", isPreferred: false, isLastName: true },
        ];

        // "Maria Müller" = 12 * 10 = 120. Allow 30 — both must shrink.
        const result = truncateNames(names, 30, measureFn, { strategy: ABBREV_GIVEN });

        expect(labelsOf(result)).toEqual(["M.", "M."]);
    });
});

describe("truncateNames — SURNAME strategy", () => {
    test("truncates surnames first, given names intact", () => {
        const names = [
            { label: "Jón", isPreferred: true, isLastName: false },
            { label: "Sigurðsson", isPreferred: false, isLastName: true },
        ];

        // "Jón Sigurðsson" = 14 * 10 = 140. Allow 70 — surname must shrink
        // first, given name stays full. "Jón S." = 6 chars.
        const result = truncateNames(names, 70, measureFn, { strategy: ABBREV_SURNAME });

        expect(labelsOf(result)).toEqual(["Jón", "S."]);
    });

    test("only shrinks given names after surname is already abbreviated", () => {
        const names = [
            { label: "Anna", isPreferred: false, isLastName: false },
            { label: "Jón", isPreferred: true, isLastName: false },
            { label: "Sigurðsson", isPreferred: false, isLastName: true },
        ];

        // "Anna Jón Sigurðsson" = 19 * 10 = 190. Allow 90 — surname shrinks
        // first ("Anna Jón S." = 11), still over 90, then non-preferred
        // "Anna" -> "A." => "A. Jón S." = 9 chars => fits at 90.
        const result = truncateNames(names, 90, measureFn, { strategy: ABBREV_SURNAME });

        expect(labelsOf(result)).toEqual(["A.", "Jón", "S."]);
    });

    test("preserves preferred given name even at minimal width", () => {
        const names = [
            { label: "Anna", isPreferred: false, isLastName: false },
            { label: "Jón", isPreferred: true, isLastName: false },
            { label: "Sigurðsson", isPreferred: false, isLastName: true },
        ];

        // Tight allowance forces the worst case: surname, non-preferred,
        // and finally preferred all shrink to first letter.
        const result = truncateNames(names, 30, measureFn, { strategy: ABBREV_SURNAME });

        expect(labelsOf(result)).toEqual(["A.", "J.", "S."]);
    });
});

describe("truncateNames — dropEmptyBracketed", () => {
    test("drops parenthesised entries instead of shrinking to '(.'", () => {
        const names = [
            { label: "Maria", isPreferred: true, isLastName: false },
            { label: "Müller", isPreferred: false, isLastName: true },
            { label: "(Schmidt)", isPreferred: false, isLastName: true },
        ];

        // Force surname truncation. With dropEmptyBracketed the suffix
        // disappears entirely; "Müller" then truncates to "M.".
        const result = truncateNames(names, 30, measureFn, {
            dropEmptyBracketed: true,
        });

        expect(labelsOf(result)).toEqual(["M.", "M."]);
    });

    test("keeps parenthesised entries when dropEmptyBracketed is off", () => {
        const names = [
            { label: "Müller", isPreferred: false, isLastName: true },
            { label: "(Schmidt)", isPreferred: false, isLastName: true },
        ];

        const result = truncateNames(names, 30, measureFn);

        // Both are surnames in default-GIVEN strategy: surname pass shrinks
        // both, including the bracketed one to "(."
        expect(labelsOf(result)).toEqual(["M.", "(."]);
    });
});

describe("truncateNames — does not mutate caller", () => {
    test("input array entries are not modified", () => {
        const names = [
            { label: "Maria", isPreferred: true, isLastName: false },
            { label: "Müller", isPreferred: false, isLastName: true },
        ];
        const snapshot = JSON.parse(JSON.stringify(names));

        truncateNames(names, 30, measureFn);

        expect(names).toEqual(snapshot);
    });
});

describe("truncateNames — invalid strategy", () => {
    test("falls back to GIVEN for unknown strategy", () => {
        const names = [
            { label: "Maria", isPreferred: true, isLastName: false },
            { label: "Müller", isPreferred: false, isLastName: true },
        ];

        const result = truncateNames(names, 100, measureFn, { strategy: "BOGUS" });

        // 100 leaves room for "M. Müller" (9*10=90) so under GIVEN-fallback
        // only the preferred given name shrinks; surname stays intact.
        expect(labelsOf(result)).toEqual(["M.", "Müller"]);
    });
});
