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

const { default: ChartZoom } = await import("src/chart/svg/ChartZoom");

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

        expect(filter({ type: "wheel", ctrlKey: true, deltaY: -1, preventDefault: jest.fn() })).toBe(true);
    });

    test("wheelDelta scales wheel movement", () => {
        const parent = { attr: jest.fn() };
        new ChartZoom(parent); // eslint-disable-line no-new
        const wheelDelta = zoomInstance.wheelDelta.mock.calls[0][0];

        expect(wheelDelta({ deltaY: 10, deltaMode: 0 })).toBeCloseTo(-0.02);
        expect(wheelDelta({ deltaY: 10, deltaMode: 1 })).toBeCloseTo(-0.5);
    });
});
