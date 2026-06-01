import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

import MirrorHistogram from "src/chart/widgets/mirror-histogram.js";

// Reduced motion makes _runEntry jump straight to the final keyframe, so the
// bars reach their resting geometry synchronously — a d3 transition never ticks
// under jsdom.
beforeEach(() => {
    window.matchMedia = (query) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
    });
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

const makeTarget = (id = "m") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

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
        // its non-zero resting state under reduced motion (a zero-length stub
        // carries no arc).
        const tallBar = document.querySelector("#m path.msc-mirror-histogram-bar-top");
        const d = tallBar.getAttribute("d");
        expect(d).toContain("A");
        expect(d).not.toContain("Q");
    });

    test("a zero-value bucket renders the flat stub rather than a rounded bar", () => {
        makeTarget();
        new MirrorHistogram("#m", {}).draw(SAMPLE);
        // SAMPLE's top "C" bucket is 0 → length 0 → the flat 1px placeholder
        // stub (no arc, no quadratic) so the empty bucket still reads on the
        // axis instead of vanishing.
        const zeroBar = document
            .querySelectorAll("#m path.msc-mirror-histogram-bar-top")[2]
            .getAttribute("d");
        expect(zeroBar).not.toContain("A");
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

describe("MirrorHistogram — native get/set accessors", () => {
    test("getters read back the constructor options", () => {
        makeTarget();
        const widget = new MirrorHistogram("#m", {
            height: 520,
            width: 640,
            topLabel: "Above",
            bottomLabel: "Below",
            emptyMessage: "Nothing to show",
        });
        expect(widget.height).toBe(520);
        expect(widget.width).toBe(640);
        expect(widget.topLabel).toBe("Above");
        expect(widget.bottomLabel).toBe("Below");
        expect(widget.emptyMessage).toBe("Nothing to show");
    });

    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new MirrorHistogram("#m", {});
        // An omitted height/width stays responsive (undefined) so draw resolves
        // the host element's size at draw time.
        expect(widget.height).toBeUndefined();
        expect(widget.width).toBeUndefined();
        expect(widget.topLabel).toBe("");
        expect(widget.bottomLabel).toBe("");
        expect(widget.emptyMessage).toBe("");
    });

    test("the height setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new MirrorHistogram("#m", {});
        widget.height = 500;
        expect(widget.height).toBe(500);
        // A non-positive value clears the override so draw sizes responsively.
        widget.height = -10;
        expect(widget.height).toBeUndefined();
        // The runtime guard also clears a non-number value — the cast simulates
        // the JSON dispatcher assigning an untyped payload value.
        widget.height = /** @type {any} */ ("tall");
        expect(widget.height).toBeUndefined();
    });

    test("the width setter keeps a finite positive number else undefined, getter reads it back", () => {
        makeTarget();
        // An omitted width stays responsive (undefined).
        const responsive = new MirrorHistogram("#m", {});
        expect(responsive.width).toBeUndefined();
        // An explicit positive width reads back unchanged.
        const widget = new MirrorHistogram("#m", { width: 720 });
        expect(widget.width).toBe(720);
        // A non-positive value clears the override back to responsive sizing.
        widget.width = 0;
        expect(widget.width).toBeUndefined();
        widget.width = -1;
        expect(widget.width).toBeUndefined();
        // The runtime guard clears a non-number value — the cast simulates the
        // JSON dispatcher assigning an untyped payload value.
        widget.width = /** @type {any} */ ("wide");
        expect(widget.width).toBeUndefined();
    });

    test("the topLabel setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted topLabel exposes the empty-string default.
        const fallback = new MirrorHistogram("#m", {});
        expect(fallback.topLabel).toBe("");
        // A custom string reads back unchanged.
        const widget = new MirrorHistogram("#m", { topLabel: "Husbands" });
        expect(widget.topLabel).toBe("Husbands");
        // An empty string is a valid topLabel.
        widget.topLabel = "";
        expect(widget.topLabel).toBe("");
        // The runtime guard resets a non-string value to an empty string — the
        // cast simulates the JSON dispatcher assigning an untyped payload value.
        widget.topLabel = /** @type {any} */ (42);
        expect(widget.topLabel).toBe("");
    });

    test("the bottomLabel setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted bottomLabel exposes the empty-string default.
        const fallback = new MirrorHistogram("#m", {});
        expect(fallback.bottomLabel).toBe("");
        // A custom string reads back unchanged.
        const widget = new MirrorHistogram("#m", { bottomLabel: "Wives" });
        expect(widget.bottomLabel).toBe("Wives");
        // An empty string is a valid bottomLabel.
        widget.bottomLabel = "";
        expect(widget.bottomLabel).toBe("");
        // The runtime guard resets a non-string value to an empty string — the
        // cast simulates the JSON dispatcher assigning an untyped payload value.
        widget.bottomLabel = /** @type {any} */ (42);
        expect(widget.bottomLabel).toBe("");
    });

    test("the emptyMessage setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted emptyMessage exposes the empty-string default.
        const fallback = new MirrorHistogram("#m", {});
        expect(fallback.emptyMessage).toBe("");
        // A custom string reads back unchanged.
        const widget = new MirrorHistogram("#m", { emptyMessage: "Nothing to show" });
        expect(widget.emptyMessage).toBe("Nothing to show");
        // An empty string resets to the empty-string default.
        widget.emptyMessage = "";
        expect(widget.emptyMessage).toBe("");
        // The runtime guard resets a non-string value to the default — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.emptyMessage = /** @type {any} */ (42);
        expect(widget.emptyMessage).toBe("");
    });

    test("the dispatcher pattern (Object.entries → widget[k] = v) configures the widget", () => {
        makeTarget();
        const widget = new MirrorHistogram("#m", {});
        for (const [key, value] of Object.entries({
            height: 400,
            width: 600,
            topLabel: "Top",
            bottomLabel: "Bottom",
            emptyMessage: "Empty",
        })) {
            widget[key] = value;
        }
        expect(widget.height).toBe(400);
        expect(widget.width).toBe(600);
        expect(widget.topLabel).toBe("Top");
        expect(widget.bottomLabel).toBe("Bottom");
        expect(widget.emptyMessage).toBe("Empty");
    });
});

describe("MirrorHistogram — entry behaviour", () => {
    const noReducedMotion = () => {
        window.matchMedia = (query) => ({
            matches: false,
            media: query,
            addEventListener() {},
            removeEventListener() {},
        });
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
