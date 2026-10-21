/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const exportHandler = { svgToImage: jest.fn() };
const createChartExport = jest.fn(() => exportHandler);
const zoomBehaviour = jest.fn();
const zoomGet = jest.fn(() => zoomBehaviour);

jest.unstable_mockModule("src/chart/svg/chart-export-factory.js", () => ({
    default: createChartExport,
}));
jest.unstable_mockModule("src/chart/svg/chart-zoom.js", () => ({
    default: jest.fn(() => ({ get: zoomGet })),
}));
jest.unstable_mockModule("src/chart/svg/svg-defs.js", () => ({
    default: jest.fn(() => ({ get: jest.fn(() => ({})) })),
}));

const { default: LinkedTreeSvg } = await import("src/linked-tree/svg.js");

/**
 * Builds a chainable stand-in for the D3 selection the constructor appends the
 * <svg> element to. The returned `handlers` collect the registered event listeners.
 */
function createParent() {
    const handlers = {};
    const classes = {};
    const element = {};

    element.attr = jest.fn(() => element);
    element.call = jest.fn(() => element);
    element.classed = jest.fn((name, value) => {
        classes[name] = value;

        return element;
    });
    element.on = jest.fn((type, handler) => {
        handlers[type] = handler;

        return element;
    });
    element.append = jest.fn(() => element);

    return { parent: { append: jest.fn(() => element) }, element, handlers, classes };
}

const configuration = (overrides = {}) => ({
    rtl: false,
    showAlternativeName: false,
    labels: { zoom: "Zoom with Ctrl", move: "Move with two fingers" },
    ...overrides,
});

describe("LinkedTreeSvg.export", () => {
    beforeEach(() => {
        createChartExport.mockClear();
    });

    test.each(["png", "svg"])("hands the %s type to createChartExport", (type) => {
        const svg = new LinkedTreeSvg(createParent().parent, configuration());

        expect(svg.export(type)).toBe(exportHandler);
        expect(createChartExport).toHaveBeenCalledTimes(1);
        expect(createChartExport).toHaveBeenCalledWith(type);
    });
});

describe("LinkedTreeSvg before initEvents", () => {
    test("refuses to hand out the zoom and the visual group", () => {
        const svg = new LinkedTreeSvg(createParent().parent, configuration());

        expect(() => svg.zoom).toThrow("LinkedTreeSvg.zoom is not available");
        expect(() => svg.visual).toThrow("LinkedTreeSvg.visual is not available");
    });
});

describe("LinkedTreeSvg.initEvents", () => {
    const overlay = () => ({ show: jest.fn(), hide: jest.fn() });

    test("shows the zoom hint on a wheel turn without Ctrl and none with it", () => {
        const { parent, handlers } = createParent();
        const hint = overlay();

        new LinkedTreeSvg(parent, configuration()).initEvents(hint);

        handlers.wheel({ ctrlKey: true });
        expect(hint.show).not.toHaveBeenCalled();

        handlers.wheel({ ctrlKey: false });
        expect(hint.show).toHaveBeenCalledTimes(1);
        expect(hint.show.mock.calls[0][0]).toBe("Zoom with Ctrl");
    });

    test("shows the move hint for one finger and hides the overlay for two", () => {
        const { parent, handlers } = createParent();
        const hint = overlay();

        new LinkedTreeSvg(parent, configuration()).initEvents(hint);

        handlers.touchmove({ touches: [{}] });
        expect(hint.show).toHaveBeenCalledWith("Move with two fingers");

        hint.hide.mockClear();
        handlers.touchmove({ touches: [{}, {}] });
        expect(hint.hide).toHaveBeenCalledTimes(1);
    });

    test("stops the click only when it was already prevented", () => {
        const { parent, handlers } = createParent();

        new LinkedTreeSvg(parent, configuration()).initEvents(overlay());

        const prevented = { defaultPrevented: true, stopPropagation: jest.fn() };
        const plain = { defaultPrevented: false, stopPropagation: jest.fn() };

        handlers.click(prevented);
        handlers.click(plain);

        expect(prevented.stopPropagation).toHaveBeenCalledTimes(1);
        expect(plain.stopPropagation).not.toHaveBeenCalled();
    });

    test.each([
        [true, true],
        [false, undefined],
    ])("marks the element for a right-to-left document (rtl %s)", (rtl, expected) => {
        const { parent, classes } = createParent();

        new LinkedTreeSvg(parent, configuration({ rtl })).initEvents(overlay());

        expect(classes.rtl).toBe(expected);
    });

    test("makes the zoom and the visual group available afterwards", () => {
        const { parent } = createParent();
        const svg = new LinkedTreeSvg(parent, configuration());

        svg.initEvents(overlay());

        expect(svg.zoom).toBeDefined();
        expect(svg.visual).toBeDefined();
        expect(zoomGet).toHaveBeenCalled();
    });
});
