import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

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

const SAMPLE = {
    rows: ["1900s", "1910s"],
    cols: ["Jan", "Feb", "Mar"],
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
        new Heatmap("#h", { emptyMessage: "keine Daten" }).draw(null);
        expect(document.querySelector("#h > .chart-empty-state").textContent).toBe("keine Daten");
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
        ).toEqual(["Jan", "Feb", "Mar"]);
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
        new Heatmap("#h", { ariaLabel: "Births by decade and month" }).draw(SAMPLE);
        expect(
            document.querySelector("#h svg.wt-stat-heatmap-svg").getAttribute("aria-label"),
        ).toBe("Births by decade and month");
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
    test("clicking a cell emits a decadeMonth predicate with the row and column", () => {
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
            dimension: "decadeMonth",
            decade: "1900s",
            month: "Jan",
        });
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
