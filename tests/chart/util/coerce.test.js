import { describe, expect, test } from "@jest/globals";

import { pickFraction, pickPositive, sanitizeLabelValueRows } from "src/chart/util/coerce.js";

describe("pickPositive", () => {
    test("returns a finite positive number unchanged", () => {
        expect(pickPositive(42, 10)).toBe(42);
    });

    test.each([
        ["zero", 0],
        ["negative", -5],
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["string", "20"],
        ["null", null],
        ["undefined", undefined],
    ])("falls back for %s", (_label, input) => {
        expect(pickPositive(input, 10)).toBe(10);
    });
});

describe("pickFraction", () => {
    test("returns an in-range fraction unchanged", () => {
        expect(pickFraction(0.4, 0.1)).toBe(0.4);
    });

    test("clamps negatives to 0", () => {
        expect(pickFraction(-0.2, 0.1)).toBe(0);
    });

    test("clamps above the default 0.95 ceiling", () => {
        expect(pickFraction(2, 0.1)).toBe(0.95);
    });

    test("honours a custom max ceiling", () => {
        expect(pickFraction(0.8, 0.1, 0.5)).toBe(0.5);
        expect(pickFraction(0.3, 0.1, 0.5)).toBe(0.3);
    });

    test.each([
        ["NaN", Number.NaN],
        ["string", "0.5"],
        ["null", null],
    ])("falls back to the default for %s", (_label, input) => {
        expect(pickFraction(input, 0.25)).toBe(0.25);
    });
});

describe("sanitizeLabelValueRows", () => {
    test.each([
        ["null", null],
        ["undefined", undefined],
        ["a non-array", { label: "x", value: 1 }],
    ])("returns [] for %s", (_label, input) => {
        expect(sanitizeLabelValueRows(input)).toEqual([]);
    });

    test("keeps well-formed rows in order", () => {
        const rows = [
            { label: "A", value: 3 },
            { label: "B", value: 1 },
        ];
        expect(sanitizeLabelValueRows(rows)).toEqual(rows);
    });

    test("drops non-object rows, empty labels and non-finite values", () => {
        const out = sanitizeLabelValueRows([
            null,
            "nope",
            { label: "", value: 5 },
            { label: "ok", value: Number.NaN },
            { label: "keep", value: 7 },
        ]);
        expect(out).toEqual([{ label: "keep", value: 7 }]);
    });

    test("coerces a non-string label and a numeric-string value", () => {
        expect(sanitizeLabelValueRows([{ label: 1900, value: "12" }])).toEqual([
            { label: "1900", value: 12 },
        ]);
    });

    test("keeps zero values by default but drops negatives", () => {
        const out = sanitizeLabelValueRows([
            { label: "zero", value: 0 },
            { label: "neg", value: -1 },
        ]);
        expect(out).toEqual([{ label: "zero", value: 0 }]);
    });

    test("dropZero removes exactly-zero rows", () => {
        const out = sanitizeLabelValueRows([{ label: "zero", value: 0 }], { dropZero: true });
        expect(out).toEqual([]);
    });

    test("drops rows whose label is null or absent (coerced to empty)", () => {
        // Exercises the `String(row.label ?? "")` nullish fallback → "" → dropped.
        expect(sanitizeLabelValueRows([{ value: 5 }, { label: null, value: 6 }])).toEqual([]);
    });

    test("carries a non-empty string sub through untouched", () => {
        expect(
            sanitizeLabelValueRows([{ label: "Aries", value: 3, sub: "21 Mar – 20 Apr" }]),
        ).toEqual([{ label: "Aries", value: 3, sub: "21 Mar – 20 Apr" }]);
    });

    test("omits an empty or non-string sub, leaving a bare label/value row", () => {
        expect(
            sanitizeLabelValueRows([
                { label: "A", value: 1, sub: "" },
                { label: "B", value: 2, sub: 42 },
            ]),
        ).toEqual([
            { label: "A", value: 1 },
            { label: "B", value: 2 },
        ]);
    });

    test("carries a non-empty string tooltipValue through untouched", () => {
        expect(
            sanitizeLabelValueRows([{ label: "Aries", value: 81, tooltipValue: "81 persons" }]),
        ).toEqual([{ label: "Aries", value: 81, tooltipValue: "81 persons" }]);
    });

    test("omits an empty or non-string tooltipValue", () => {
        expect(
            sanitizeLabelValueRows([
                { label: "A", value: 1, tooltipValue: "" },
                { label: "B", value: 2, tooltipValue: 9 },
            ]),
        ).toEqual([
            { label: "A", value: 1 },
            { label: "B", value: 2 },
        ]);
    });
});
