import { afterEach, describe, expect, it } from "@jest/globals";
import {
    ensureHelpPopoverStyle,
    HELP_POPOVER_CSS,
    HELP_POPOVER_STYLE_ATTRIBUTE,
} from "src/chart/help-popover-style.js";

const styles = () => document.head.querySelectorAll(`style[${HELP_POPOVER_STYLE_ATTRIBUTE}]`);

/**
 * Returns the declarations of the rule with exactly this selector, read from the CSS text of the
 * popover, as a map of property to value.
 */
function declarationsOf(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(HELP_POPOVER_CSS);

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

describe("ensureHelpPopoverStyle", () => {
    afterEach(() => {
        Reflect.deleteProperty(document, "head");
        styles().forEach((style) => {
            style.remove();
        });
    });

    it("adds the rules of the popover to the head as one style element", () => {
        ensureHelpPopoverStyle();

        expect(styles()).toHaveLength(1);
        expect(styles()[0].textContent).toBe(HELP_POPOVER_CSS);
    });

    it("adds nothing on a further call", () => {
        ensureHelpPopoverStyle();
        ensureHelpPopoverStyle();

        expect(styles()).toHaveLength(1);
    });

    it("adds nothing and does not throw in a document without a head", () => {
        Object.defineProperty(document, "head", { value: null, configurable: true });

        expect(() => ensureHelpPopoverStyle()).not.toThrow();

        Reflect.deleteProperty(document, "head");

        expect(styles()).toHaveLength(0);
    });

    it("adds the element again after the page lost it", () => {
        ensureHelpPopoverStyle();
        styles()[0].remove();
        ensureHelpPopoverStyle();

        expect(styles()).toHaveLength(1);
    });
});

describe("HELP_POPOVER_CSS", () => {
    it("scopes the rule to the popover class that the view carries", () => {
        expect(HELP_POPOVER_CSS).toMatch(/^\.help-popover \{/m);
    });

    it("bounds the minimum width of the popover by the viewport", () => {
        expect(declarationsOf(".help-popover")["min-width"]).toBe("min(400px, calc(100vw - 2rem))");
    });

    it("bounds the maximum width of the popover by the viewport", () => {
        expect(declarationsOf(".help-popover")["max-width"]).toBe("calc(100vw - 2rem)");
    });

    it("lifts the popover above the chart", () => {
        expect(declarationsOf(".help-popover")["z-index"]).toBe("1000");
    });
});
