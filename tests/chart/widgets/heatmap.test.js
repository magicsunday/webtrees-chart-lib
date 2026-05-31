import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { easeCubicInOut } from "d3-ease";

import BaseWidget from "src/chart/widgets/base-widget.js";
import Heatmap from "src/chart/widgets/heatmap.js";

// Reduced motion makes _runEntry jump to the final keyframe synchronously, so
// cell opacity is asserted without waiting on a d3 transition (which throws
// under jsdom).
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

// Generic two-dimensional tally — the widget is domain-neutral, so the fixture
// uses abstract row/column labels rather than any particular subject.
const SAMPLE = {
    rows: ["R1", "R2"],
    cols: ["C1", "C2", "C3"],
    values: [
        [4, 0, 7],
        [2, 9, 1],
    ],
};

const makeTarget = (id = "h") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("Heatmap — empty states", () => {
    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new Heatmap("#h", {}).draw(null);
        expect(document.querySelector("#h > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#h .wt-stat-heatmap")).toBeNull();
    });

    test("missing rows or cols falls through to empty-state", () => {
        makeTarget();
        new Heatmap("#h", {}).draw({ rows: [], cols: ["Jan"], values: [] });
        expect(document.querySelector("#h > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new Heatmap("#h", { emptyMessage: "No data" }).draw(null);
        expect(document.querySelector("#h > .chart-empty-state").textContent).toBe("No data");
    });
});

