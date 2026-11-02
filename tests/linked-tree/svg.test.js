/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { afterEach, describe, expect, test } from "@jest/globals";
import { select } from "d3-selection";
import { zoomIdentity } from "d3-zoom";

import ChartOverlay from "src/chart/chart-overlay.js";
import PngChartExport from "src/chart/svg/export/png-chart-export.js";
import SvgChartExport from "src/chart/svg/export/svg-chart-export.js";
import LinkedTreeSvg from "src/linked-tree/svg.js";
import { until } from "../support/wait.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const configuration = (overrides = {}) => ({
    rtl: false,
    showAlternativeName: false,
    labels: { zoom: "Zoom with Ctrl", move: "Move with two fingers" },
    ...overrides,
});

// A chart host in a page, with the overlay of the module next to it.
const mount = (overrides = {}) => {
    document.body.innerHTML = '<div id="host"></div>';

    const host = select("#host");
    const svg = new LinkedTreeSvg(host, configuration(overrides));
    const overlay = new ChartOverlay(host);

    return { host, svg, overlay };
};

// A started chart. jsdom measures no layout, so the zoom gets the extent it would read.
const start = (overrides = {}) => {
    const mounted = mount(overrides);

    mounted.svg.initEvents(mounted.overlay);
    mounted.svg.zoom.get().extent([
        [0, 0],
        [400, 300],
    ]);

    return mounted;
};

const tooltip = () => document.querySelector("#host div.overlay p.tooltip");
const opacity = () => Number(document.querySelector("#host div.overlay").style.opacity);

const touchEvent = (type, touchCount) => {
    const event = new Event(type, { bubbles: true, cancelable: true });

    Object.defineProperty(event, "touches", { value: new Array(touchCount) });

    return event;
};

describe("LinkedTreeSvg", () => {
    test("appends the svg element to its parent", () => {
        const { svg } = mount();

        expect(document.querySelector("#host > svg")).toBe(svg.node());
    });

    test.each([
        ["png", PngChartExport],
        ["svg", SvgChartExport],
    ])("export hands out the %s exporter", (type, ExporterClass) => {
        expect(mount().svg.export(type)).toBeInstanceOf(ExporterClass);
    });

    test("export refuses an unknown type", () => {
        expect(() => mount().svg.export("pdf")).toThrow("Unknown export type: pdf");
    });

    test("refuses to hand out the zoom and the visual group before initEvents", () => {
        const { svg } = mount();

        expect(() => svg.zoom).toThrow("LinkedTreeSvg.zoom is not available");
        expect(() => svg.visual).toThrow("LinkedTreeSvg.visual is not available");
    });
});

describe("LinkedTreeSvg.initEvents", () => {
    test("adds the visual group to the svg element", () => {
        const { svg } = start();

        expect(svg.visual.node().tagName).toBe("g");
        expect(svg.visual.node().parentNode).toBe(svg.node());
    });

    test("wires the zoom to the svg element and the visual group", () => {
        const { svg } = start();

        svg.node().dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -100 }));

        expect(svg.visual.attr("transform")).toMatch(/scale\((?!1\))/);
    });

    test("applies a zoom transform to the visual group", () => {
        const { svg } = start();

        select(svg.node()).call(svg.zoom.get().transform, zoomIdentity.translate(5, 6).scale(2));

        expect(svg.visual.attr("transform")).toBe("translate(5,6) scale(2)");
    });

    test("shows the zoom hint on a wheel turn without Ctrl and none with it", () => {
        const { svg } = start();

        svg.node().dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: -1 }));
        expect(tooltip()).toBeNull();

        svg.node().dispatchEvent(new WheelEvent("wheel", { ctrlKey: false, deltaY: -1 }));
        expect(tooltip()?.textContent).toBe("Zoom with Ctrl");
    });

    test("shows the move hint for one finger and hides the overlay for two", async () => {
        const { svg } = start();

        svg.node().dispatchEvent(touchEvent("touchmove", 1));
        expect(tooltip()?.textContent).toBe("Move with two fingers");
        await until(() => opacity() === 1);

        svg.node().dispatchEvent(touchEvent("touchmove", 2));
        await until(() => opacity() < 0.01);
    });

    test("stops a click that was already prevented from reaching the chart", () => {
        const { svg } = start();
        const reached = [];

        svg.visual
            .node()
            .addEventListener("click", (event) => reached.push(event.defaultPrevented));

        // A listener on the page runs before the one of the svg element in the capture phase.
        const preventing = (event) => event.preventDefault();
        document.querySelector("#host").addEventListener("click", preventing, true);
        svg.visual
            .node()
            .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        document.querySelector("#host").removeEventListener("click", preventing, true);

        svg.visual
            .node()
            .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

        expect(reached).toEqual([false]);
    });

    test("suppresses the context menu of the svg element", () => {
        const { svg } = start();
        const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });

        svg.node().dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    test.each([
        [true, true],
        [false, false],
    ])("marks the element for a right-to-left document (rtl %s)", (rtl, marked) => {
        const { svg } = start({ rtl });

        expect(svg.node().classList.contains("rtl")).toBe(marked);
    });
});
