import { describe, expect, jest, test } from "@jest/globals";

const pngConstructor = jest.fn(() => ({ type: "png" }));
const svgConstructor = jest.fn(() => ({ type: "svg" }));

await jest.unstable_mockModule("src/chart/svg/export/png-chart-export", () => ({
    __esModule: true,
    default: pngConstructor,
}));

await jest.unstable_mockModule("src/chart/svg/export/svg-chart-export", () => ({
    __esModule: true,
    default: svgConstructor,
}));

const { default: createChartExport } = await import("src/chart/svg/chart-export-factory");

describe("createChartExport", () => {
    test("creates PNG exporter", () => {
        const exporter = createChartExport("png");

        expect(pngConstructor).toHaveBeenCalledTimes(1);
        expect(exporter.type).toBe("png");
    });

    test("hands the options to the exporter", () => {
        createChartExport("png", { minimumSize: [800, 600] });

        expect(pngConstructor).toHaveBeenLastCalledWith({ minimumSize: [800, 600] });
    });

    test("creates SVG exporter", () => {
        const exporter = createChartExport("svg");

        expect(svgConstructor).toHaveBeenCalledTimes(1);
        expect(exporter.type).toBe("svg");
    });

    test("throws on unknown exporter", () => {
        expect(() => createChartExport("pdf")).toThrow("Unknown export type: pdf");
    });

    test.each(["constructor", "toString", "__proto__"])(
        "throws on the inherited object key %p",
        (type) => {
            expect(() => createChartExport(type)).toThrow(`Unknown export type: ${type}`);
        },
    );
});
