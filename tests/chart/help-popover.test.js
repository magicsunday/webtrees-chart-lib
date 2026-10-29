import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { initHelpPopover, syncHelpMode } from "src/chart/help-popover.js";

function setupDom({ panel = false } = {}) {
    document.body.innerHTML = `
        <input type="hidden" name="showDetailPanel" value="0">
        <input type="checkbox" name="showDetailPanel" value="1"${panel ? " checked" : ""}>
        <div class="position-relative d-inline-block">
            <button class="btn-help" aria-expanded="false" aria-controls="chart-help-popover">
                <span class="icon"><svg viewBox="0 0 1 1"><path id="icon-path" d="M0 0"/></svg></span>
                Help
            </button>
            <div id="chart-help-popover" class="help-popover d-none" role="region">
                <a id="inside" href="#">Inside</a>
                <table>
                    <tr data-help-mode="default"><td>Click on a person</td></tr>
                    <tr data-help-mode="panel" class="d-none"><td>Click or Enter</td></tr>
                    <tr id="always"><td>Ctrl + scroll</td></tr>
                </table>
            </div>
        </div>
        <p id="outside">Outside</p>
    `;
}

const checkbox = () => document.querySelector('input[type="checkbox"][name="showDetailPanel"]');
const rowHidden = (mode) =>
    document.querySelector(`[data-help-mode="${mode}"]`).classList.contains("d-none");
const button = () => document.querySelector(".btn-help");
const popover = () => document.getElementById("chart-help-popover");
const pressKey = (key, target = document.body) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const isClosed = () => popover().classList.contains("d-none");