describe("Heatmap — rendering", () => {
    test("renders one cell rect per row × column", () => {
        makeTarget();
        new Heatmap("#h", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#h rect.wt-stat-heatmap-cell").length).toBe(6);
    });

    test("renders a label per row and per column", () => {
        makeTarget();
        new Heatmap("#h", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#h text.wt-stat-heatmap-row").length).toBe(2);
        expect(document.querySelectorAll("#h text.wt-stat-heatmap-col").length).toBe(3);
        expect(
            [...document.querySelectorAll("#h text.wt-stat-heatmap-col")].map((t) => t.textContent),
        ).toEqual(["C1", "C2", "C3"]);
    });

    test("zero cells carry the empty modifier class, counted cells do not", () => {
        makeTarget();
        new Heatmap("#h", {}).draw(SAMPLE);
        const empties = document.querySelectorAll("#h rect.wt-stat-heatmap-cell--empty");
        // Exactly one zero in the sample matrix.
        expect(empties.length).toBe(1);
    });

    test("uses the accent option as the cell fill colour", () => {
        makeTarget();
        new Heatmap("#h", { accent: "var(--wine)" }).draw(SAMPLE);
        const cell = document.querySelector("#h rect.wt-stat-heatmap-cell");
        expect(cell.style.fill).toBe("var(--wine)");
    });

    test("defaults the cell fill to currentColor when no accent option is supplied", () => {
        makeTarget();
        new Heatmap("#h", {}).draw(SAMPLE);
        const cell = document.querySelector("#h rect.wt-stat-heatmap-cell");
        expect(cell.style.fill).toBe("currentColor");
    });

    test("applies the ariaLabel option to the host svg", () => {
        makeTarget();
        new Heatmap("#h", { ariaLabel: "Counts by row and column" }).draw(SAMPLE);
        expect(
            document.querySelector("#h svg.wt-stat-heatmap-svg").getAttribute("aria-label"),
        ).toBe("Counts by row and column");
    });

    test("omits aria-label when no ariaLabel option is supplied", () => {
        makeTarget();
        new Heatmap("#h", {}).draw(SAMPLE);
        expect(
            document.querySelector("#h svg.wt-stat-heatmap-svg").hasAttribute("aria-label"),
        ).toBe(false);
    });

    test("counted cells reach a non-zero fill-opacity once revealed", () => {
        makeTarget();
        new Heatmap("#h", {}).draw(SAMPLE);
        // Under reduced motion the entry resolves to the final opacity directly.
        const counted = [...document.querySelectorAll("#h rect.wt-stat-heatmap-cell")].filter(
            (r) => !r.classList.contains("wt-stat-heatmap-cell--empty"),
        );
        for (const rect of counted) {
            expect(Number(rect.style.fillOpacity)).toBeGreaterThan(0);
        }
    });

    test("the hottest cell is tinted at least as strongly as a cooler one", () => {
        makeTarget();
        new Heatmap("#h", {}).draw(SAMPLE);
        const byOpacity = [...document.querySelectorAll("#h rect.wt-stat-heatmap-cell")]
            .filter((r) => !r.classList.contains("wt-stat-heatmap-cell--empty"))
            .map((r) => Number(r.style.fillOpacity));
        expect(Math.max(...byOpacity)).toBe(1);
    });

    test("prints the count inside each non-empty cell, empty for a zero", () => {
        makeTarget();
        new Heatmap("#h", {}).draw(SAMPLE);
        // SAMPLE values [[4,0,7],[2,9,1]] → row-major cell order.
        const vals = [...document.querySelectorAll("#h text.wt-stat-heatmap-value")].map(
            (t) => t.textContent,
        );
        expect(vals).toEqual(["4", "", "7", "2", "9", "1"]);
    });

    test("flags strongly-tinted cell values with the on-dark modifier", () => {
        makeTarget();
        new Heatmap("#h", {}).draw(SAMPLE);
        const onDark = [...document.querySelectorAll("#h text.wt-stat-heatmap-value--on-dark")].map(
            (t) => t.textContent,
        );
        // The hottest cells (9, 7) cross the contrast threshold; small ones don't.
        expect(onDark).toEqual(expect.arrayContaining(["9", "7"]));
        expect(onDark).not.toContain("2");
    });
});

describe("Heatmap — native get/set accessors", () => {
    test("getters read back the constructor options", () => {
        makeTarget();
        const widget = new Heatmap("#h", {
            width: 800,
            height: 520,
            accent: "var(--wine)",
            valueLabel: "births",
            ariaLabel: "Counts by row and column",
            emptyMessage: "No data",
        });
        expect(widget.width).toBe(800);
        expect(widget.height).toBe(520);
        expect(widget.accent).toBe("var(--wine)");
        expect(widget.valueLabel).toBe("births");
        expect(widget.ariaLabel).toBe("Counts by row and column");
        expect(widget.emptyMessage).toBe("No data");
    });

    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new Heatmap("#h", {});
        // An omitted width stays responsive (undefined) so draw falls back to the
        // host element's width.
        expect(widget.width).toBeUndefined();
        expect(widget.height).toBe(460);
        expect(widget.accent).toBe("currentColor");
        expect(widget.valueLabel).toBe("");
        expect(widget.ariaLabel).toBe("");
        expect(widget.emptyMessage).toBe("");
    });

    test("the width setter keeps a finite positive number else undefined, getter reads it back", () => {
        makeTarget();
        const widget = new Heatmap("#h", { width: 720 });
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

    test("the height setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new Heatmap("#h", {});
        widget.height = 500;
        expect(widget.height).toBe(500);
        // A non-positive value resets to the default.
        widget.height = -10;
        expect(widget.height).toBe(460);
        // The runtime guard also defaults a non-number value — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.height = /** @type {any} */ ("tall");
        expect(widget.height).toBe(460);
    });

    test("the accent setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new Heatmap("#h", {});
        widget.accent = "var(--ochre)";
        expect(widget.accent).toBe("var(--ochre)");
        // An empty string resets to currentColor.
        widget.accent = "";
        expect(widget.accent).toBe("currentColor");
        // The runtime guard also defaults a non-string value — the cast simulates
        // the JSON dispatcher assigning an untyped payload value.
        widget.accent = /** @type {any} */ (42);
        expect(widget.accent).toBe("currentColor");
    });

    test("the valueLabel setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new Heatmap("#h", {});
        widget.valueLabel = "deaths";
        expect(widget.valueLabel).toBe("deaths");
        // An empty string is a valid valueLabel (only non-string resets).
        widget.valueLabel = "";
        expect(widget.valueLabel).toBe("");
        // The runtime guard resets a non-string value to an empty string — the
        // cast simulates the JSON dispatcher assigning an untyped payload value.
        widget.valueLabel = /** @type {any} */ (42);
        expect(widget.valueLabel).toBe("");
    });

    test("the ariaLabel setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new Heatmap("#h", { ariaLabel: "Migration grid" });
        expect(widget.ariaLabel).toBe("Migration grid");
        // An empty string is preserved (it omits the attribute at draw time).
        widget.ariaLabel = "";
        expect(widget.ariaLabel).toBe("");
        // The runtime guard resets a non-string value to an empty string — the
        // cast simulates the JSON dispatcher assigning an untyped payload value.
        widget.ariaLabel = /** @type {any} */ (42);
        expect(widget.ariaLabel).toBe("");
    });

    test("the emptyMessage setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new Heatmap("#h", { emptyMessage: "Nothing to show" });
        expect(widget.emptyMessage).toBe("Nothing to show");
        // An empty string resets to an empty string (the default).
        widget.emptyMessage = "";
        expect(widget.emptyMessage).toBe("");
        // The runtime guard resets a non-string value to an empty string — the
        // cast simulates the JSON dispatcher assigning an untyped payload value.
        widget.emptyMessage = /** @type {any} */ (42);
        expect(widget.emptyMessage).toBe("");
    });

    test("the dispatcher pattern (Object.entries → widget[k] = v) configures the widget", () => {
        makeTarget();
        const widget = new Heatmap("#h", {});
        for (const [key, value] of Object.entries({
            width: 640,
            height: 400,
            accent: "var(--wine)",
            valueLabel: "events",
            ariaLabel: "Heat grid",
            emptyMessage: "No data",
        })) {
            widget[key] = value;
        }
        expect(widget.width).toBe(640);
        expect(widget.height).toBe(400);
        expect(widget.accent).toBe("var(--wine)");
        expect(widget.valueLabel).toBe("events");
        expect(widget.ariaLabel).toBe("Heat grid");
        expect(widget.emptyMessage).toBe("No data");
    });
});

