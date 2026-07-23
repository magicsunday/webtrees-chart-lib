import { describe, expect, test } from "@jest/globals";

import {
    escapeHtml,
    tooltipHeader,
    tooltipLines,
    tooltipRow,
    tooltipStat,
    tooltipSub,
} from "src/chart/tooltip.js";

describe("tooltip formatters — escaping", () => {
    test("tooltipHeader wraps in <strong> and escapes the text", () => {
        expect(tooltipHeader("Ann <b>")).toBe("<strong>Ann &lt;b&gt;</strong>");
    });

    test("tooltipStat wraps in the __stat span and escapes", () => {
        expect(tooltipStat("<script>")).toBe(
            '<span class="msc-chart-tooltip__stat">&lt;script&gt;</span>',
        );
    });

    test("tooltipSub wraps in the __sub span and escapes", () => {
        expect(tooltipSub('P25 "x"')).toBe(
            '<span class="msc-chart-tooltip__sub">P25 &quot;x&quot;</span>',
        );
    });

    test("tooltipRow wraps in the __row span and escapes BOTH name and value", () => {
        expect(tooltipRow("A&B", "1<2")).toBe(
            '<span class="msc-chart-tooltip__row">A&amp;B: 1&lt;2</span>',
        );
    });

    test("a composite header built from raw parts escapes each part, separators pass through", () => {
        // Callers build `${source} ↔ ${target}` as ONE raw string; the arrows /
        // middots are not HTML-special, so whole-string escaping is equivalent
        // to the old per-part escaping.
        expect(tooltipHeader("a<x ↔ b>y")).toBe("<strong>a&lt;x ↔ b&gt;y</strong>");
    });
});

describe("tooltip formatters — tooltipLines joiner", () => {
    test("joins parts with <br>", () => {
        expect(tooltipLines(tooltipHeader("H"), tooltipStat("S"))).toBe(
            '<strong>H</strong><br><span class="msc-chart-tooltip__stat">S</span>',
        );
    });

    test("drops empty-string and null/undefined parts (a conditional sub/row contributes nothing)", () => {
        expect(tooltipLines(tooltipHeader("H"), "", null, undefined, tooltipStat("S"))).toBe(
            '<strong>H</strong><br><span class="msc-chart-tooltip__stat">S</span>',
        );
    });

    test("preserves caller order — sub before stat (month-radial) vs stat before sub (box-plot)", () => {
        const subFirst = tooltipLines(tooltipHeader("H"), tooltipSub("sub"), tooltipStat("stat"));
        const statFirst = tooltipLines(tooltipHeader("H"), tooltipStat("stat"), tooltipSub("sub"));
        expect(subFirst.indexOf("__sub")).toBeLessThan(subFirst.indexOf("__stat"));
        expect(statFirst.indexOf("__stat")).toBeLessThan(statFirst.indexOf("__sub"));
    });

    test("a header-only tooltip is just the escaped strong (no trailing <br>)", () => {
        expect(tooltipLines(tooltipHeader("only"))).toBe("<strong>only</strong>");
    });
});

describe("escapeHtml", () => {
    test("escapes all five HTML-special characters (incl. the single quote)", () => {
        // The formatters delegate to this; the single-quote → &#39; replacement
        // is otherwise unpinned, so a dropped replace would ship green.
        expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
    });

    test("coerces a non-string argument via String()", () => {
        expect(escapeHtml(1234)).toBe("1234");
    });
});
