import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import DetailPanel from "src/chart/panel/detail-panel.js";
import {
    DETAIL_PANEL_CSS,
    DETAIL_PANEL_STYLE_ATTRIBUTE,
    ensureDetailPanelStyle,
} from "src/chart/panel/detail-panel-style.js";

const styles = () => document.head.querySelectorAll(`style[${DETAIL_PANEL_STYLE_ATTRIBUTE}]`);

function buildPanelElement() {
    document.body.innerHTML = `
        <aside id="panel" class="offcanvas webtrees-detail-panel" hidden>
            <h2 data-panel="title" tabindex="-1"></h2>
            <img data-panel="image" alt="" hidden>
            <p data-panel="hint"></p>
            <dl data-panel="facts"></dl>
            <p data-panel="empty" hidden></p>
            <div data-panel="actions" hidden>
                <button data-panel="individual"></button>
                <button data-panel="center"></button>
            </div>
        </aside>`;

    return document.getElementById("panel");
}

const callbacks = () => ({
    onIndividual: jest.fn(),
    onCenter: jest.fn(),
    onClose: jest.fn(),
    onHidden: jest.fn(),
});

describe("detail panel style", () => {
    beforeEach(() => {
        document.head.innerHTML = "";
    });

    afterEach(() => {
        Reflect.deleteProperty(document, "head");
    });

    it("adds no style element before a panel is built", () => {
        expect(styles()).toHaveLength(0);
    });

    it("adds exactly one style element however many panels are built", () => {
        new DetailPanel(buildPanelElement(), callbacks());
        new DetailPanel(buildPanelElement(), callbacks());

        expect(styles()).toHaveLength(1);
    });

    it("adds one style element to the head and not to the body", () => {
        new DetailPanel(buildPanelElement(), callbacks());

        expect(styles()[0].parentElement).toBe(document.head);
        expect(document.body.querySelectorAll("style")).toHaveLength(0);
    });

    it("writes the shared rules into the style element", () => {
        new DetailPanel(buildPanelElement(), callbacks());

        expect(styles()[0].textContent).toBe(DETAIL_PANEL_CSS);
    });

    it("scopes every rule to the class of the panel markup", () => {
        const selectors = DETAIL_PANEL_CSS.replace(/\/\*[\s\S]*?\*\//g, "")
            .split("}")
            .map((rule) => rule.split("{")[0].trim())
            .filter((selector) => selector !== "");

        expect(selectors.length).toBeGreaterThan(0);

        for (const selector of selectors) {
            expect(selector).toContain(".webtrees-detail-panel");
        }
    });

    it("carries the image, facts, place, title and shadow rules", () => {
        for (const selector of [
            ".webtrees-detail-panel .detail-image {",
            ".webtrees-detail-panel .detail-image[hidden] {",
            ".webtrees-detail-panel .detail-facts dt {",
            ".webtrees-detail-panel .detail-facts dd {",
            ".webtrees-detail-panel .detail-place {",
            ".webtrees-detail-panel .offcanvas-title:focus {",
            ".webtrees-detail-panel.offcanvas-end {",
            '[dir="rtl"] .webtrees-detail-panel.offcanvas-end {',
        ]) {
            expect(DETAIL_PANEL_CSS).toContain(selector);
        }
    });

    it("keeps the name of a module out of the rules", () => {
        expect(DETAIL_PANEL_CSS).not.toMatch(/webtrees-(fan|pedigree|descendants)/);
    });

    it("finds the element of an earlier call and adds nothing", () => {
        ensureDetailPanelStyle();
        ensureDetailPanelStyle();

        expect(styles()).toHaveLength(1);
    });

    it("adds nothing and does not throw in a document without a head", () => {
        Object.defineProperty(document, "head", { value: null, configurable: true });

        expect(() => new DetailPanel(buildPanelElement(), callbacks())).not.toThrow();
        expect(document.querySelectorAll(`style[${DETAIL_PANEL_STYLE_ATTRIBUTE}]`)).toHaveLength(0);
    });
});
