import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import DetailPanel from "src/chart/panel/detail-panel.js";
import {
    DETAIL_PANEL_CSS,
    DETAIL_PANEL_STYLE_ATTRIBUTE,
    ensureDetailPanelStyle,
} from "src/chart/panel/detail-panel-style.js";

/**
 * Returns the declarations of the rule with exactly this selector, read from the CSS text of the
 * style element, as a map of property to value.
 */
function declarationsOf(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(
        `(?:^|\\})\\s*(?:/\\*[\\s\\S]*?\\*/\\s*)*${escaped}\\s*\\{([^}]*)\\}`,
    ).exec(css);

    expect(match).not.toBeNull();

    return Object.fromEntries(
        match[1]
            .split(";")
            .map((declaration) => declaration.trim())
            .filter((declaration) => declaration !== "")
            .map((declaration) => {
                const separator = declaration.indexOf(":");

                return [
                    declaration.slice(0, separator).trim(),
                    declaration.slice(separator + 1).trim(),
                ];
            }),
    );
}

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

    it("adds exactly one style element however many panels are built", () => {
        new DetailPanel(buildPanelElement(), callbacks());
        new DetailPanel(buildPanelElement(), callbacks());

        expect(styles()).toHaveLength(1);
    });

    it("marks the style element with the attribute that the README documents", () => {
        expect(DETAIL_PANEL_STYLE_ATTRIBUTE).toBe("data-webtrees-detail-panel-style");
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

    it("renders the image as a round, fully visible picture and keeps a hidden image hidden", () => {
        new DetailPanel(buildPanelElement(), callbacks());
        const css = styles()[0].textContent;

        const image = declarationsOf(css, ".webtrees-detail-panel .detail-image");
        expect(image["border-radius"]).toBe("50%");
        expect(image["object-fit"]).toBe("contain");

        const hidden = declarationsOf(css, ".webtrees-detail-panel .detail-image[hidden]");
        expect(hidden.display).toBe("none");
    });

    it("casts the shadow to the chart side and mirrors it in a right-to-left page", () => {
        new DetailPanel(buildPanelElement(), callbacks());
        const css = styles()[0].textContent;

        const leftToRight = declarationsOf(css, ".webtrees-detail-panel.offcanvas-end");
        expect(leftToRight["box-shadow"]).toMatch(/^-0\.75rem 0 /);

        const rightToLeft = declarationsOf(css, '[dir="rtl"] .webtrees-detail-panel.offcanvas-end');
        expect(rightToLeft["box-shadow"]).toMatch(/^0\.75rem 0 /);
    });

    it("leaves a foreign style element alone and adds its own", () => {
        document.head.innerHTML = '<style id="other">p { color: red; }</style>';

        new DetailPanel(buildPanelElement(), callbacks());

        expect(styles()).toHaveLength(1);
        expect(styles()[0].id).toBe("");
        expect(document.head.querySelectorAll("style")).toHaveLength(2);
        expect(document.getElementById("other").textContent).toBe("p { color: red; }");
    });

    it("pins the remaining declarations of the panel rules", () => {
        new DetailPanel(buildPanelElement(), callbacks());
        const css = styles()[0].textContent;
        const rule = (selector) => declarationsOf(css, `.webtrees-detail-panel ${selector}`);

        expect(rule(".detail-image").width).toBe("9rem");
        expect(rule(".detail-image").height).toBe("9rem");
        expect(rule(".detail-facts dt")["font-weight"]).toBe("600");
        expect(rule(".detail-facts dd")["margin-bottom"]).toBe("0");
        expect(rule(".detail-place")["font-style"]).toBe("italic");
        expect(rule(".offcanvas-title:focus").outline).toBe("none");
        expect(rule(".detail-image").margin).toBe("0 auto 1rem");
        expect(rule(".detail-image").border).toBe("3px solid var(--bs-border-color, #dee2e6)");
        expect(rule(".detail-facts dt")["margin-top"]).toBe("0.75rem");
        expect(rule(".detail-image").background).toBeUndefined();
        expect(rule(".detail-image")["background-color"]).toBe("var(--bs-secondary-bg, #e9ecef)");
        expect(declarationsOf(css, ".webtrees-detail-panel.offcanvas-end")["box-shadow"]).toBe(
            "-0.75rem 0 1.5rem rgba(0, 0, 0, 0.25)",
        );
        expect(
            declarationsOf(css, '[dir="rtl"] .webtrees-detail-panel.offcanvas-end')["box-shadow"],
        ).toBe("0.75rem 0 1.5rem rgba(0, 0, 0, 0.25)");
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
