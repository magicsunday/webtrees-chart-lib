import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const zoomInstance = {
    scaleExtent: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    wheelDelta: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),
};

const zoomMock = jest.fn(() => zoomInstance);
const zoomTransform = jest.fn(() => ({ k: 1 }));

await jest.unstable_mockModule("d3-zoom", () => ({
    __esModule: true,
    zoom: zoomMock,
    zoomTransform,
}));

const { default: ChartZoom } = await import("src/chart/svg/chart-zoom");

beforeEach(() => {
    jest.clearAllMocks();
});

describe("ChartZoom", () => {
    test("initializes zoom behavior with handlers", () => {
        const parent = { attr: jest.fn() };
        const zoom = new ChartZoom(parent);

        expect(zoomInstance.scaleExtent).toHaveBeenCalledWith([0.1, 20]);
        expect(zoomInstance.on).toHaveBeenCalledWith("zoom", expect.any(Function));
        expect(zoomInstance.wheelDelta).toHaveBeenCalledWith(expect.any(Function));
        expect(zoomInstance.filter).toHaveBeenCalledWith(expect.any(Function));
        expect(zoom.get()).toBe(zoomInstance);
    });

    test("filter allows ctrl+wheel within bounds", () => {
        const parent = { attr: jest.fn() };
        const _zoom = new ChartZoom(parent);
        const filter = zoomInstance.filter.mock.calls[0][0];

        expect(
            filter({ type: "wheel", ctrlKey: true, deltaY: -1, preventDefault: jest.fn() }),
        ).toBe(true);
    });

    test.each([
        [
            "a plain left-button drag is allowed",
            { type: "mousedown", ctrlKey: false, button: 0 },
            true,
        ],
        [
            "a ctrl-modified drag is rejected",
            { type: "mousedown", ctrlKey: true, button: 0 },
            false,
        ],
        [
            "a non-left-button drag is rejected",
            { type: "mousedown", ctrlKey: false, button: 2 },
            false,
        ],
    ])("filter: %s", (_label, event, expected) => {
        // The non-wheel / non-touchstart tail of the filter: reached by pointer
        // drags, where the decision is purely ctrlKey/button. (A `wheel` type
        // can never arrive here — it returns earlier — so the tail depends on
        // neither, which is what the simplification relies on.)
        const parent = { attr: jest.fn() };
        new ChartZoom(parent); // eslint-disable-line no-new
        const filter = zoomInstance.filter.mock.calls[0][0];

        expect(filter(event)).toBe(expected);
    });

    test("wheelDelta scales wheel movement", () => {
        const parent = { attr: jest.fn() };
        new ChartZoom(parent); // eslint-disable-line no-new
        const wheelDelta = zoomInstance.wheelDelta.mock.calls[0][0];

        expect(wheelDelta({ deltaY: 10, deltaMode: 0 })).toBeCloseTo(-0.02);
        expect(wheelDelta({ deltaY: 10, deltaMode: 1 })).toBeCloseTo(-0.5);
    });
});
