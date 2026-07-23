import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import MonthRadial from "src/chart/widgets/month-radial.js";

beforeEach(() => {
    // jsdom never lays out SVG text, so getComputedTextLength is absent. A 0
    // stub keeps the centre-caption truncation a no-op (captions render
    // verbatim, no <title>); the truncation tests override it to force a
    // measured width.
    window.SVGElement.prototype.getComputedTextLength = () => 0;
});

afterEach(() => {
    document.body.innerHTML = "";
});

const makeTarget = (id = "t") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

const rows = (n) => Array.from({ length: n }, (_v, i) => ({ label: `S${i + 1}`, value: i + 1 }));

describe("MonthRadial — empty + error states", () => {
    test.each([
        ["null", null],
        ["undefined", undefined],
        ["empty array", []],
    ])("draw(%s) renders empty-state, no svg", (_label, input) => {
        makeTarget();
        new MonthRadial("#t", {}).draw(input);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg")).toBeNull();
    });

    test("custom emptyMessage surfaces in the placeholder", () => {
        makeTarget();
        new MonthRadial("#t", { emptyMessage: "No slots" }).draw([]);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe("No slots");
    });

    test("the default empty message renders an empty placeholder", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw([]);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe("");
    });
});

describe("MonthRadial — neutral DOM contract", () => {
    test("renders svg.msc-month-radial with two rings and four gridlines", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw(rows(6));
        expect(document.querySelector("#t svg.msc-month-radial")).not.toBeNull();
        expect(document.querySelectorAll("#t svg.msc-month-radial circle")).toHaveLength(2);
        expect(document.querySelectorAll("#t svg.msc-month-radial line")).toHaveLength(4);
    });

    test("groups grid / slices / labels under a wrapper <g>, hoisting the shared stroke + transform", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw(rows(6));
        expect(document.querySelector("#t g.msc-month-radial-inner")).not.toBeNull();

        // Grid group: rings + gridlines share fill:none, stroke-width and the
        // soft-border stroke on the group; the circles inherit (no own stroke).
        const grid = document.querySelector("#t g.msc-month-radial-grid");
        expect(grid).not.toBeNull();
        expect(grid.getAttribute("fill")).toBe("none");
        expect(grid.getAttribute("stroke-width")).toBe("1");
        expect(grid.querySelectorAll("circle")).toHaveLength(2);
        expect(grid.querySelectorAll("line")).toHaveLength(4);
        expect(grid.querySelector("circle").getAttribute("stroke")).toBeNull();

        // Slices group carries the shared centre transform; the paths no longer do.
        const slices = document.querySelector("#t g.msc-month-radial-slices");
        expect(slices.getAttribute("transform")).toMatch(/^translate\(/);
        expect(
            slices.querySelector("path.msc-month-radial-slice").getAttribute("transform"),
        ).toBeNull();

        // Perimeter labels live in their own sub-group under the labels group.
        const perimeter = document.querySelector(
            "#t g.msc-month-radial-labels > g.msc-month-radial-perimeter",
        );
        expect(perimeter).not.toBeNull();
        expect(perimeter.querySelectorAll("text.msc-month-radial-lab").length).toBeGreaterThan(0);
    });

    test("one slice path + one perimeter label per row", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw(rows(5));
        expect(document.querySelectorAll("#t path.msc-month-radial-slice")).toHaveLength(5);
        expect(document.querySelectorAll("#t text.msc-month-radial-lab")).toHaveLength(5);
    });

    test("caps the plot at twelve slices regardless of payload size", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw(rows(20));
        expect(document.querySelectorAll("#t path.msc-month-radial-slice")).toHaveLength(12);
        expect(document.querySelectorAll("#t text.msc-month-radial-lab")).toHaveLength(12);
    });

    test("the peak caption is measured over the drawn slices, not overflow rows", () => {
        makeTarget();
        // The 13th row owns the largest value but is never drawn; the peak
        // caption must stay within the twelve plotted slices (here S12 = 12).
        new MonthRadial("#t", {}).draw([...rows(12), { label: "Overflow", value: 999 }]);
        expect(document.querySelector("#t text.msc-month-radial-center").textContent).toBe("S12");
    });

    test("all-zero values still render every slice with the first row as peak", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw([
            { label: "A", value: 0 },
            { label: "B", value: 0 },
        ]);
        expect(document.querySelectorAll("#t path.msc-month-radial-slice")).toHaveLength(2);
        expect(document.querySelector("#t text.msc-month-radial-center").textContent).toBe("A");
    });

    test("centre caption shows the peak label over the centerLabel option", () => {
        makeTarget();
        new MonthRadial("#t", { centerLabel: "Maximum" }).draw([
            { label: "Low", value: 2 },
            { label: "High", value: 9 },
            { label: "Mid", value: 5 },
        ]);
        expect(document.querySelector("#t text.msc-month-radial-center").textContent).toBe("High");
        expect(document.querySelector("#t text.msc-month-radial-sub").textContent).toBe("Maximum");
    });

    test('centerLabel defaults to "Peak"', () => {
        makeTarget();
        new MonthRadial("#t", {}).draw(rows(3));
        expect(document.querySelector("#t text.msc-month-radial-sub").textContent).toBe("Peak");
    });

    test("a centerLabel that fits keeps its full text and gets no <title>", () => {
        makeTarget();
        new MonthRadial("#t", { centerLabel: "Maximum" }).draw(rows(3));
        const sub = document.querySelector("#t text.msc-month-radial-sub");
        expect(sub.firstChild.nodeValue).toBe("Maximum");
        expect(sub.querySelector("title")).toBeNull();
    });

    test("an overlong centerLabel is truncated to the donut hole and keeps the full text in a <title>", () => {
        makeTarget();
        // Force a measured width so truncateToFit actually shortens — jsdom has
        // no SVG layout. 8px/char truncates the long sub-caption while leaving
        // the short peak label untouched.
        window.SVGElement.prototype.getComputedTextLength = function () {
            return (this.textContent ?? "").length * 8;
        };
        const longLabel = "Most frequent zodiac sign";
        new MonthRadial("#t", { centerLabel: longLabel }).draw([
            { label: "Low", value: 2 },
            { label: "High", value: 9 },
        ]);

        const sub = document.querySelector("#t text.msc-month-radial-sub");
        // Visible text (the leading text node) is clipped with an ellipsis…
        expect(sub.firstChild.nodeValue.endsWith("…")).toBe(true);
        expect(sub.firstChild.nodeValue.length).toBeLessThan(longLabel.length);
        // …and the full caption stays reachable on hover / for a11y.
        expect(sub.querySelector("title")).not.toBeNull();
        expect(sub.querySelector("title").textContent).toBe(longLabel);
    });

    test("an overlong peak label is truncated the same way, with its own <title>", () => {
        makeTarget();
        window.SVGElement.prototype.getComputedTextLength = function () {
            return (this.textContent ?? "").length * 8;
        };
        const longPeak = "Capricornus ascending";
        // The peak is the row with the highest value, so its label fills the
        // upper centre line.
        new MonthRadial("#t", { centerLabel: "Peak" }).draw([
            { label: "Short", value: 2 },
            { label: longPeak, value: 99 },
        ]);

        const center = document.querySelector("#t text.msc-month-radial-center");
        expect(center.firstChild.nodeValue.endsWith("…")).toBe(true);
        expect(center.firstChild.nodeValue.length).toBeLessThan(longPeak.length);
        expect(center.querySelector("title").textContent).toBe(longPeak);
    });

    test("a caption too wide for even one glyph collapses to a lone ellipsis but keeps its <title>", () => {
        makeTarget();
        // Every single glyph already exceeds the budget, so truncateToFit gives
        // up and renders just the ellipsis.
        window.SVGElement.prototype.getComputedTextLength = () => 999;
        new MonthRadial("#t", { centerLabel: "Mortality" }).draw(rows(3));

        const sub = document.querySelector("#t text.msc-month-radial-sub");
        expect(sub.firstChild.nodeValue).toBe("…");
        expect(sub.querySelector("title").textContent).toBe("Mortality");
    });

    test("wedges are filled with the accent option", () => {
        makeTarget();
        new MonthRadial("#t", { accent: "rebeccapurple" }).draw(rows(4));
        const slice = document.querySelector("#t path.msc-month-radial-slice");
        expect(slice.style.fill).toBe("rebeccapurple");
    });

    test("wedges default to currentColor when no accent is given", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw(rows(4));
        const slice = document.querySelector("#t path.msc-month-radial-slice");
        expect(slice.style.fill).toBe("currentColor");
    });
});

