/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { ensureStyle } from "src/chart/util/ensure-style.js";

const ATTRIBUTE = "data-test-ensure-style";
const OTHER_ATTRIBUTE = "data-test-ensure-style-other";

const styles = (attribute) => document.head.querySelectorAll(`style[${attribute}]`);

describe("ensureStyle", () => {
    beforeEach(() => {
        document.head.innerHTML = "";
    });

    afterEach(() => {
        Reflect.deleteProperty(document, "head");
    });

    it("adds the css to the head as one style element marked with the attribute", () => {
        ensureStyle(ATTRIBUTE, ".a { color: red; }");

        expect(styles(ATTRIBUTE)).toHaveLength(1);
        expect(styles(ATTRIBUTE)[0].parentElement).toBe(document.head);
        expect(styles(ATTRIBUTE)[0].textContent).toBe(".a { color: red; }");
    });

    it("adds nothing on a further call with the same attribute", () => {
        ensureStyle(ATTRIBUTE, ".a { color: red; }");
        ensureStyle(ATTRIBUTE, ".a { color: blue; }");

        expect(styles(ATTRIBUTE)).toHaveLength(1);
        expect(styles(ATTRIBUTE)[0].textContent).toBe(".a { color: red; }");
    });

    it("keeps one element per attribute", () => {
        ensureStyle(ATTRIBUTE, ".a {}");
        ensureStyle(OTHER_ATTRIBUTE, ".b {}");

        expect(styles(ATTRIBUTE)).toHaveLength(1);
        expect(styles(OTHER_ATTRIBUTE)).toHaveLength(1);
        expect(styles(OTHER_ATTRIBUTE)[0].textContent).toBe(".b {}");
    });

    it("adds the element again after the page lost it", () => {
        ensureStyle(ATTRIBUTE, ".a {}");
        styles(ATTRIBUTE)[0].remove();
        ensureStyle(ATTRIBUTE, ".a {}");

        expect(styles(ATTRIBUTE)).toHaveLength(1);
    });

    it("leaves a foreign style element alone", () => {
        document.head.innerHTML = '<style id="other">p { color: red; }</style>';

        ensureStyle(ATTRIBUTE, ".a {}");

        expect(document.head.querySelectorAll("style")).toHaveLength(2);
        expect(document.getElementById("other").textContent).toBe("p { color: red; }");
    });

    it("adds nothing and does not throw in a document without a head", () => {
        Object.defineProperty(document, "head", { value: null, configurable: true });

        expect(() => ensureStyle(ATTRIBUTE, ".a {}")).not.toThrow();

        Reflect.deleteProperty(document, "head");

        expect(styles(ATTRIBUTE)).toHaveLength(0);
    });
});
