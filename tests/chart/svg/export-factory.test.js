import { describe, expect, test } from "@jest/globals";

import createChartExport from "src/chart/svg/chart-export-factory.js";
import PngChartExport from "src/chart/svg/export/png-chart-export.js";
import SvgChartExport from "src/chart/svg/export/svg-chart-export.js";

describe("createChartExport", () => {
    test("creates a PNG exporter", () => {
        expect(createChartExport("png")).toBeInstanceOf(PngChartExport);
    });

    test("creates an SVG exporter", () => {
        expect(createChartExport("svg")).toBeInstanceOf(SvgChartExport);
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