describe("MonthRadial — native get/set accessors", () => {
    test("getters read back the constructor options", () => {
        makeTarget();
        const widget = new MonthRadial("#t", {
            size: 320,
            accent: "rebeccapurple",
            centerLabel: "Maximum",
            emptyMessage: "none",
        });
        expect(widget.size).toBe(320);
        expect(widget.accent).toBe("rebeccapurple");
        expect(widget.centerLabel).toBe("Maximum");
        expect(widget.emptyMessage).toBe("none");
    });

    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new MonthRadial("#t", {});
        expect(widget.size).toBe(260);
        expect(widget.accent).toBe("currentColor");
        expect(widget.centerLabel).toBe("Peak");
        expect(widget.emptyMessage).toBe("");
    });

    test("the size setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new MonthRadial("#t", {});
        widget.size = 320;
        expect(widget.size).toBe(320);
        // A non-positive value resets to the default.
        widget.size = 0;
        expect(widget.size).toBe(260);
        // The runtime guard also defaults a non-finite value — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.size = /** @type {any} */ ("wide");
        expect(widget.size).toBe(260);
    });

    test("the accent setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new MonthRadial("#t", {});
        widget.accent = "rebeccapurple";
        expect(widget.accent).toBe("rebeccapurple");
        // An empty string resets to the default.
        widget.accent = "";
        expect(widget.accent).toBe("currentColor");
        // The runtime guard also defaults a non-string value — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.accent = /** @type {any} */ (42);
        expect(widget.accent).toBe("currentColor");
    });

    test("a setter applied after construction takes effect on the next draw", () => {
        makeTarget();
        const widget = new MonthRadial("#t", {});
        widget.accent = "rebeccapurple";
        widget.draw(rows(4));
        const slice = document.querySelector("#t path.msc-month-radial-slice");
        expect(slice.style.fill).toBe("rebeccapurple");
    });

    test("the dispatcher pattern (Object.entries → widget[k] = v) configures the widget", () => {
        makeTarget();
        const widget = new MonthRadial("#t", {});
        for (const [key, value] of Object.entries({
            size: 320,
            accent: "rebeccapurple",
            centerLabel: "Maximum",
            emptyMessage: "no data",
        })) {
            widget[key] = value;
        }
        expect(widget.size).toBe(320);
        expect(widget.accent).toBe("rebeccapurple");
        expect(widget.centerLabel).toBe("Maximum");
        expect(widget.emptyMessage).toBe("no data");
    });
});

