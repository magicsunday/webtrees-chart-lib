import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

import {
    createChartTooltip,
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

describe("createChartTooltip placement", () => {
    const VIEWPORT_WIDTH = 300;
    const VIEWPORT_HEIGHT = 200;
    const TOOLTIP_WIDTH = 100;
    const TOOLTIP_HEIGHT = 50;

    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    let tooltip;

    beforeEach(() => {
        document.body.innerHTML = "";
        window.innerWidth = VIEWPORT_WIDTH;
        window.innerHeight = VIEWPORT_HEIGHT;

        tooltip = createChartTooltip();
        // jsdom has no layout, so the measured size is fixed per test.
        jest.spyOn(tooltip.element, "getBoundingClientRect").mockReturnValue({
            width: TOOLTIP_WIDTH,
            height: TOOLTIP_HEIGHT,
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        window.innerWidth = originalInnerWidth;
        window.innerHeight = originalInnerHeight;
    });

    const placeAt = (clientX, clientY) => {
        tooltip.move({ clientX, clientY });

        return {
            left: Number.parseFloat(tooltip.element.style.left),
            top: Number.parseFloat(tooltip.element.style.top),
        };
    };

    test("prefers the spot right of and below the cursor", () => {
        expect(placeAt(20, 30)).toEqual({ left: 34, top: 44 });
    });

    test("flips to the left of the cursor when the right edge would overflow", () => {
        expect(placeAt(250, 30).left).toBe(250 - TOOLTIP_WIDTH - 14);
    });

    test("flips above the cursor when the bottom edge would overflow", () => {
        expect(placeAt(20, 180).top).toBe(180 - TOOLTIP_HEIGHT - 14);
    });

    test("keeps a tooltip that still fits unflipped right at the edge margin", () => {
        // At this x the right edge plus the margin equals the viewport width exactly, so it still fits.
        expect(placeAt(178, 30).left).toBe(192);
        expect(placeAt(179, 30).left).toBe(179 - TOOLTIP_WIDTH - 14);
    });

    test("keeps a tooltip that still fits below the cursor right at the edge margin", () => {
        // At this y the bottom edge plus the margin equals the viewport height exactly, so it still fits.
        expect(placeAt(20, 128).top).toBe(142);
        expect(placeAt(20, 129).top).toBe(129 - TOOLTIP_HEIGHT - 14);
    });

    test("clamps to the margin when the flipped position leaves the viewport", () => {
        window.innerWidth = 60;
        window.innerHeight = 40;

        expect(placeAt(5, 5)).toEqual({ left: 8, top: 8 });
    });
});

describe("createChartTooltip lifecycle", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    test("show fills the markup, makes the tooltip visible and positions it", () => {
        const tooltip = createChartTooltip();

        tooltip.show({ clientX: 20, clientY: 30 }, "<strong>Ann</strong>");

        expect(tooltip.element.innerHTML).toBe("<strong>Ann</strong>");
        expect(tooltip.element.classList.contains("is-visible")).toBe(true);
        expect(tooltip.element.style.left).toBe("34px");
        expect(tooltip.element.style.top).toBe("44px");
    });

    test("hide removes the visible class but keeps the element", () => {
        const tooltip = createChartTooltip();
        tooltip.show({ clientX: 0, clientY: 0 }, "x");

        tooltip.hide();

        expect(tooltip.element.classList.contains("is-visible")).toBe(false);
        expect(document.body.contains(tooltip.element)).toBe(true);
    });

    test("every chart shares one body-level element", () => {
        const first = createChartTooltip();
        const second = createChartTooltip();

        expect(second.element).toBe(first.element);
        expect(document.querySelectorAll(".msc-chart-tooltip")).toHaveLength(1);
    });

    test("an element nested deeper in the body is not reused", () => {
        const wrapper = document.createElement("div");
        const nested = document.createElement("div");
        nested.className = "msc-chart-tooltip";
        wrapper.appendChild(nested);
        document.body.appendChild(wrapper);

        const tooltip = createChartTooltip();

        expect(tooltip.element).not.toBe(nested);
        expect(tooltip.element.parentElement).toBe(document.body);
    });
});
