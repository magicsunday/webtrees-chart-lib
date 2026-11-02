import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

import PngChartExport from "src/chart/svg/export/png-chart-export.js";
import { installBrowserGaps, readBlobText, stubBoundingBox } from "../../../support/jsdom-gaps.js";
import { until } from "../../../support/wait.js";

const SVG_NS = "http://www.w3.org/2000/svg";

let gaps;
let removeBoundingBox;

beforeEach(() => {
    gaps = installBrowserGaps();
});

afterEach(() => {
    gaps.restore();
    removeBoundingBox?.();
    removeBoundingBox = undefined;
    document.body.innerHTML = "";
});

// A live chart with a group, a rectangle and an image that needs no fetch. A rule of the
// page styles the rectangle, and the clone of the chart does not carry that rule.
const mountChart = () => {
    document.body.innerHTML = `<style>#box { fill: red; stroke: blue; }</style>
    <svg id="chart" xmlns="${SVG_NS}">
        <g id="stage"><rect id="box"></rect></g>
        <image id="portrait" href="data:image/png;base64,AAAA"></image>
    </svg>`;

    return document.querySelector("#chart");
};

const exportChart = async (box, fileName = "chart.png") => {
    removeBoundingBox = stubBoundingBox(box);
    const chart = mountChart();

    new PngChartExport().svgToImage({ node: () => chart }, fileName);
    await until(() => gaps.downloads.length > 0);

    return {
        download: gaps.downloads[0],
        drawing: gaps.drawings[0],
        document: await readBlobText(gaps.blobs.get("blob:test-1")),
    };
};

describe("PngChartExport", () => {
    test("calculateViewBox expands the bounds of the chart with padding", () => {
        removeBoundingBox = stubBoundingBox({ x: 10, y: 20, width: 30, height: 40 });

        expect(new PngChartExport().calculateViewBox(mountChart())).toEqual([-40, -30, 130, 140]);
    });

    test("createCanvas prepares a canvas of the requested size", () => {
        const canvas = new PngChartExport().createCanvas(640, 480);

        expect(canvas.width).toBe(640);
        expect(canvas.height).toBe(480);
    });

    test("copyStylesInline writes the computed style of a leaf into the clone and leaves containers", () => {
        const chart = mountChart();
        const clone = chart.cloneNode(true);

        new PngChartExport().copyStylesInline(chart, clone);

        const box = clone.querySelector("#box");

        expect(box.style.getPropertyValue("fill")).toBe("red");
        expect(box.style.getPropertyValue("stroke")).toBe("blue");
        expect(clone.querySelector("#stage").getAttribute("style")).toBeNull();
    });

    test("cloneSvg returns a deep clone of the chart", async () => {
        const chart = mountChart();
        const clone = await new PngChartExport().cloneSvg(chart);

        expect(clone).not.toBe(chart);
        expect(clone.querySelectorAll("*")).toHaveLength(chart.querySelectorAll("*").length);
        expect(clone.querySelector("#box")).not.toBe(chart.querySelector("#box"));
    });

    describe("convertToDataUrl", () => {
        test("draws the serialised svg on a white canvas of the given size and returns the data", async () => {
            const result = await new PngChartExport().convertToDataUrl(mountChart(), 300, 200);

            const [drawing] = gaps.drawings;

            expect(result).toBe("data:image/octet-stream;base64,300x200");
            expect(drawing.width).toBe(300);
            expect(drawing.height).toBe(200);
            expect(drawing.fillStyle).toBe("rgb(255,255,255)");
            expect(drawing.filled).toEqual([[0, 0, 300, 200]]);
            expect(drawing.images).toHaveLength(1);
            expect(await readBlobText(gaps.blobs.get(gaps.loadedImages[0]))).toContain('id="box"');
            expect(gaps.blobs.get(gaps.loadedImages[0]).type).toBe("image/svg+xml;charset=utf-8");
            expect(gaps.revoked).toEqual(gaps.loadedImages);
        });

        test("rejects and releases the object url when the svg cannot be loaded", async () => {
            gaps.restore();
            gaps = installBrowserGaps({ imageFails: true });

            await expect(
                new PngChartExport().convertToDataUrl(mountChart(), 300, 200),
            ).rejects.toThrow("Failed to load SVG as image for PNG export");

            expect(gaps.revoked).toEqual(gaps.loadedImages);
            expect(gaps.drawings).toHaveLength(0);
        });
    });

    describe("svgToImage", () => {
        test("exports a small chart at the minimum size with the styles inlined", async () => {
            const {
                download,
                drawing,
                document: exported,
            } = await exportChart({
                x: 10,
                y: 20,
                width: 30,
                height: 40,
            });

            // The minimum is A3 at 300 DPI.
            expect([drawing.width, drawing.height]).toEqual([4960, 3508]);
            expect(exported).toContain('width="4960"');
            expect(exported).toContain('height="3508"');
            expect(exported).toContain('viewBox="-40,-30,130,140"');
            expect(exported).toMatch(/<rect[^>]*style="[^"]*fill: red/);
            expect(download).toEqual({
                download: "chart.png",
                href: "data:image/octet-stream;base64,4960x3508",
                target: "_blank",
            });
        });

        test("a chart larger than the minimum keeps its own size", async () => {
            const { drawing, document: exported } = await exportChart({
                x: 0,
                y: 0,
                width: 5900,
                height: 3900,
            });

            // The padding of 50 on every side is part of the size.
            expect([drawing.width, drawing.height]).toEqual([6000, 4000]);
            expect(exported).toContain('width="6000"');
            expect(exported).toContain('height="4000"');
        });

        test("names the download with the given file name", async () => {
            const { download } = await exportChart(
                { x: 0, y: 0, width: 10, height: 10 },
                "tree.png",
            );

            expect(download.download).toBe("tree.png");
        });

        test("saves nothing and says so when the svg cannot be loaded", async () => {
            gaps.restore();
            gaps = installBrowserGaps({ imageFails: true });
            removeBoundingBox = stubBoundingBox({ x: 0, y: 0, width: 10, height: 10 });
            const log = jest.spyOn(console, "log").mockImplementation(() => {});
            const chart = mountChart();

            new PngChartExport().svgToImage({ node: () => chart }, "chart.png");
            await until(() => log.mock.calls.length > 0);

            expect(log).toHaveBeenCalledWith("Failed to save chart as PNG image");
            expect(gaps.downloads).toHaveLength(0);

            log.mockRestore();
        });
    });
});
