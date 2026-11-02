import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import MirrorHistogram from "src/chart/widgets/mirror-histogram.js";
import { targetMaker } from "../../support/make-target.js";
import { stubMotionAllowed, stubReducedMotion } from "../../support/match-media.js";

// Reduced motion makes _runEntry jump straight to the final keyframe, so the
// bars reach their resting geometry synchronously — a d3 transition never ticks
// under jsdom.
beforeEach(() => {
    stubReducedMotion();
});

afterEach(() => {
    document.body.innerHTML = "";
});

// Generic paired distribution — the widget is domain-neutral, so the fixture
// uses abstract bucket labels rather than any particular subject. The bottom
// series intentionally omits one bucket the top series carries ("C").
const SAMPLE = {
    top: [
        { label: "A", value: 10 },
        { label: "B", value: 4 },
        { label: "C", value: 0 },
    ],
    bottom: [
        { label: "A", value: 6 },
        { label: "B", value: 9 },
    ],
};

const makeTarget = targetMaker("m");

describe("MirrorHistogram — empty states", () => {
    test("draw(null) renders the empty-state placeholder instead of crashing", () => {
        makeTarget();
        new MirrorHistogram("#m", {}).draw(null);
        expect(document.querySelector("#m .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#m svg.msc-mirror-histogram")).toBeNull();
    });

    test("two empty series render the empty-state placeholder", () => {
        makeTarget();
        new MirrorHistogram("#m", {}).draw({ top: [], bottom: [] });
        expect(document.querySelector("#m .chart-empty-state")).not.toBeNull();
    });
});

describe("MirrorHistogram — rendering", () => {
    test("renders one top and one bottom bar per shared bucket", () => {
        makeTarget();
        new MirrorHistogram("#m", {}).draw(SAMPLE);
        // Three top buckets (A, B, C); the bottom series is aligned to the same
        // label set, so a missing bucket still gets a bar.
        expect(document.querySelectorAll("#m path.msc-mirror-histogram-bar-top").length).toBe(3);
        expect(document.querySelectorAll("#m path.msc-mirror-histogram-bar-bot").length).toBe(3);
    });

    test("renders a value caption only for non-zero buckets", () => {
        makeTarget();
        new MirrorHistogram("#m", {}).draw(SAMPLE);
        // Top: A=10, B=4 carry a caption, C=0 does not. Bottom: A=6, B=9 do.
        expect(document.querySelectorAll("#m text.msc-mirror-histogram-val-top").length).toBe(2);
        expect(document.querySelectorAll("#m text.msc-mirror-histogram-val-bot").length).toBe(2);
    });

    test("a non-zero bar uses rounded outer corners from the shared builder", () => {
        makeTarget();
        new MirrorHistogram("#m", {}).draw(SAMPLE);
        // The shared roundedBarPath emits arc (`A`) commands; the previous
        // hand-built path used quadratic (`Q`) curves. Asserting an arc and the
        // absence of a quadratic locks the migration AND proves the bar reached
        // its non-zero resting state under reduced motion (the one-pixel stub
        // of an empty bucket rounds at radius 1, only a tall bar reaches 5).
        const tallBar = document.querySelector("#m path.msc-mirror-histogram-bar-top");
        const d = tallBar.getAttribute("d");
        expect(d).toContain("A5,5,");
        expect(d).not.toContain("Q");
    });

    test("a zero-value bucket renders a one-pixel rounded stub rather than a full bar", () => {
        makeTarget();
        new MirrorHistogram("#m", {}).draw(SAMPLE);
        // SAMPLE's top "C" bucket is 0 → length 0 → the 1px placeholder stub,
        // rounded at radius 1 (no quadratic), so the empty bucket still reads
        // on the axis instead of vanishing.
        const zeroBar = document
            .querySelectorAll("#m path.msc-mirror-histogram-bar-top")[2]
            .getAttribute("d");
        expect(zeroBar).toContain("A1,1,");
        expect(zeroBar).not.toContain("A5,5,");
        expect(zeroBar).not.toContain("Q");
    });

    test("renders the two side labels when supplied", () => {
        makeTarget();
        new MirrorHistogram("#m", { topLabel: "Above", bottomLabel: "Below" }).draw(SAMPLE);
        const labels = [...document.querySelectorAll("#m text.msc-mirror-histogram-axislabel")].map(
            (node) => node.textContent,
        );
        expect(labels).toEqual(["Above", "Below"]);
    });

    test("value captions settle at the bar tip, not pinned at the centre axis", () => {
        makeTarget();
        new MirrorHistogram("#m", {}).draw(SAMPLE);
        const topYs = [...document.querySelectorAll("#m text.msc-mirror-histogram-val-top")].map(
            (node) => Number(node.getAttribute("y")),
        );
        const botYs = [...document.querySelectorAll("#m text.msc-mirror-histogram-val-bot")].map(
            (node) => Number(node.getAttribute("y")),
        );
        // The tallest top bar carries its caption well above the centre axis and
        // the tallest bottom bar well below it. A caption left at its axis
        // keyframe (~199 top / ~249 bottom) would fail — it only reaches the tip
        // because `applyFinal` (the reduced-motion branch) places it there.
        expect(Math.min(...topYs)).toBeLessThan(120);
        expect(Math.max(...botYs)).toBeGreaterThan(320);
    });

    test("renders the bucket labels once in the centre axis strip", () => {
        makeTarget();
        new MirrorHistogram("#m", {}).draw(SAMPLE);
        const cats = [...document.querySelectorAll("#m text.msc-mirror-histogram-cat")].map(
            (node) => node.textContent,
        );
        expect(cats).toEqual(["A", "B", "C"]);
    });
});

