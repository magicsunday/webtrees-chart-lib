/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Removes the listeners of the popover that the last call of initHelpPopover() wired.
 *
 * @type {(() => void)|null}
 */
let activeTeardown = null;

/**
 * Shows the help entries of the active mode and hides the entries of the other modes. The
 * mode is "panel" while the checkbox of the detail panel is checked, otherwise the name that
 * the module passes for its mode without the panel. The chart takes its mode when its data
 * is loaded, so the page calls this where it loads the chart, and the entries keep describing
 * the chart in between. Without the checkbox the markup stays as rendered.
 *
 * @param {string} inactiveMode Name of the mode without the detail panel
 *
 * @returns {void}
 */
export function syncHelpMode(inactiveMode) {
    const panelCheckbox = /** @type {HTMLInputElement|null} */ (
        document.querySelector('input[type="checkbox"][name="showDetailPanel"]')
    );

    if (!panelCheckbox) {
        return;
    }

    const mode = panelCheckbox.checked ? "panel" : inactiveMode;

    document.querySelectorAll(".help-popover [data-help-mode]").forEach((entry) => {
        entry.classList.toggle("d-none", entry.getAttribute("data-help-mode") !== mode);
    });
}

/**
 * Wires the help button of the toolbar (`.btn-help`, which points to its popover with
 * aria-controls) to the popover. A click toggles the popover and mirrors the state in
 * aria-expanded on the button. Escape closes an open popover first, stops the event for the
 * listeners that run after it (a later capture listener of the document and the bubble phase
 * up to the window) such as the detail panel, and returns the focus to the button.
 * A click outside the popover and the button closes the popover without moving the focus.
 * It adds the rules of the popover (its width bound by the viewport and its stacking order) to
 * the page once. A page without a help button is left alone and gets no rules.
 *
 * A second call removes the listeners of the first, so they never pile up. The returned
 * function removes them as well.
 *
 * @returns {() => void} Removes the listeners that this call added
 */
export function initHelpPopover() {
    activeTeardown?.();
    activeTeardown = null;

    const button = document.querySelector(".btn-help");
    const popoverId = button?.getAttribute("aria-controls");
    const popover = popoverId ? document.getElementById(popoverId) : null;

    if (!button || !popover) {
        return () => {};
    }

    /**
     * Shows or hides the popover and mirrors the state on the button.
     *
     * @param {boolean} open Whether the popover is shown
     */
    const setOpen = (open) => {
        popover.classList.toggle("d-none", !open);
        button.setAttribute("aria-expanded", String(open));
    };

    const isOpen = () => !popover.classList.contains("d-none");

    const onButtonClick = () => {
        setOpen(!isOpen());
    };

    const onKeydown = (/** @type {KeyboardEvent} */ event) => {
        if (event.key !== "Escape" || !isOpen()) {
            return;
        }

        event.stopImmediatePropagation();
        setOpen(false);
        /** @type {HTMLElement} */ (button).focus();
    };

    const onDocumentClick = (/** @type {MouseEvent} */ event) => {
        const target = /** @type {Node|null} */ (event.target);

        if (isOpen() && !popover.contains(target) && !button.contains(target)) {
            setOpen(false);
        }
    };

    button.addEventListener("click", onButtonClick);
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("click", onDocumentClick);

    const teardown = () => {
        button.removeEventListener("click", onButtonClick);
        document.removeEventListener("keydown", onKeydown, true);
        document.removeEventListener("click", onDocumentClick);

        if (activeTeardown === teardown) {
            activeTeardown = null;
        }
    };

    activeTeardown = teardown;

    return teardown;
}
