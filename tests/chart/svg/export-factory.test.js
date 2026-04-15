import { describe, expect, jest, test } from "@jest/globals";

const pngConstructor = jest.fn(() => ({ type: "png" }));
const svgConstructor = jest.fn(() => ({ type: "svg" }));

await jest.unstable_mockModule("src/chart/svg/export/PngChartExport", () => ({
    __esModule: true,
    default: pngConstructor,
}));

await jest.unstable_mockModule("src/chart/svg/export/SvgChartExport", () => ({
    __esModule: true,
    default: svgConstructor,
}));

const { default: ChartExportFactory } = await import("src/chart/svg/ChartExportFactory");

describe("ChartExportFactory", () => {
    test("creates PNG exporter", () => {
        const factory = new ChartExportFactory();
        const exporter = factory.createExport("png");

        expect(pngConstructor).toHaveBeenCalledTimes(1);
        expect(exporter.type).toBe("png");
    });

    test("creates SVG exporter", () => {
        const factory = new ChartExportFactory();
        const exporter = factory.createExport("svg");

        expect(svgConstructor).toHaveBeenCalledTimes(1);
        expect(exporter.type).toBe("svg");
    });

    test("throws on unknown exporter", () => {
        const factory = new ChartExportFactory();

        expect(() => factory.createExport("pdf")).toThrow("Unknown export type: pdf");
    });
});