describe("MirrorHistogram — entry behaviour", () => {
    const noReducedMotion = () => {
        stubMotionAllowed();
    };

    test("with animateOnReveal the entry is held (deferred) instead of run inline", () => {
        noReducedMotion();
        makeTarget();
        const widget = new MirrorHistogram("#m", { animateOnReveal: true });
        widget.draw(SAMPLE);
        // The defer contract: the entry closure is stored for a later
        // playEntry() rather than run inline. Asserting the held closure
        // directly is what distinguishes "held" from "ran" — under jsdom a
        // transition never ticks, so the DOM y alone cannot tell them apart.
        expect(typeof widget._entry).toBe("function");
        const topYs = [...document.querySelectorAll("#m text.msc-mirror-histogram-val-top")].map(
            (node) => Number(node.getAttribute("y")),
        );
        // Secondary: every top caption still sits at its axis keyframe (~199),
        // not the tip (~38), because the held closure has not painted yet.
        expect(Math.min(...topYs)).toBeGreaterThan(150);
    });

    test("the default (inline) entry path does not leave a held closure", () => {
        noReducedMotion();
        makeTarget();
        const widget = new MirrorHistogram("#m", {});
        widget.draw(SAMPLE);
        // No animateOnReveal → the entry runs inline and nothing is held.
        expect(widget._entry).toBeNull();
    });

    test("an empty redraw retires the held entry so a later playEntry is a no-op", () => {
        noReducedMotion();
        makeTarget();
        const widget = new MirrorHistogram("#m", { animateOnReveal: true });
        widget.draw(SAMPLE); // stores a held entry over the first svg
        widget.draw({ top: [], bottom: [] }); // clears the svg AND the stale entry
        expect(() => widget.playEntry()).not.toThrow();
        expect(document.querySelector("#m .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#m svg.msc-mirror-histogram")).toBeNull();
    });
});

describe("MirrorHistogram — sanitize", () => {
    test("drops rows with a non-finite or negative value", () => {
        makeTarget();
        new MirrorHistogram("#m", {}).draw({
            top: [
                { label: "A", value: 5 },
                { label: "B", value: Number.NaN },
                { label: "C", value: -3 },
            ],
            bottom: [{ label: "A", value: 2 }],
        });
        // Only "A" survives in the top series.
        expect(document.querySelectorAll("#m path.msc-mirror-histogram-bar-top").length).toBe(1);
        expect(document.querySelector("#m text.msc-mirror-histogram-cat").textContent).toBe("A");
    });
});

describe("MirrorHistogram tooltip text", () => {
    // Hovering the single top or bottom bar opens the shared body-level tooltip.
    const hoverBar = (series, row) => {
        makeTarget();
        const data = { top: [{ label: row.label, value: 1 }], bottom: [] };
        data[series] = [row];
        new MirrorHistogram("#m", {}).draw(data);
        document
            .querySelector(`#m path.msc-mirror-histogram-bar-${series === "top" ? "top" : "bot"}`)
            .dispatchEvent(
                new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 10 }),
            );

        return document.querySelector(".msc-chart-tooltip");
    };
    const hoverTopBar = (row) => hoverBar("top", row);

    test("shows the row label and the formatted value by default", () => {
        const tooltip = hoverTopBar({ label: "A", value: 1234 });

        expect(tooltip.querySelector("strong").textContent).toBe("A");
        expect(tooltip.querySelector(".msc-chart-tooltip__stat").textContent).toBe(
            (1234).toLocaleString(),
        );
    });

    test("uses the optional tooltip label and body of the row when they are set", () => {
        const tooltip = hoverTopBar({
            label: "A",
            value: 1234,
            tooltipLabel: "Bucket A",
            tooltipBody: "1234 entries",
        });

        expect(tooltip.querySelector("strong").textContent).toBe("Bucket A");
        expect(tooltip.querySelector(".msc-chart-tooltip__stat").textContent).toBe("1234 entries");
    });

    test("falls back to the label and value for an empty or non-string override", () => {
        const tooltip = hoverTopBar({ label: "A", value: 5, tooltipLabel: "", tooltipBody: 42 });

        expect(tooltip.querySelector("strong").textContent).toBe("A");
        expect(tooltip.querySelector(".msc-chart-tooltip__stat").textContent).toBe("5");
    });

    test("uses the optional tooltip label and body of a bottom row as well", () => {
        const tooltip = hoverBar("bottom", {
            label: "A",
            value: 7,
            tooltipLabel: "Bucket A",
            tooltipBody: "7 entries",
        });

        expect(tooltip.querySelector("strong").textContent).toBe("Bucket A");
        expect(tooltip.querySelector(".msc-chart-tooltip__stat").textContent).toBe("7 entries");
    });

    test("shows the label and the value for a bottom row without an override", () => {
        const tooltip = hoverBar("bottom", { label: "A", value: 7 });

        expect(tooltip.querySelector("strong").textContent).toBe("A");
        expect(tooltip.querySelector(".msc-chart-tooltip__stat").textContent).toBe("7");
    });
});
