import { afterEach, describe, expect, test } from "@jest/globals";
import Orientation from "src/chart/orientation/orientation.js";

// The four layouts of a d3.tree() layout differ by two flags only. The rows give
// the expected geometry of each for a box of 160 by 95 pixels. `ltr` and `rtl` are
// the direction under that document direction, and `normalized` is the entry
// { x: 100, y: 50 } after norm() under a left-to-right document.
const LAYOUTS = [
    {
        name: "top-bottom",
        layout: { vertical: true, flip: false },
        isVertical: true,
        splitNames: true,
        offsets: [30, 40],
        nodeSize: [190, 135],
        direction: { ltr: 1, rtl: 1 },
        normalized: { x: 100, y: 50 },
    },
    {
        name: "bottom-top",
        layout: { vertical: true, flip: true },
        isVertical: true,
        splitNames: true,
        offsets: [30, 40],
        nodeSize: [190, 135],
        direction: { ltr: -1, rtl: -1 },
        normalized: { x: 100, y: -50 },
    },
    {
        name: "left-right",
        layout: { vertical: false, flip: false },
        isVertical: false,
        splitNames: false,
        offsets: [40, 20],
        nodeSize: [115, 200],
        direction: { ltr: 1, rtl: -1 },
        normalized: { x: 50, y: 100 },
    },
    {
        name: "right-left",
        layout: { vertical: false, flip: true },
        isVertical: false,
        splitNames: false,
        offsets: [40, 20],
        nodeSize: [115, 200],
        direction: { ltr: -1, rtl: 1 },
        normalized: { x: -50, y: 100 },
    },
];

afterEach(() => {
    document.dir = "";
});

describe.each(LAYOUTS)("Orientation $name", (row) => {
    const make = () => new Orientation(160, 95, row.layout);

    test("exposes the layout shape", () => {
        expect(make().isVertical).toBe(row.isVertical);
        expect(make().splitNames).toBe(row.splitNames);
    });

    test("uses the offsets of its spread axis", () => {
        expect([make().xOffset, make().yOffset]).toEqual(row.offsets);
    });

    test("node size reads along its spread axis", () => {
        expect([make().nodeWidth, make().nodeHeight]).toEqual(row.nodeSize);
    });

    test("direction follows the document direction only for the horizontal layouts", () => {
        const orientation = make();

        document.dir = "ltr";
        expect(orientation.direction).toBe(row.direction.ltr);

        document.dir = "rtl";
        expect(orientation.direction).toBe(row.direction.rtl);
    });

    test("norm applies the direction to the depth axis", () => {
        const entry = { x: 100, y: 50 };
        make().norm(entry);

        expect(entry).toEqual(row.normalized);
    });
});

describe("Orientation boxes", () => {
    test("boxWidth has a setter, symmetric with boxHeight, that feeds nodeWidth", () => {
        // The setter must reach the same field the geometry reads: for a vertical
        // layout nodeWidth = boxWidth + xOffset.
        const o = new Orientation(160, 95, { vertical: true, flip: false });
        o.boxWidth = 200;
        expect(o.boxWidth).toBe(200);
        expect(o.nodeWidth).toBe(200 + o.xOffset);
    });

    test("boxHeight has a setter that feeds nodeHeight", () => {
        const o = new Orientation(160, 95, { vertical: true, flip: false });
        o.boxHeight = 120;
        expect(o.boxHeight).toBe(120);
        expect(o.nodeHeight).toBe(120 + o.yOffset);
    });
});