describe("initHelpPopover", () => {
    let teardown;

    beforeEach(() => {
        setupDom();
        teardown = initHelpPopover();
    });

    afterEach(() => {
        teardown();
    });

    it("opens the popover on click and exposes the state on the button", () => {
        button().click();

        expect(isClosed()).toBe(false);
        expect(button().getAttribute("aria-expanded")).toBe("true");
    });

    it("opens and closes on a click that lands on the icon inside the button", () => {
        const icon = document.getElementById("icon-path");

        icon.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

        expect(isClosed()).toBe(false);
        expect(button().getAttribute("aria-expanded")).toBe("true");

        icon.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

        expect(isClosed()).toBe(true);
    });

    it("closes the popover on the next click", () => {
        button().click();
        button().click();

        expect(isClosed()).toBe(true);
        expect(button().getAttribute("aria-expanded")).toBe("false");
    });

    it("closes an open popover on Escape", () => {
        button().click();

        pressKey("Escape");

        expect(isClosed()).toBe(true);
        expect(button().getAttribute("aria-expanded")).toBe("false");
    });

    it("keeps an open popover open on other keys", () => {
        button().click();

        pressKey("Enter");
        pressKey("a");

        expect(isClosed()).toBe(false);
        expect(button().getAttribute("aria-expanded")).toBe("true");
    });

    it("leaves a closed popover closed on Escape", () => {
        pressKey("Escape");

        expect(isClosed()).toBe(true);
        expect(button().getAttribute("aria-expanded")).toBe("false");
    });

    it("does not let Escape that closed the popover reach other listeners", () => {
        const other = jest.fn();
        document.addEventListener("keydown", other);
        button().click();

        pressKey("Escape");
        document.removeEventListener("keydown", other);

        expect(other).not.toHaveBeenCalled();
    });

    it("lets Escape reach other listeners while the popover is closed", () => {
        const other = jest.fn();
        document.addEventListener("keydown", other);

        pressKey("Escape");
        document.removeEventListener("keydown", other);

        expect(other).toHaveBeenCalledTimes(1);
    });

    it("lets other keys reach other listeners while the popover is open", () => {
        const other = jest.fn();
        document.addEventListener("keydown", other);
        button().click();

        pressKey("Enter");
        document.removeEventListener("keydown", other);

        expect(other).toHaveBeenCalledTimes(1);
    });

    it("returns the focus to the button when Escape closes the popover", () => {
        button().click();
        document.getElementById("inside").focus();
        expect(document.activeElement).toBe(document.getElementById("inside"));

        pressKey("Escape", document.getElementById("inside"));

        expect(document.activeElement).toBe(button());
    });

    it("does not move the focus when Escape finds the popover closed", () => {
        document.getElementById("inside").focus();

        pressKey("Escape");

        expect(document.activeElement).toBe(document.getElementById("inside"));
    });

    it("closes the popover on a click outside of it", () => {
        button().click();

        document.getElementById("outside").click();

        expect(isClosed()).toBe(true);
        expect(button().getAttribute("aria-expanded")).toBe("false");
    });

    it("does not move the focus on a click outside", () => {
        button().click();
        const outside = document.getElementById("outside");
        outside.setAttribute("tabindex", "-1");
        outside.focus();

        outside.click();

        expect(document.activeElement).toBe(outside);
    });

    it("keeps the popover open on a click inside of it", () => {
        button().click();

        document.getElementById("inside").click();
        document.getElementById("always").click();

        expect(isClosed()).toBe(false);
        expect(button().getAttribute("aria-expanded")).toBe("true");
    });

    it("keeps a closed popover closed on a click outside", () => {
        document.getElementById("outside").click();

        expect(isClosed()).toBe(true);
        expect(button().getAttribute("aria-expanded")).toBe("false");
    });

    it("does nothing on a page without a help button", () => {
        document.body.innerHTML = "";

        expect(() => initHelpPopover()).not.toThrow();
        expect(() => pressKey("Escape")).not.toThrow();
    });

    it("does nothing when the button points to a popover that the page does not have", () => {
        document.body.innerHTML =
            '<button class="btn-help" aria-expanded="false" aria-controls="missing">Help</button>';

        expect(() => initHelpPopover()).not.toThrow();
        button().click();

        expect(button().getAttribute("aria-expanded")).toBe("false");
    });

    it("does nothing when the button names no popover", () => {
        document.body.innerHTML =
            '<button class="btn-help" aria-expanded="false">Help</button>' +
            '<div id="chart-help-popover" class="help-popover d-none"></div>';

        expect(() => initHelpPopover()).not.toThrow();
        expect(() => button().click()).not.toThrow();

        expect(button().getAttribute("aria-expanded")).toBe("false");
        expect(isClosed()).toBe(true);
    });

    it("does nothing when the popover has no button", () => {
        document.body.innerHTML = '<div id="chart-help-popover" class="help-popover d-none"></div>';

        expect(() => initHelpPopover()).not.toThrow();
        expect(() => pressKey("Escape")).not.toThrow();
    });

    it("toggles the popover that the button names and no other popover", () => {
        document.body.innerHTML =
            '<div id="chart-help-popover" class="help-popover d-none"></div>' +
            '<button class="btn-help" aria-expanded="false" aria-controls="named">Help</button>' +
            '<div id="named" class="help-popover d-none"></div>';
        initHelpPopover();

        button().click();

        expect(document.getElementById("named").classList.contains("d-none")).toBe(false);
        expect(isClosed()).toBe(true);
    });

    it("binds the popover to its own button and not to another button", () => {
        document.body.insertAdjacentHTML("afterbegin", '<button id="other">Other</button>');
        teardown = initHelpPopover();

        document.getElementById("other").click();
        expect(isClosed()).toBe(true);

        button().click();
        expect(isClosed()).toBe(false);
        expect(button().getAttribute("aria-expanded")).toBe("true");
    });

    it("stops Escape before any bubble listener of the document and before a later capture listener", () => {
        teardown();
        const earlierBubble = jest.fn();
        const earlierCapture = jest.fn();
        const laterCapture = jest.fn();
        document.addEventListener("keydown", earlierBubble);
        document.addEventListener("keydown", earlierCapture, true);
        teardown = initHelpPopover();
        document.addEventListener("keydown", laterCapture, true);
        button().click();

        pressKey("Escape");
        document.removeEventListener("keydown", earlierBubble);
        document.removeEventListener("keydown", earlierCapture, true);
        document.removeEventListener("keydown", laterCapture, true);

        expect(isClosed()).toBe(true);
        expect(earlierBubble).not.toHaveBeenCalled();
        expect(laterCapture).not.toHaveBeenCalled();
        // A capture listener registered before the popover runs before it, so only its call is pinned.
        expect(earlierCapture).toHaveBeenCalledTimes(1);
    });

    it("keeps one set of listeners when an older teardown runs after a newer call", () => {
        teardown();
        const first = initHelpPopover();
        initHelpPopover();
        first();
        teardown = initHelpPopover();

        button().click();

        expect(isClosed()).toBe(false);
        button().click();
        expect(isClosed()).toBe(true);
    });

    it("does not pile up listeners when called twice", () => {
        const second = initHelpPopover();
        teardown = second;

        button().click();
        expect(isClosed()).toBe(false);

        const other = jest.fn();
        document.addEventListener("keydown", other);
        pressKey("Escape");
        document.removeEventListener("keydown", other);

        expect(isClosed()).toBe(true);
        expect(other).not.toHaveBeenCalled();
    });

    it("removes all listeners through the returned function", () => {
        teardown();

        button().click();
        expect(isClosed()).toBe(true);

        popover().classList.remove("d-none");
        pressKey("Escape");
        document.getElementById("outside").click();

        expect(isClosed()).toBe(false);
    });
});

