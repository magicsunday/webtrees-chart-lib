import { afterEach, describe, expect, jest, test } from "@jest/globals";
import ChartExport from "src/chart/svg/chart-export";

describe("ChartExport", () => {
    test("triggerDownload prepares anchor and dispatches click", () => {
        const dispatchEvent = jest.fn();
        const setAttribute = jest.fn();
        const createElementSpy = jest
            .spyOn(document, "createElement")
            .mockReturnValue({ dispatchEvent, setAttribute });

        const exporter = new ChartExport();
        exporter.triggerDownload("data:image/png", "chart.png");

        expect(setAttribute).toHaveBeenCalledWith("download", "chart.png");
        expect(setAttribute).toHaveBeenCalledWith("href", "data:image/png");
        expect(setAttribute).toHaveBeenCalledWith("target", "_blank");
        expect(dispatchEvent).toHaveBeenCalled();

        createElementSpy.mockRestore();
    });

    describe("inlineImages", () => {
        const SVG_NS = "http://www.w3.org/2000/svg";
        const XLINK_NS = "http://www.w3.org/1999/xlink";

        const originalFetch = globalThis.fetch;

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        /**
         * Builds an SVG root holding one <image> per given attribute set.
         *
         * @param {Array<Record<string, string>>} attributeSets
         */
        const buildSvg = (attributeSets) => {
            const svg = document.createElementNS(SVG_NS, "svg");

            for (const attributes of attributeSets) {
                const image = document.createElementNS(SVG_NS, "image");

                for (const [name, value] of Object.entries(attributes)) {
                    image.setAttribute(name, value);
                }

                svg.appendChild(image);
            }

            return svg;
        };

        const okResponse = () => ({
            ok: true,
            blob: () => Promise.resolve(new Blob(["pixel"], { type: "image/png" })),
        });

        test("replaces a reachable image href by a base64 data URI", async () => {
            globalThis.fetch = jest.fn(() => Promise.resolve(okResponse()));
            const svg = buildSvg([{ href: "https://example.test/a.png" }]);

            const result = await new ChartExport().inlineImages(svg);

            expect(result).toBe(svg);
            expect(globalThis.fetch).toHaveBeenCalledWith("https://example.test/a.png");
            expect(svg.querySelector("image").getAttribute("href")).toBe(
                `data:image/png;base64,${btoa("pixel")}`,
            );
        });

        test("removes the href of an image whose fetch fails", async () => {
            globalThis.fetch = jest.fn(() => Promise.reject(new Error("network")));
            const svg = buildSvg([{ href: "https://example.test/a.png" }]);

            await new ChartExport().inlineImages(svg);

            expect(svg.querySelector("image").hasAttribute("href")).toBe(false);
        });

        test("removes the href of an image answered with an error status", async () => {
            globalThis.fetch = jest.fn(() =>
                Promise.resolve({ ...okResponse(), ok: false, status: 404 }),
            );
            const svg = buildSvg([{ href: "https://example.test/missing.png" }]);

            await new ChartExport().inlineImages(svg);

            expect(svg.querySelector("image").hasAttribute("href")).toBe(false);
        });

        test("keeps the other images when one of them fails", async () => {
            globalThis.fetch = jest.fn((url) =>
                url.endsWith("bad.png")
                    ? Promise.reject(new Error("network"))
                    : Promise.resolve(okResponse()),
            );
            const svg = buildSvg([
                { href: "https://example.test/bad.png" },
                { href: "https://example.test/good.png" },
            ]);

            await new ChartExport().inlineImages(svg);

            const [bad, good] = svg.querySelectorAll("image");

            expect(bad.hasAttribute("href")).toBe(false);
            expect(good.getAttribute("href")).toMatch(/^data:image\/png;base64,/);
        });

        test("leaves an image that already holds a data URI untouched", async () => {
            globalThis.fetch = jest.fn();
            const svg = buildSvg([{ href: "data:image/png;base64,AAAA" }]);

            await new ChartExport().inlineImages(svg);

            expect(globalThis.fetch).not.toHaveBeenCalled();
            expect(svg.querySelector("image").getAttribute("href")).toBe(
                "data:image/png;base64,AAAA",
            );
        });

        test("skips an image without any href", async () => {
            globalThis.fetch = jest.fn();
            const svg = buildSvg([{}]);

            await new ChartExport().inlineImages(svg);

            expect(globalThis.fetch).not.toHaveBeenCalled();
            expect(svg.querySelector("image").hasAttribute("href")).toBe(false);
        });

        test("reads the legacy xlink href when no plain href is set", async () => {
            globalThis.fetch = jest.fn(() => Promise.resolve(okResponse()));
            const svg = buildSvg([{}]);
            svg.querySelector("image").setAttributeNS(
                XLINK_NS,
                "xlink:href",
                "https://example.test/legacy.png",
            );

            await new ChartExport().inlineImages(svg);

            expect(globalThis.fetch).toHaveBeenCalledWith("https://example.test/legacy.png");
            expect(svg.querySelector("image").getAttribute("href")).toMatch(
                /^data:image\/png;base64,/,
            );
        });
    });
});
