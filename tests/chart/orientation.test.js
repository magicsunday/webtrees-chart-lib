import { describe, expect, test } from "@jest/globals";
import Orientation from "src/chart/orientation/orientation.js";
import OrientationBottomTop from "src/chart/orientation/orientation-bottom-top.js";
import OrientationLeftRight from "src/chart/orientation/orientation-left-right.js";
import OrientationRightLeft from "src/chart/orientation/orientation-right-left.js";
import OrientationTopBottom from "src/chart/orientation/orientation-top-bottom.js";

describe("Orientation base class", () => {
    test("default isVertical is false", () => {
        // Subclass that only overrides the abstracts the test exercises
        class Stub extends Orientation {
            get direction() {
                return 1;
            }
            get nodeWidth() {
                return 0;
            }
            get nodeHeight() {
                return 0;
            }
            norm(_d) {}
        }
        expect(new Stub(160, 95).isVertical).toBe(false);
    });

    test("abstract members throw a real Error on the bare base class", () => {
        const o = new Orientation(160, 95);
        // A real Error, not a string throw: it carries a stack and satisfies
        // `instanceof Error`, so a consumer's `catch (e) { e.message }` works.
        expect(() => o.direction).toThrow(Error);
        expect(() => o.nodeWidth).toThrow(Error);
        expect(() => o.nodeHeight).toThrow(Error);
        expect(() => o.norm({})).toThrow(Error);
        // Exact message, not a substring: passing an Error instance makes Jest
        // compare the whole message, so an accidental prefix/suffix is caught.
        expect(() => o.direction).toThrow(new Error("Abstract method direction() not implemented"));
    });

    test("boxWidth has a setter, symmetric with boxHeight, that feeds nodeWidth", () => {
        // Before, only boxHeight had a setter; boxWidth was read-only and
        // consumers had to poke the private `_boxWidth`. The setter must reach
        // the same field the geometry reads: nodeWidth = boxWidth + xOffset.
        const o = new OrientationTopBottom(160, 95);
        o.boxWidth = 200;
        expect(o.boxWidth).toBe(200);
        expect(o.nodeWidth).toBe(200 + o.xOffset);
    });
});

describe("OrientationTopBottom", () => {
    const o = new OrientationTopBottom(160, 95);
    test("direction = 1, isVertical = true", () => {
        expect(o.direction).toBe(1);
        expect(o.isVertical).toBe(true);
    });
    test("nodeWidth = boxWidth + xOffset, nodeHeight = boxHeight + yOffset", () => {
        expect(o.nodeWidth).toBe(190); // 160 + 30
        expect(o.nodeHeight).toBe(135); // 95 + 40
    });
    test("norm flips y by direction (no-op when direction = 1)", () => {
        const d = { x: 100, y: 50 };
        o.norm(d);
        expect(d).toEqual({ x: 100, y: 50 });
    });
    test("splitNames is true", () => {
        expect(o.splitNames).toBe(true);
    });
});

describe("OrientationBottomTop", () => {
    const o = new OrientationBottomTop(160, 95);
    test("direction = -1, isVertical = true", () => {
        expect(o.direction).toBe(-1);
        expect(o.isVertical).toBe(true);
    });
    test("norm negates y", () => {
        const d = { x: 100, y: 50 };
        o.norm(d);
        expect(d).toEqual({ x: 100, y: -50 });
    });
});

describe("OrientationLeftRight", () => {
    const o = new OrientationLeftRight(160, 95);
    test("isVertical = false (inherits default)", () => {
        expect(o.isVertical).toBe(false);
    });
    test("xOffset = 40, yOffset = 20 (overridden)", () => {
        expect(o.xOffset).toBe(40);
        expect(o.yOffset).toBe(20);
    });
    test("nodeWidth/Height swap so layout reads horizontally", () => {
        expect(o.nodeWidth).toBe(115); // boxHeight + yOffset
        expect(o.nodeHeight).toBe(200); // boxWidth + xOffset
    });
    test("norm swaps and applies direction", () => {
        const d = { x: 100, y: 50 };
        o.norm(d);
        expect(d).toEqual({ x: 50, y: 100 });
    });
});

describe("OrientationRightLeft", () => {
    const o = new OrientationRightLeft(160, 95);
    test("isVertical = false", () => {
        expect(o.isVertical).toBe(false);
    });
    test("norm swaps and negates", () => {
        const d = { x: 100, y: 50 };
        o.norm(d);
        expect(d).toEqual({ x: -50, y: 100 });
    });
});

describe("RTL document direction flip", () => {
    // The horizontal orientations consult document.dir on every direction
    // access; the vertical pair is direction-constant and should ignore RTL.
    const setDir = (dir) => {
        document.dir = dir;
    };

    afterEach(() => setDir(""));

    test("LeftRight inverts direction when document is RTL", () => {
        const o = new OrientationLeftRight(160, 95);
        setDir("ltr");
        expect(o.direction).toBe(1);
        setDir("rtl");
        expect(o.direction).toBe(-1);
    });

    test("RightLeft inverts direction when document is RTL", () => {
        const o = new OrientationRightLeft(160, 95);
        setDir("ltr");
        expect(o.direction).toBe(-1);
        setDir("rtl");
        expect(o.direction).toBe(1);
    });

    test("TopBottom direction stays +1 regardless of RTL", () => {
        const o = new OrientationTopBottom(160, 95);
        setDir("rtl");
        expect(o.direction).toBe(1);
    });

    test("BottomTop direction stays -1 regardless of RTL", () => {
        const o = new OrientationBottomTop(160, 95);
        setDir("rtl");
        expect(o.direction).toBe(-1);
    });
});