describe("syncHelpMode", () => {
    it("shows the entries of the given mode while the detail panel is off", () => {
        setupDom();
        syncHelpMode("default");

        expect(rowHidden("default")).toBe(false);
        expect(rowHidden("panel")).toBe(true);
    });

    it("takes the name of the mode without the panel from the caller", () => {
        setupDom();
        document
            .querySelector('[data-help-mode="default"]')
            .setAttribute("data-help-mode", "tooltip");
        syncHelpMode("tooltip");

        expect(rowHidden("tooltip")).toBe(false);
        expect(rowHidden("panel")).toBe(true);
    });

    it("shows the panel entries while the detail panel is on", () => {
        setupDom({ panel: true });
        syncHelpMode("default");

        expect(rowHidden("default")).toBe(true);
        expect(rowHidden("panel")).toBe(false);
    });

    it("follows the checkbox of the detail panel on every call", () => {
        setupDom();
        syncHelpMode("default");

        checkbox().checked = true;
        syncHelpMode("default");

        expect(rowHidden("default")).toBe(true);
        expect(rowHidden("panel")).toBe(false);

        checkbox().checked = false;
        syncHelpMode("default");

        expect(rowHidden("default")).toBe(false);
        expect(rowHidden("panel")).toBe(true);
    });

    it("keeps the entries of the chart mode while the checkbox changes without a reload", () => {
        setupDom();
        const teardown = initHelpPopover();
        syncHelpMode("default");

        checkbox().checked = true;
        checkbox().dispatchEvent(new Event("change", { bubbles: true }));
        button().click();
        teardown();

        expect(rowHidden("default")).toBe(false);
        expect(rowHidden("panel")).toBe(true);
    });

    it("leaves the entries that apply to both modes alone", () => {
        setupDom({ panel: true });
        syncHelpMode("default");

        expect(document.getElementById("always").classList.contains("d-none")).toBe(false);
    });

    it("keeps the markup as rendered when the page has no detail panel checkbox", () => {
        setupDom();
        checkbox().remove();
        document.querySelector('[data-help-mode="default"]').classList.add("d-none");
        document.querySelector('[data-help-mode="panel"]').classList.remove("d-none");

        expect(() => syncHelpMode("default")).not.toThrow();
        expect(rowHidden("default")).toBe(true);
        expect(rowHidden("panel")).toBe(false);
    });

    it("reads the checkbox of the detail panel and not another checkbox", () => {
        setupDom();
        document.body.insertAdjacentHTML(
            "afterbegin",
            '<input type="checkbox" name="openNewTabOnClick" value="1" checked>',
        );
        syncHelpMode("default");

        expect(rowHidden("default")).toBe(false);
        expect(rowHidden("panel")).toBe(true);
    });

    it("leaves an element outside the popover alone", () => {
        setupDom({ panel: true });
        document.body.insertAdjacentHTML(
            "beforeend",
            '<div data-help-mode="default" id="outside-row"></div>',
        );
        syncHelpMode("default");

        expect(document.getElementById("outside-row").classList.contains("d-none")).toBe(false);
    });

    it("does nothing on a page without a help popover", () => {
        document.body.innerHTML =
            '<input type="checkbox" name="showDetailPanel" value="1" checked>';

        expect(() => syncHelpMode("default")).not.toThrow();
    });
});