describe("MonthRadial — per-wedge sub captions", () => {
    test("a row's sub renders a second perimeter line beneath its label", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw([
            { label: "Aries", value: 5, sub: "21 Mar – 20 Apr" },
            { label: "Taurus", value: 3 },
        ]);

        const subs = document.querySelectorAll("#t text.msc-month-radial-sublab");
        expect(subs).toHaveLength(1);
        expect(subs[0].textContent).toBe("21 Mar – 20 Apr");

        // The wedge's primary label is still drawn alongside its sub-line.
        const labels = Array.from(document.querySelectorAll("#t text.msc-month-radial-lab")).map(
            (t) => t.textContent,
        );
        expect(labels).toContain("Aries");
    });

    test("rows without a sub render no sub-label line", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw(rows(6));
        expect(document.querySelectorAll("#t text.msc-month-radial-sublab")).toHaveLength(0);
    });

    test("the label reserve widens by one line when a sub is present", () => {
        makeTarget();
        // No width/height + jsdom client 0 → box = size(260) + 2*pad. The curved
        // band needs room for two lines when a sub is present (pad 34 → 328)
        // versus one line without (pad 24 → 308) — still far smaller than a
        // radial label run would demand.
        new MonthRadial("#t", {}).draw([{ label: "Aries", value: 1, sub: "21 Mar – 20 Apr" }]);
        expect(document.querySelector("#t svg.msc-month-radial").getAttribute("viewBox")).toBe(
            "0 0 328 328",
        );
    });

    test("sub-bearing labels are written curved along arc paths in <defs>", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw([
            { label: "Aries", value: 5, sub: "21 Mar – 20 Apr" },
            { label: "Taurus", value: 3, sub: "21 Apr – 21 May" },
        ]);

        // Each line is a <textPath> bound to a zero-width arc path in <defs>;
        // two slices × (name + sub) → four arc paths and four text paths.
        const arcs = document.querySelectorAll("#t svg defs path[id^='msc-month-radial-arc-']");
        expect(arcs).toHaveLength(4);

        const namePath = document.querySelector("#t text.msc-month-radial-lab textPath");
        expect(namePath).not.toBeNull();
        expect(namePath.getAttribute("href")).toMatch(/^#msc-month-radial-arc-/);
        expect(namePath.getAttribute("text-anchor")).toBe("middle");
        expect(document.querySelector("#t text.msc-month-radial-sublab textPath")).not.toBeNull();
    });

    test("labels without a sub are still curved — one arc + textPath per wedge, no sub-line", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw(rows(6));
        // Six wedges, each a single curved name line: six arc paths, six
        // name textPaths, and no sub-labels.
        expect(
            document.querySelectorAll("#t svg defs path[id^='msc-month-radial-arc-']"),
        ).toHaveLength(6);
        expect(document.querySelectorAll("#t text.msc-month-radial-lab textPath")).toHaveLength(6);
        expect(document.querySelectorAll("#t text.msc-month-radial-sublab")).toHaveLength(0);
    });

    test("two charts on one page get distinct arc-path ids", () => {
        document.body.innerHTML = `<div id="a"></div><div id="b"></div>`;
        const data = [{ label: "Aries", value: 1, sub: "21 Mar – 20 Apr" }];
        new MonthRadial("#a", {}).draw(data);
        new MonthRadial("#b", {}).draw(data);
        const idA = document.querySelector("#a defs path").id;
        const idB = document.querySelector("#b defs path").id;
        expect(idA).not.toBe(idB);
    });

    test("the sub is appended to the wedge's hover tooltip", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw([{ label: "Aries", value: 5, sub: "21 Mar – 20 Apr" }]);

        const slice = document.querySelector("#t path.msc-month-radial-slice");
        slice.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

        const tip = document.body.querySelector(":scope > .msc-chart-tooltip");
        expect(tip).not.toBeNull();
        expect(tip.innerHTML).toContain("Aries");
        expect(tip.innerHTML).toContain("msc-chart-tooltip__sub");
        expect(tip.innerHTML).toContain("21 Mar – 20 Apr");
    });

    test("a tooltipValue replaces the bare count in the tooltip", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw([{ label: "Aries", value: 81, tooltipValue: "81 persons" }]);

        const slice = document.querySelector("#t path.msc-month-radial-slice");
        slice.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

        const stat = document.body
            .querySelector(":scope > .msc-chart-tooltip")
            .querySelector(".msc-chart-tooltip__stat");
        expect(stat.textContent).toBe("81 persons");
    });

    test("without a tooltipValue the tooltip shows the bare formatted count", () => {
        makeTarget();
        new MonthRadial("#t", {}).draw([{ label: "Aries", value: 81 }]);

        const slice = document.querySelector("#t path.msc-month-radial-slice");
        slice.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

        const stat = document.body
            .querySelector(":scope > .msc-chart-tooltip")
            .querySelector(".msc-chart-tooltip__stat");
        expect(stat.textContent).toBe("81");
    });
});