describe("Heatmap — reveal entry lifecycle", () => {
    // Regression guard: under animateOnReveal the entry closure is held for a
    // later playEntry(); it captures the rects of THAT draw. A subsequent empty
    // re-draw removes those rects, so the held closure must be retired — both as
    // internal state (_entry) and as the observable contract that a later
    // playEntry() neither throws nor resurrects the removed grid.
    test("an empty re-draw retires a held reveal entry and leaves playEntry a safe no-op", () => {
        // Force real motion so the reveal entry is held rather than run inline.
        window.matchMedia = (query) => ({
            matches: false,
            media: query,
            addEventListener() {},
            removeEventListener() {},
        });
        makeTarget();
        const widget = new Heatmap("#h", { animateOnReveal: true });
        widget.draw(SAMPLE);
        expect(typeof widget._entry).toBe("function");

        widget.draw(null);
        expect(widget._entry).toBeNull();
        expect(() => widget.playEntry()).not.toThrow();
        expect(document.querySelectorAll("#h rect.wt-stat-heatmap-cell").length).toBe(0);
    });

    test("playEntry on a revealed widget lands counted cells on their final opacity", () => {
        // Under the default reduced-motion stub _runEntry resolves to the final
        // state synchronously at draw time, so playEntry is a safe no-op and the
        // counted cells already carry their final (non-zero) opacity — the
        // positive half of the reveal contract.
        makeTarget();
        const widget = new Heatmap("#h", { animateOnReveal: true });
        widget.draw(SAMPLE);

        expect(() => widget.playEntry()).not.toThrow();
        const counted = [...document.querySelectorAll("#h rect.wt-stat-heatmap-cell")].filter(
            (r) => !r.classList.contains("wt-stat-heatmap-cell--empty"),
        );
        for (const rect of counted) {
            expect(Number(rect.style.fillOpacity)).toBeGreaterThan(0);
        }
    });
});

describe("Heatmap — crossfilter", () => {
    test("clicking a cell emits a cell predicate with the row and column labels", () => {
        makeTarget();
        const widget = new Heatmap("#h", { source: "births-heatmap" });
        widget.draw(SAMPLE);

        const events = [];
        widget.onSelectionChanged((payload) => events.push(payload));

        document
            .querySelectorAll("#h rect.wt-stat-heatmap-cell")[0]
            .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(events).toHaveLength(1);
        expect(events[0].source).toBe("births-heatmap");
        expect(events[0].predicate).toEqual({
            dimension: "cell",
            row: "R1",
            col: "C1",
        });
    });
});

