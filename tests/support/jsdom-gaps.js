/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Minimal stand-ins for what jsdom cannot do and the PNG and SVG exports of this
 * library rely on. jsdom has no layout engine (no `getBBox`), no 2D drawing backend
 * (a canvas has no context), no image decoding (an `Image` never loads) and no object
 * URLs, and it cannot follow a link, so a click on the download anchor goes nowhere.
 * Each stand-in records what the export hands to it, so a test reads the exported
 * document and the drawn canvas instead of asserting calls on a fake of the export.
 */

import { jest } from "@jest/globals";

/**
 * Reads the text of a blob. jsdom has no `Blob.text()`.
 *
 * @param {Blob} blob
 *
 * @returns {Promise<string>}
 */
export const readBlobText = (blob) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });

/**
 * Installs the stand-ins for object URLs, image loading, canvas drawing and the
 * download click. Call `restore()` in an `afterEach`.
 *
 * @param {object}  [options]
 * @param {boolean} [options.imageFails] Whether an image reports an error instead of loading
 *
 * @returns {{
 *     blobs: Map<string, Blob>,
 *     revoked: string[],
 *     loadedImages: string[],
 *     drawings: Array<{width: number, height: number, fillStyle: string, filled: number[][], images: unknown[]}>,
 *     downloads: Array<{download: string|null, href: string|null, target: string|null}>,
 *     restore: () => void
 * }}
 */
export const installBrowserGaps = ({ imageFails = false } = {}) => {
    const blobs = new Map();
    const revoked = [];
    const loadedImages = [];
    const drawings = [];
    const downloads = [];
    let counter = 0;

    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const originalImage = globalThis.Image;
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

    URL.createObjectURL = (blob) => {
        counter += 1;
        blobs.set(`blob:test-${counter}`, blob);

        return `blob:test-${counter}`;
    };
    URL.revokeObjectURL = (url) => {
        revoked.push(url);
    };

    globalThis.Image = class {
        set src(value) {
            loadedImages.push(value);
            setTimeout(() => (imageFails ? this.onerror?.() : this.onload?.()), 0);
        }
    };

    HTMLCanvasElement.prototype.getContext = function () {
        const drawing = {
            width: this.width,
            height: this.height,
            fillStyle: "",
            filled: [],
            images: [],
        };

        drawings.push(drawing);

        return {
            set fillStyle(value) {
                drawing.fillStyle = value;
            },
            fillRect: (...rectangle) => drawing.filled.push(rectangle),
            drawImage: (image) => drawing.images.push(image),
        };
    };
    HTMLCanvasElement.prototype.toDataURL = function (type) {
        return `data:${type};base64,${this.width}x${this.height}`;
    };

    const dispatchSpy = jest
        .spyOn(HTMLAnchorElement.prototype, "dispatchEvent")
        .mockImplementation(function (event) {
            if (event.type === "click") {
                downloads.push({
                    download: this.getAttribute("download"),
                    href: this.getAttribute("href"),
                    target: this.getAttribute("target"),
                });
            }

            return true;
        });

    return {
        blobs,
        revoked,
        loadedImages,
        drawings,
        downloads,
        restore: () => {
            URL.createObjectURL = originalCreateObjectURL;
            URL.revokeObjectURL = originalRevokeObjectURL;
            globalThis.Image = originalImage;
            HTMLCanvasElement.prototype.getContext = originalGetContext;
            HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
            dispatchSpy.mockRestore();
        },
    };
};

/**
 * Gives every SVG element the bounding box of a layout. jsdom measures nothing.
 *
 * @param {{x: number, y: number, width: number, height: number}} box
 *
 * @returns {() => void} Removes the stand-in
 */
export const stubBoundingBox = (box) => {
    SVGElement.prototype.getBBox = () => ({ ...box });

    return () => {
        Reflect.deleteProperty(SVGElement.prototype, "getBBox");
    };
};
