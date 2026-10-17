import { describe, expect, jest, test } from "@jest/globals";
import PngChartExport from "src/chart/svg/export/png-chart-export";

describe("PngChartExport", () => {
    test("calculateViewBox expands bounds with padding", () => {
        const pngExport = new PngChartExport();
        const svgElement = { getBBox: () => ({ x: 10, y: 20, width: 30, height: 40 }) };

        expect(pngExport.calculateViewBox(svgElement)).toEqual([-40, -30, 130, 140]);
    });

    test("createCanvas prepares canvas size", () => {
        const pngExport = new PngChartExport();
        const canvas = pngExport.createCanvas(640, 480);

        expect(canvas.width).toBe(640);
        expect(canvas.height).toBe(480);
    });

    test("copyStylesInline clones computed styles to destination children", () => {
        const pngExport = new PngChartExport();
        const source = document.createElement("div");
        const destination = document.createElement("div");

        const sourceChild = document.createElement("span");
        sourceChild.style.setProperty("color", "rgb(255, 0, 0)");
        source.appendChild(sourceChild);

        const destinationChild = document.createElement("span");
        destination.appendChild(destinationChild);

        const originalGetComputedStyle = window.getComputedStyle;
        window.getComputedStyle = jest.fn(() => ({
            length: 1,
            0: "color",
            getPropertyValue: () => "rgb(255, 0, 0)",
        }));

        pngExport.copyStylesInline(source, destination);

        expect(destinationChild.style.getPropertyValue("color")).toBe("rgb(255, 0, 0)");

        window.getComputedStyle = originalGetComputedStyle;
    });

    test("cloneSvg returns a deep clone of the SVG", async () => {
        const pngExport = new PngChartExport();
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const child = document.createElementNS("http://www.w3.org/2000/svg", "g");
        svg.appendChild(child);

        const clone = await pngExport.cloneSvg(svg);

        expect(clone).not.toBe(svg);
        expect(clone.childNodes).toHaveLength(svg.childNodes.length);
    });

    test("convertToDataUrl resolves with generated URI", async () => {
        const pngExport = new PngChartExport();
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

        const originalCreateCanvas = pngExport.createCanvas.bind(pngExport);
        pngExport.createCanvas = jest.fn(() => ({
            width: 0,
            height: 0,
            getContext: () => ({
                fillStyle: "",
                fillRect: jest.fn(),
                drawImage: jest.fn(),
            }),
            toDataURL: () => "data:image/png;base64,TEST",
        }));

        const originalURL = window.URL;
        const createObjectURL = jest.fn(() => "blob:mock");
        const revokeObjectURL = jest.fn();
        Object.defineProperty(window, "URL", {
            configurable: true,
            value: { createObjectURL, revokeObjectURL },
        });

        const mockImage = {
            set src(value) {
                this._src = value;
                this.onload();
            },
            onload: () => {},
        };
        const OriginalImage = global.Image;
        // biome-ignore lint/complexity/useArrowFunction: Image must be callable with `new`
        global.Image = function () {
            return mockImage;
        };

        const result = await pngExport.convertToDataUrl(svg, 100, 100);

        expect(result).toBe("data:image/octet-stream;base64,TEST");
        expect(createObjectURL).toHaveBeenCalled();

        global.Image = OriginalImage;
        Object.defineProperty(window, "URL", { configurable: true, value: originalURL });
        pngExport.createCanvas = originalCreateCanvas;
    });

    describe("minimum canvas size", () => {
        // Runs the pipeline with every step but the sizing stubbed. Resolves with
        // the size handed to the canvas conversion and the attributes written to
        // the cloned svg, for a given chart size.
        const exported = async (pngExport, chartWidth, chartHeight) => {
            const clone = { setAttribute: jest.fn() };
            const convertToDataUrl = jest.fn(() => Promise.resolve("data:png"));
            const downloaded = new Promise((resolve) => {
                pngExport.triggerDownload = jest.fn(resolve);
            });

            pngExport.cloneSvg = jest.fn(() => Promise.resolve(clone));
            pngExport.inlineImages = jest.fn((node) => Promise.resolve(node));
            pngExport.copyStylesInline = jest.fn();
            pngExport.calculateViewBox = jest.fn(() => [0, 0, chartWidth, chartHeight]);
            pngExport.convertToDataUrl = convertToDataUrl;

            pngExport.svgToImage({ node: () => ({}) }, "chart.png");
            await downloaded;

            return {
                canvas: convertToDataUrl.mock.calls[0].slice(1),
                attributes: Object.fromEntries(clone.setAttribute.mock.calls),
            };
        };

        test("a small chart is exported at A3 and 300 DPI by default", async () => {
            const pngExport = new PngChartExport();
            const { canvas, attributes } = await exported(pngExport, 200, 100);

            expect(canvas).toEqual([4960, 3508]);
            expect(attributes).toEqual({ width: "4960", height: "3508", viewBox: "0,0,200,100" });
            expect(pngExport.copyStylesInline).toHaveBeenCalledTimes(1);
        });

        test("a chart larger than the minimum keeps its own size", async () => {
            const { canvas, attributes } = await exported(new PngChartExport(), 6000, 4000);

            expect(canvas).toEqual([6000, 4000]);
            expect(attributes.width).toBe("6000");
            expect(attributes.height).toBe("4000");
        });

        test("the minimumSize option lowers the floor", async () => {
            const pngExport = new PngChartExport({ minimumSize: [800, 600] });
            const { canvas, attributes } = await exported(pngExport, 200, 100);

            expect(canvas).toEqual([800, 600]);
            expect(attributes).toEqual({ width: "800", height: "600", viewBox: "0,0,200,100" });
        });

        test("a chart larger than a lowered floor keeps its own size", async () => {
            const pngExport = new PngChartExport({ minimumSize: [800, 600] });

            expect((await exported(pngExport, 1000, 700)).canvas).toEqual([1000, 700]);
        });
    });
});
