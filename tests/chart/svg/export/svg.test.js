import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";

import SvgChartExport from "src/chart/svg/export/svg-chart-export.js";
import { installBrowserGaps, readBlobText } from "../../../support/jsdom-gaps.js";
import { until } from "../../../support/wait.js";

const SVG_NS = "http://www.w3.org/2000/svg";

let gaps;

beforeEach(() => {
    gaps = installBrowserGaps();
});

afterEach(() => {
    gaps.restore();
    document.body.innerHTML = "";
});

// Mounts a page with a chart and runs the export on it. The styles come from rules of
// the page, which the clone of the chart does not carry, so a style that reaches the
// exported document was inlined by the export.
const mount = (rules, chart) => {
    document.body.innerHTML = `<style>${rules}</style>${chart}`;

    return document.querySelector("#chart");
};

const exportChart = async (rules, chart, fileName = "chart.svg") => {
    const node = mount(rules, chart);

    new SvgChartExport().svgToImage({ node: () => node }, fileName);
    await until(() => gaps.downloads.length > 0);

    const [download] = gaps.downloads;
    const text = await readBlobText(gaps.blobs.get(download.href));
    const root = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;

    return { download, root, text, blob: gaps.blobs.get(download.href) };
};

const CHART = `<svg id="chart" xmlns="${SVG_NS}"><g id="stage"><text id="label">Hi</text></g></svg>`;

describe("SvgChartExport", () => {
    describe("sandbox", () => {
        test("createSandbox attaches a hidden iframe and cleanUp removes it again", () => {
            const exporter = new SvgChartExport();
            const node = document.createElement("div");

            expect(exporter.createSandbox(node)).toBe(node);
            expect(document.querySelectorAll("iframe")).toHaveLength(1);

            expect(exporter.cleanUp("blob:svg")).toBe("blob:svg");
            expect(document.querySelectorAll("iframe")).toHaveLength(0);
        });

        test("getDefaultComputedStyle reads the default style of a tag once", () => {
            const exporter = new SvgChartExport();
            exporter.createSandbox(document.createElement("div"));

            const first = exporter.getDefaultComputedStyle({ tagName: "SPAN" });
            const second = exporter.getDefaultComputedStyle({ tagName: "SPAN" });

            expect(second).toBe(first);
            expect(exporter.getDefaultComputedStyle({ tagName: "DIV" })).not.toBe(first);

            exporter.cleanUp(null);
        });
    });

    describe("the exported document", () => {
        test("is a clone of the chart with its text, named by the given file name", async () => {
            const { download, root } = await exportChart("", CHART, "tree.svg");

            expect(download.download).toBe("tree.svg");
            expect(download.target).toBe("_blank");
            expect(root.tagName).toBe("svg");
            expect(root.querySelector("g#stage > text#label")?.textContent).toBe("Hi");
        });

        test("is handed out as an svg document", async () => {
            const { blob } = await exportChart("", CHART);

            expect(blob.type).toBe("image/svg+xml;charset=utf-8");
        });

        test("carries the styles of the page as inline styles", async () => {
            const { root } = await exportChart("#label { fill: red; font-size: 12px; }", CHART);

            const label = root.querySelector("#label");

            expect(label.style.getPropertyValue("fill")).toBe("red");
            expect(label.style.getPropertyValue("font-size")).toBe("12px");
        });

        test("leaves out CSS variables and layout properties and forces the font", async () => {
            const { root } = await exportChart(
                "#label { --accent: blue; width: 10px; fill: red; font-family: Inter, sans-serif; }",
                CHART,
            );

            const label = root.querySelector("#label");

            expect(label.style.getPropertyValue("--accent")).toBe("");
            expect(label.style.getPropertyValue("width")).toBe("");
            expect(label.style.getPropertyValue("font-family")).toBe(
                '"Segoe UI", Arial, sans-serif',
            );
        });

        // A source value is written to the clone only when it differs from the relevant
        // baseline. With a parent that is the inherited value of the parent, the browser
        // default is irrelevant then. At the root it is the browser default.
        test.each([
            [
                "root, differs from the default, is copied",
                "#chart { color: red; }",
                "chart",
                "rgb(255, 0, 0)",
            ],
            ["root, equals the default, is left out", "", "chart", ""],
            [
                "child, differs from the parent, is copied although it equals the default",
                "#stage { color: red; } #label { color: canvastext; }",
                "label",
                "canvastext",
            ],
            [
                "child, equals the inherited parent value, is left out although it differs from the default",
                "#stage { color: red; }",
                "label",
                "",
            ],
        ])("%s", async (_label, rules, id, expected) => {
            const { root } = await exportChart(rules, CHART);
            const element = id === "chart" ? root : root.querySelector(`#${id}`);

            expect(element.style.getPropertyValue("color")).toBe(expected);
        });

        test("passes the priority of a computed style on to the clone", () => {
            // jsdom drops the priority from a computed style and from a style it
            // serialises, so this is the one test that hands the export a computed
            // style that carries a priority and reads the call that writes it.
            const exporter = new SvgChartExport();
            const source = document.createElement("span");
            const target = document.createElement("span");
            const setProperty = jest.spyOn(target.style, "setProperty");
            const original = window.getComputedStyle;

            exporter.createSandbox(source);
            window.getComputedStyle = () => ({
                0: "fill",
                length: 1,
                getPropertyValue: () => "rgb(1, 2, 3)",
                getPropertyPriority: () => "important",
            });

            try {
                exporter.cloneStyles(source, target, null);
            } finally {
                window.getComputedStyle = original;
                exporter.cleanUp(null);
            }

            expect(setProperty).toHaveBeenCalledWith("fill", "rgb(1, 2, 3)", "important");
        });

        test("removes the sandbox and keeps the object url for the download", async () => {
            await exportChart("", CHART);

            expect(document.querySelectorAll("iframe")).toHaveLength(0);
            expect(gaps.revoked).toEqual([]);
        });
    });

    describe("a failing export", () => {
        test("says so, saves nothing, removes the sandbox and releases the object url", async () => {
            gaps.restore();
            gaps = installBrowserGaps({ imageFails: true });
            const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
            const node = mount("", CHART);

            new SvgChartExport().svgToImage({ node: () => node }, "chart.svg");
            await until(() => consoleError.mock.calls.length > 0);

            expect(consoleError).toHaveBeenCalledWith(
                "Failed to save chart as SVG image: Failed to load serialised SVG blob",
            );
            expect(gaps.downloads).toHaveLength(0);
            expect(document.querySelectorAll("iframe")).toHaveLength(0);
            expect(gaps.revoked).toEqual(gaps.loadedImages);

            consoleError.mockRestore();
        });
    });
});
