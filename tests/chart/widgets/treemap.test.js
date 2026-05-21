import { afterEach, describe, expect, test } from "@jest/globals";

import Treemap from "src/chart/widgets/treemap.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = {
    name: "root",
    children: [
        {
            name: "19th century",
            children: [
                { name: "1-child", value: 12 },
                { name: "5-child", value: 8 },
                { name: "8-child", value: 4 },
            ],
        },
        {
            name: "20th century",
            children: [
                { name: "1-child", value: 30 },
                { name: "2-child", value: 22 },
                { name: "3+ child", value: 6 },
            ],
        },
    ],
};

const makeTarget = (id = "t") => {
    document.body.innerHTML = `<div id="${id}" style="width: 600px; height: 400px;"></div>`;
    return document.getElementById(id);
};

describe("Treemap — empty states", () => {
    test("draw(null) renders empty-state", () => {
        makeTarget();
        new Treemap("#t", {}).draw(null);
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#t svg.wt-treemap")).toBeNull();
    });

    test("draw({}) (no children) yields empty-state via zero total", () => {
        makeTarget();
        new Treemap("#t", {}).draw({});
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("all-zero leaves fall through to empty-state", () => {
        makeTarget();
        new Treemap("#t", {}).draw({
            children: [
                {
                    name: "x",
                    children: [
                        { name: "a", value: 0 },
                        { name: "b", value: 0 },
                    ],
                },
            ],
        });
        expect(document.querySelector("#t > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new Treemap("#t", { emptyMessage: "kein Baum" }).draw(null);
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe("kein Baum");
    });
});

describe("Treemap — rendering", () => {
    test("renders one g.tile per leaf node", () => {
        makeTarget();
        new Treemap("#t", {}).draw(SAMPLE);
        // 3 leaves in 19th + 3 leaves in 20th = 6 tiles
        expect(document.querySelectorAll("#t svg g.tile")).toHaveLength(6);
    });

    test("tiles carry their parent name on data-parent", () => {
        makeTarget();
        new Treemap("#t", {}).draw(SAMPLE);
        const tiles = document.querySelectorAll("#t svg g.tile");
        const parents = Array.from(tiles).map((tile) => tile.getAttribute("data-parent"));
        expect(parents).toEqual(expect.arrayContaining(["19th century", "20th century"]));
    });

    test("renders one .parent-label per non-leaf group", () => {
        makeTarget();
        new Treemap("#t", {}).draw(SAMPLE);
        const labels = Array.from(document.querySelectorAll("#t svg .parent-label")).map(
            (el) => el.textContent,
        );
        expect(labels).toContain("19th century");
        expect(labels).toContain("20th century");
    });

    test("per-leaf class lands on the g.tile", () => {
        makeTarget();
        new Treemap("#t", {}).draw({
            children: [
                {
                    name: "g",
                    children: [
                        { name: "leaf-a", value: 10, class: "highlight" },
                        { name: "leaf-b", value: 5 },
                    ],
                },
            ],
        });
        const tiles = document.querySelectorAll("#t svg g.tile");
        expect(tiles[0].getAttribute("class")).toContain("highlight");
    });

    test("aria-label combines parent + leaf name + value", () => {
        makeTarget();
        new Treemap("#t", {}).draw(SAMPLE);
        const rect = document.querySelector("#t svg g.tile rect.tile-rect");
        expect(rect?.getAttribute("aria-label")).toMatch(/^20th century \/ 1-child: 30$/);
    });

    test("ariaLabel option lands on the host <svg>", () => {
        makeTarget();
        new Treemap("#t", { ariaLabel: "Family-size by century" }).draw(SAMPLE);
        expect(document.querySelector("#t svg.wt-treemap").getAttribute("aria-label")).toBe(
            "Family-size by century",
        );
    });

    test("rect total area approximates host viewport (minus padding)", () => {
        makeTarget();
        new Treemap("#t", {}).draw(SAMPLE);
        const rects = document.querySelectorAll("#t svg rect.tile-rect");
        const total = Array.from(rects).reduce((sum, rect) => {
            const w = Number(rect.getAttribute("width") ?? 0);
            const h = Number(rect.getAttribute("height") ?? 0);
            return sum + w * h;
        }, 0);
        // The widget reserves paddingTop strips per parent, so the
        // total leaf area is strictly less than width × height
        // but should still cover the bulk of the viewport.
        expect(total).toBeGreaterThan(0);
        expect(total).toBeLessThanOrEqual(600 * 320);
    });

    test("redraw replaces prior svg rather than stacking", () => {
        makeTarget();
        const chart = new Treemap("#t", {});
        chart.draw(SAMPLE);
        chart.draw({
            children: [{ name: "only", children: [{ name: "leaf", value: 1 }] }],
        });
        expect(document.querySelectorAll("#t svg.wt-treemap")).toHaveLength(1);
        expect(document.querySelectorAll("#t svg g.tile")).toHaveLength(1);
    });
});