describe("Heatmap — duplicate labels", () => {
    test("repeated column labels render as distinct columns (bands keyed by index)", () => {
        makeTarget();
        // A 3-letter month cut collides in some locales (fr juin/juillet → "jui");
        // keying the band on the label would collapse the two onto one column.
        new Heatmap("#h", {}).draw({
            rows: ["R1"],
            cols: ["jui", "jui", "aug"],
            values: [[3, 5, 2]],
        });

        const xs = [...document.querySelectorAll("#h rect.wt-stat-heatmap-cell")].map((r) =>
            Number(r.getAttribute("x")),
        );

        expect(xs).toHaveLength(3);
        expect(new Set(xs).size).toBe(3);
    });
});

describe("Heatmap — column titles", () => {
    const hoverFirstCell = () => {
        document
            .querySelector("#h rect.wt-stat-heatmap-cell")
            .dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
        return document.querySelector(".wt-chart-tooltip")?.textContent ?? "";
    };

    test("the tooltip shows the verbose colTitle, while the axis keeps the compact col", () => {
        makeTarget();
        new Heatmap("#h", {}).draw({
            rows: ["R1", "R2"],
            cols: ["C1", "C2", "C3"],
            colTitles: ["Column One", "Column Two", "Column Three"],
            values: [
                [4, 0, 7],
                [2, 9, 1],
            ],
        });

        // Axis keeps the compact label …
        expect(
            [...document.querySelectorAll("#h text.wt-stat-heatmap-col")].map((t) => t.textContent),
        ).toEqual(["C1", "C2", "C3"]);

        // … but the first cell's tooltip names the verbose column title.
        expect(hoverFirstCell()).toContain("R1 · Column One");
    });

    test("the tooltip falls back to the compact col when colTitles is absent", () => {
        makeTarget();
        new Heatmap("#h", {}).draw(SAMPLE);

        expect(hoverFirstCell()).toContain("R1 · C1");
    });
});

describe("Heatmap — sanitize", () => {
    test("negative / non-finite counts are clamped to zero (no crash)", () => {
        makeTarget();
        new Heatmap("#h", {}).draw({
            rows: ["1900s"],
            cols: ["Jan", "Feb"],
            values: [[-5, Number.NaN]],
        });
        // Both cells are clamped to zero, so both carry the empty modifier.
        expect(document.querySelectorAll("#h rect.wt-stat-heatmap-cell--empty").length).toBe(2);
    });

    test("a short value row is padded with zeros to the column count", () => {
        makeTarget();
        new Heatmap("#h", {}).draw({
            rows: ["1900s"],
            cols: ["Jan", "Feb", "Mar"],
            values: [[3]],
        });
        expect(document.querySelectorAll("#h rect.wt-stat-heatmap-cell").length).toBe(3);
        expect(document.querySelectorAll("#h rect.wt-stat-heatmap-cell--empty").length).toBe(2);
    });
});

describe("Heatmap — entry easing", () => {
    // The heatmap entry must keep the cubic-in-out feel of the original
    // unnamed `.transition()` (whose d3 default ease is cubic-in-out), NOT the
    // cubic-out default `_enter` falls back to. This pins the ease ARGUMENT
    // heatmap forwards to `_enter`; composed with base-widget.test.js (which
    // proves `_enter` forwards its ease argument on to `transition.ease()`),
    // the cubic-in-out feel is locked. A future edit dropping the argument is
    // caught here even though jsdom never ticks the transition itself.
    afterEach(() => {
        // Restore unconditionally: a thrown assertion above must not leak the
        // mocked `_enter` (which no-ops the DOM) into any later test.
        jest.restoreAllMocks();
    });

    test("forwards the cubic-in-out ease to _enter, overriding the cubic-out default", () => {
        makeTarget();
        const enterSpy = jest
            .spyOn(BaseWidget.prototype, "_enter")
            .mockReturnValue({ style: () => {} });
        new Heatmap("#h", {}).draw(SAMPLE);
        expect(enterSpy).toHaveBeenCalledTimes(1);
        expect(enterSpy.mock.calls[0][5]).toBe(easeCubicInOut);
    });
});
