import { afterEach, describe, expect, test } from "@jest/globals";

import MonthRadial from "src/chart/widgets/month-radial.js";

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
