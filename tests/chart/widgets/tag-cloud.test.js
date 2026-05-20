import { afterEach, describe, expect, test } from "@jest/globals";

import TagCloud from "src/chart/widgets/tag-cloud.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = [
    { label: "Schmidt",  value: 18 },
    { label: "Müller",   value: 12 },
    { label: "Sonntag",  value: 4 },
];

const makeTarget = (id = "c") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("TagCloud — empty states", () => {
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new TagCloud("#c", {}).draw([]);
        expect(document.querySelector("#c > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#c .tag-cloud")).toBeNull();
    });

    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new TagCloud("#c", {}).draw(null);
        expect(document.querySelector("#c > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new TagCloud("#c", { emptyMessage: "kein Wert" }).draw([]);
        expect(document.querySelector("#c > .chart-empty-state").textContent)
            .toBe("kein Wert");
    });

    test("dataset of all-zero values renders empty-state", () => {
        makeTarget();
        new TagCloud("#c", {}).draw([
            { label: "A", value: 0 },
            { label: "B", value: 0 },
        ]);
        expect(document.querySelector("#c > .chart-empty-state")).not.toBeNull();
    });
});

describe("TagCloud — rendering", () => {
    test("renders one <span> per tag", () => {
        makeTarget();
        new TagCloud("#c", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#c .tag-cloud > span")).toHaveLength(3);
    });

    test("highest-value tag uses maxFont, lowest uses minFont", () => {
        makeTarget();
        new TagCloud("#c", { minFont: 10, maxFont: 40 }).draw(SAMPLE);
        const spans = Array.from(document.querySelectorAll("#c .tag-cloud > span"));
        expect(parseFloat(spans[0].style.fontSize)).toBe(40);
        expect(parseFloat(spans[spans.length - 1].style.fontSize)).toBe(10);
    });

    test("middle value lands proportionally between min and max", () => {
        makeTarget();
        new TagCloud("#c", { minFont: 10, maxFont: 40 }).draw([
            { label: "low",  value: 10 },
            { label: "mid",  value: 20 },
            { label: "high", value: 30 },
        ]);
        const mid = parseFloat(
            document.querySelectorAll("#c .tag-cloud > span")[1].style.fontSize,
        );
        expect(mid).toBe(25);
    });

    test("equal values render at maxFont", () => {
        makeTarget();
        new TagCloud("#c", { minFont: 10, maxFont: 40 }).draw([
            { label: "A", value: 5 },
            { label: "B", value: 5 },
        ]);
        const sizes = Array.from(
            document.querySelectorAll("#c .tag-cloud > span"),
        ).map((s) => parseFloat(s.style.fontSize));
        expect(sizes).toEqual([40, 40]);
    });

    test("uses default font range when options omit minFont/maxFont", () => {
        makeTarget();
        new TagCloud("#c", {}).draw(SAMPLE);
        const sizes = Array.from(
            document.querySelectorAll("#c .tag-cloud > span"),
        ).map((s) => parseFloat(s.style.fontSize));
        expect(sizes[0]).toBe(48);
        expect(sizes[sizes.length - 1]).toBe(10);
    });

    test("tag has native title with label and value", () => {
        makeTarget();
        new TagCloud("#c", {}).draw([{ label: "Schmidt", value: 18 }]);
        const span = document.querySelector("#c .tag-cloud > span");
        expect(span.getAttribute("title")).toBe("Schmidt: 18");
    });
});

describe("TagCloud — XSS + sanitization", () => {
    test("HTML in label is rendered as text, not parsed", () => {
        makeTarget();
        new TagCloud("#c", {}).draw([{ label: "<b>boom</b>", value: 5 }]);
        const span = document.querySelector("#c .tag-cloud > span");
        expect(span.textContent).toBe("<b>boom</b>");
        expect(span.querySelector("b")).toBeNull();
    });

    test("title attribute renders quotes literally (not breaking DOM)", () => {
        makeTarget();
        new TagCloud("#c", {}).draw([{ label: 'sten"or', value: 5 }]);
        expect(document.querySelector("#c .tag-cloud > span").getAttribute("title"))
            .toBe('sten"or: 5');
    });

    test("rows with null/undefined entries are skipped", () => {
        makeTarget();
        new TagCloud("#c", {}).draw([
            null,
            undefined,
            { label: "A", value: 5 },
        ]);
        expect(document.querySelectorAll("#c .tag-cloud > span")).toHaveLength(1);
    });

    test("non-finite values are coerced to 0 and dropped", () => {
        makeTarget();
        new TagCloud("#c", {}).draw([
            { label: "A", value: 5 },
            { label: "NaN",      value: Number.NaN },
            { label: "Infinity", value: Number.POSITIVE_INFINITY },
            { label: "string",   value: "5" },
        ]);
        expect(document.querySelectorAll("#c .tag-cloud > span")).toHaveLength(1);
    });

    test("missing label coerces to empty string", () => {
        makeTarget();
        new TagCloud("#c", {}).draw([{ value: 5 }]);
        expect(document.querySelector("#c .tag-cloud > span").textContent).toBe("");
    });
});

describe("TagCloud — redraw idempotence", () => {
    test("redraw replaces prior cloud, does not stack", () => {
        makeTarget();
        const w = new TagCloud("#c", {});
        w.draw(SAMPLE);
        w.draw([{ label: "Only", value: 5 }]);
        expect(document.querySelectorAll("#c .tag-cloud")).toHaveLength(1);
        expect(document.querySelectorAll("#c .tag-cloud > span")).toHaveLength(1);
    });

    test("redraw from data → empty replaces cloud with empty-state", () => {
        makeTarget();
        const w = new TagCloud("#c", {});
        w.draw(SAMPLE);
        w.draw([]);
        expect(document.querySelector("#c .tag-cloud")).toBeNull();
        expect(document.querySelector("#c > .chart-empty-state")).not.toBeNull();
    });

    test("redraw from empty → data replaces placeholder with cloud", () => {
        makeTarget();
        const w = new TagCloud("#c", {});
        w.draw([]);
        w.draw(SAMPLE);
        expect(document.querySelectorAll("#c > .chart-empty-state")).toHaveLength(0);
        expect(document.querySelectorAll("#c .tag-cloud")).toHaveLength(1);
    });
});

describe("TagCloud — option validation", () => {
    test("minFont > maxFont normalises to maxFont", () => {
        makeTarget();
        new TagCloud("#c", { minFont: 50, maxFont: 20 }).draw(SAMPLE);
        const sizes = Array.from(
            document.querySelectorAll("#c .tag-cloud > span"),
        ).map((s) => parseFloat(s.style.fontSize));
        for (const size of sizes) {
            expect(size).toBeGreaterThanOrEqual(20);
            expect(size).toBeLessThanOrEqual(50);
        }
    });

    test("non-finite min/maxFont fall back to defaults", () => {
        makeTarget();
        new TagCloud("#c", { minFont: Number.NaN, maxFont: "big" }).draw(SAMPLE);
        const sizes = Array.from(
            document.querySelectorAll("#c .tag-cloud > span"),
        ).map((s) => parseFloat(s.style.fontSize));
        expect(sizes[0]).toBe(48);
        expect(sizes[sizes.length - 1]).toBe(10);
    });
});