describe("MonthRadial — redraw", () => {
    test("a second draw replaces the previous svg, never stacks", () => {
        makeTarget();
        const widget = new MonthRadial("#t", {});
        widget.draw(rows(6));
        widget.draw(rows(3));
        expect(document.querySelectorAll("#t svg.msc-month-radial")).toHaveLength(1);
        expect(document.querySelectorAll("#t path.msc-month-radial-slice")).toHaveLength(3);
    });
});

describe("MonthRadial — sizing + margin positioning", () => {
    const sliceTransform = () =>
        document.querySelector("#t svg g.msc-month-radial-slices").getAttribute("transform");

    test("the default box is size + 2*pad square with the plot centred", () => {
        // No width/height + jsdom clientWidth/Height 0 → box = size(260) + 2*pad.
        // Curved labels need only a thin band, so the sub-less pad is 24 → 308.
        makeTarget();
        new MonthRadial("#t", {}).draw(rows(12));
        const svg = document.querySelector("#t svg.msc-month-radial");
        expect(svg.getAttribute("viewBox")).toBe("0 0 308 308");
        expect(sliceTransform()).toBe("translate(154, 154)");
    });

    test("explicit width and height drive the box; the plot centres in it", () => {
        makeTarget();
        new MonthRadial("#t", { width: 400, height: 300 }).draw(rows(12));
        const svg = document.querySelector("#t svg.msc-month-radial");
        expect(svg.getAttribute("viewBox")).toBe("0 0 400 300");
        expect(sliceTransform()).toBe("translate(200, 150)");
    });

    test("an unset height falls back to the resolved width so the chart stays square", () => {
        makeTarget();
        new MonthRadial("#t", { width: 300 }).draw(rows(12));
        const svg = document.querySelector("#t svg.msc-month-radial");
        expect(svg.getAttribute("viewBox")).toBe("0 0 300 300");
        expect(sliceTransform()).toBe("translate(150, 150)");
    });

    test("a per-side margin insets the available box and shifts the plot centre", () => {
        // Reserve 100px on the right: availW = 200, availH = 300, centre =
        // (0 + 200/2, 300/2) = (100, 150).
        makeTarget();
        new MonthRadial("#t", { width: 300, height: 300, margin: { right: 100 } }).draw(rows(12));
        expect(sliceTransform()).toBe("translate(100, 150)");
    });
});

describe("MonthRadial — empty→data redraw", () => {
    test("clears the empty-state placeholder and renders exactly one root", () => {
        makeTarget();
        const w = new MonthRadial("#t", {});
        w.draw([]);
        w.draw(rows(6));
        expect(document.querySelectorAll("#t > .chart-empty-state")).toHaveLength(0);
        expect(document.querySelectorAll("#t > svg.msc-month-radial")).toHaveLength(1);
    });
});
