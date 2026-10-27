/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { readFileSync } from "node:fs";
import { jest } from "@jest/globals";

const { default: DetailPanel } = await import("src/chart/panel/detail-panel.js");

/**
 * Builds the markup the page provides for the panel.
 *
 * @return {HTMLElement}
 */
function buildPanelElement() {
    document.body.innerHTML = `
        <div class="row">
            <aside id="panel" class="offcanvas" hidden>
                <h2 data-panel="title" tabindex="-1"></h2>
                <img data-panel="image" alt="" hidden>
                <p data-panel="hint"></p>
                <dl data-panel="facts"></dl>
                <p data-panel="empty" hidden></p>
                <div data-panel="actions" hidden>
                    <button data-panel="individual"></button>
                    <button data-panel="center"></button>
                </div>
            </aside>
        </div>`;

    return /** @type {HTMLElement} */ (document.getElementById("panel"));
}

/**
 * Builds a panel with recorded callbacks and a fake Bootstrap.
 *
 * @param {{bootstrap?: boolean}} options The state of the window
 */
function build({ bootstrap = true } = {}) {
    const element = buildPanelElement();
    const instance = {
        show: jest.fn(() => element.classList.add("show")),
        hide: jest.fn(() => {
            element.dispatchEvent(new Event("hide.bs.offcanvas"));
            element.classList.remove("show");
        }),
    };
    const getOrCreateInstance = jest.fn(() => instance);
    const callbacks = {
        onIndividual: jest.fn(),
        onCenter: jest.fn(),
        onClose: jest.fn(),
        onHidden: jest.fn(),
    };
    const win = { bootstrap: bootstrap ? { Offcanvas: { getOrCreateInstance } } : undefined };
    const panel = new DetailPanel(element, callbacks, win);

    return { panel, element, instance, getOrCreateInstance, callbacks };
}

const person = {
    name: "Anna Schmidt",
    url: "/individual/I1",
    updateUrl: "/chart/I1",
    generation: 2,
    facts: [
        {
            tag: "BIRT",
            label: "Birth",
            date: "12 MAR 1980",
            place: "Leipzig",
            placeFull: "Leipzig, Sachsen",
            value: "",
        },
        null,
        { tag: "OCCU", label: "Occupation", date: "", place: "", placeFull: "", value: "Teacher" },
    ],
};

describe("DetailPanel offcanvas", () => {
    test("stays hidden until it is enabled", () => {
        const { panel, element } = build();

        expect(element.hidden).toBe(true);

        panel.enable();

        expect(element.hidden).toBe(false);
    });

    test("opens with scrolling on and without a backdrop, so the chart stays usable", () => {
        const { panel, instance, getOrCreateInstance, element } = build();

        panel.select(person);

        expect(getOrCreateInstance).toHaveBeenCalledWith(element, {
            scroll: true,
            backdrop: false,
        });
        expect(instance.show).toHaveBeenCalledTimes(1);
    });

    test("selecting another person replaces the content and shows the offcanvas again", () => {
        const { panel, instance, element } = build();

        panel.select(person);
        panel.select({ ...person, name: "Karl Schmidt" });

        expect(element.querySelector("[data-panel='title']").textContent).toBe("Karl Schmidt");
        expect(instance.show).toHaveBeenCalledTimes(2);
        expect(instance.hide).not.toHaveBeenCalled();
    });

    test("falls back to a visible block when Bootstrap is missing", () => {
        const { panel, element } = build({ bootstrap: false });

        panel.select(person);

        expect(element.classList.contains("show")).toBe(true);
    });

    test("hands the focus back to the chart when the offcanvas is hidden", () => {
        const { element, callbacks } = build();

        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    });

    test("tells the chart that the panel is hidden, after the focus went back", () => {
        const { element, callbacks } = build();
        const calls = [];
        callbacks.onClose.mockImplementation(() => calls.push("close"));
        callbacks.onHidden.mockImplementation(() => calls.push("hidden"));

        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(calls).toEqual(["close", "hidden"]);
    });
});

describe("DetailPanel outside click", () => {
    /**
     * Opens the panel and lets Bootstrap report that it is shown.
     */
    function openPanel() {
        const built = build();

        built.panel.select(person);
        built.element.dispatchEvent(new Event("shown.bs.offcanvas"));

        return built;
    }

    test("closes on a click beside the panel and keeps the focus where the user put it", () => {
        const { instance, element, callbacks } = openPanel();

        document.body.click();

        expect(instance.hide).toHaveBeenCalledTimes(1);

        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).not.toHaveBeenCalled();
        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);
    });

    test("stays open for a click whose target is no element", () => {
        const { instance } = openPanel();

        document.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(instance.hide).not.toHaveBeenCalled();
    });

    test("hands the focus back at the next close after a dismissal whose hide failed", () => {
        const { panel, instance, element, callbacks } = openPanel();

        instance.hide.mockImplementation(() => {
            throw new Error("hide failed");
        });

        expect(() => panel.dismiss()).toThrow("hide failed");

        element.dispatchEvent(new Event("hide.bs.offcanvas"));
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    });

    test("hides on a dismissal by the application and keeps the focus where it is", () => {
        const { panel, instance, element, callbacks } = openPanel();

        panel.dismiss();

        expect(instance.hide).toHaveBeenCalledTimes(1);

        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).not.toHaveBeenCalled();
        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);
    });

    test("leaves a panel that is not shown alone and still hands the focus back at its next close", () => {
        const { panel, instance, element, callbacks } = build();

        panel.dismiss();

        expect(instance.hide).not.toHaveBeenCalled();

        panel.select(person);
        element.dispatchEvent(new Event("shown.bs.offcanvas"));
        element.dispatchEvent(new Event("hide.bs.offcanvas"));
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    });

    test("keeps the focus where it is for two dismissals with a selection in between", () => {
        const { panel, instance, element, callbacks } = openPanel();

        panel.dismiss();
        panel.select(person);
        element.dispatchEvent(new Event("shown.bs.offcanvas"));
        panel.dismiss();
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(instance.hide).toHaveBeenCalledTimes(2);
        expect(callbacks.onClose).not.toHaveBeenCalled();
    });

    test("dismisses a panel that is still opening, as Bootstrap sets the show class at the end", () => {
        const { panel, instance, element, callbacks } = build();

        // The opening transition has not ended, so the element does not carry the show class yet
        instance.show.mockImplementation(() => {});
        panel.select(person);

        expect(element.classList.contains("show")).toBe(false);

        panel.dismiss();

        expect(instance.hide).toHaveBeenCalledTimes(1);

        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).not.toHaveBeenCalled();
        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);
    });

    test("lets the close that began last decide, a normal close after a dismissal returns the focus", () => {
        const { panel, element, callbacks } = openPanel();

        panel.dismiss();
        panel.select(person);
        element.dispatchEvent(new Event("shown.bs.offcanvas"));
        element.dispatchEvent(new Event("hide.bs.offcanvas"));
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).toHaveBeenCalledTimes(1);
        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);

        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).toHaveBeenCalledTimes(1);
        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);
    });

    test("lets the close that began last decide, a dismissal after a normal close keeps the focus", () => {
        const { panel, element, callbacks } = openPanel();

        element.dispatchEvent(new Event("hide.bs.offcanvas"));
        panel.select(person);
        element.dispatchEvent(new Event("shown.bs.offcanvas"));
        panel.dismiss();
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).not.toHaveBeenCalled();
        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);
    });

    test("does not move the focus to the heading when the panel is dismissed while it opens", () => {
        const { panel, instance, element } = build();
        const outside = document.createElement("button");

        document.body.append(outside);
        instance.show.mockImplementation(() => {});
        panel.select(person, true);
        outside.focus();
        panel.dismiss();
        element.dispatchEvent(new Event("shown.bs.offcanvas"));

        expect(document.activeElement).toBe(outside);
    });

    test("does not move the focus to the heading after two selections by key during the opening", () => {
        const { panel, instance, element } = build();
        const outside = document.createElement("button");

        document.body.append(outside);
        instance.show.mockImplementation(() => {});
        panel.select(person, true);
        panel.select(person, true);
        outside.focus();
        panel.dismiss();
        element.dispatchEvent(new Event("shown.bs.offcanvas"));

        expect(document.activeElement).toBe(outside);
    });

    test("moves the focus to the heading once after two selections by key during the opening", () => {
        const { panel, instance, element } = build();
        const title = element.querySelector('[data-panel="title"]');
        const focus = jest.spyOn(title, "focus");

        instance.show.mockImplementation(() => {});
        panel.select(person, true);
        panel.select(person, true);
        element.dispatchEvent(new Event("shown.bs.offcanvas"));

        expect(focus).toHaveBeenCalledTimes(1);
    });

    test("moves the focus to the heading once a panel that was selected by key has opened", () => {
        const { panel, instance, element } = build();

        instance.show.mockImplementation(() => {});
        panel.select(person, true);
        element.dispatchEvent(new Event("shown.bs.offcanvas"));

        expect(document.activeElement).toBe(element.querySelector('[data-panel="title"]'));
    });

    test("ignores a late opening and a late close of a panel that is closed already", () => {
        const { panel, element, callbacks } = openPanel();
        const outsideClick = jest.spyOn(panel, "closeOnOutsideClick");

        panel.dismiss();
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));
        element.dispatchEvent(new Event("shown.bs.offcanvas"));
        document.body.click();

        expect(outsideClick).not.toHaveBeenCalled();

        element.dispatchEvent(new Event("hide.bs.offcanvas"));
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).not.toHaveBeenCalled();
        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);
    });

    test("leaves the running close as it is when the panel is dismissed while it closes", () => {
        const { panel, instance, element, callbacks } = openPanel();

        // A close that a click on the close button began, which returns the focus
        element.dispatchEvent(new Event("hide.bs.offcanvas"));
        // The second hide() finds the panel closing, so no event follows it
        instance.hide.mockImplementationOnce(() => {});
        panel.dismiss();

        expect(instance.hide).toHaveBeenCalledTimes(1);

        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).toHaveBeenCalledTimes(1);
        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);
    });

    test("ends a close once, however many hidden events follow", () => {
        const { panel, element, callbacks } = openPanel();

        panel.dismiss();
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).not.toHaveBeenCalled();
        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);
    });

    test("takes the wish of a dismissal that Bootstrap cancelled not over to the next close", () => {
        const { panel, instance, element, callbacks } = openPanel();

        // A listener of the page cancels the hide, so no hidden event follows
        instance.hide.mockImplementationOnce(() => {
            element.dispatchEvent(new Event("hide.bs.offcanvas"));
        });
        panel.dismiss();

        element.dispatchEvent(new Event("hide.bs.offcanvas"));
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).toHaveBeenCalledTimes(1);

        panel.select(person);
        panel.dismiss();
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    });

    test("closes the fallback block of a page without Bootstrap and reports it hidden", () => {
        const { panel, element, callbacks } = build({ bootstrap: false });

        panel.select(person);

        expect(element.classList.contains("show")).toBe(true);

        panel.dismiss();

        expect(element.classList.contains("show")).toBe(false);
        expect(callbacks.onClose).not.toHaveBeenCalled();
        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);

        // The panel is closed, so a second dismissal has nothing to report
        panel.dismiss();

        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);
    });

    test("leaves the chart alone when a person opened the panel again while it was closing", () => {
        const { element, callbacks, panel } = openPanel();

        // The close that began before the click on the person reports its end after the panel
        // was shown again, so it must neither return the focus nor clear the new selection.
        element.dispatchEvent(new Event("hide.bs.offcanvas"));
        panel.select(person);
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).not.toHaveBeenCalled();
        expect(callbacks.onHidden).not.toHaveBeenCalled();
    });

    test("keeps listening for a click beside the panel after a person reopened it while it was closing", () => {
        const { instance, element, panel } = openPanel();

        element.dispatchEvent(new Event("hide.bs.offcanvas"));
        panel.select(person);
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));
        document.body.click();

        expect(instance.hide).toHaveBeenCalledTimes(1);
    });

    test("hands the focus back at a later close after a reopened close skipped it", () => {
        const { instance, element, callbacks, panel } = openPanel();

        // A click beside the panel starts the close and asks to keep the focus where it is,
        // then a person reopens the panel before that close has ended.
        document.body.click();
        panel.select(person);
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).not.toHaveBeenCalled();

        // The panel is closed again by its own button, which has nothing to do with that click.
        element.dispatchEvent(new Event("shown.bs.offcanvas"));
        instance.hide();
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).toHaveBeenCalledTimes(1);
        expect(callbacks.onHidden).toHaveBeenCalledTimes(1);
    });

    test("stays open on a click inside the panel", () => {
        const { instance, element } = openPanel();

        element.querySelector("[data-panel='title']").click();

        expect(instance.hide).not.toHaveBeenCalled();
    });

    test("stays open on a click on a person, which only swaps the content", () => {
        const { instance } = openPanel();
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");

        group.setAttribute("class", "person");
        group.appendChild(rect);
        svg.appendChild(group);
        document.body.appendChild(svg);

        rect.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(instance.hide).not.toHaveBeenCalled();
    });

    test("does not react before the panel is shown, so the opening click cannot close it", () => {
        const { instance, panel } = build();

        panel.select(person);
        document.body.click();

        expect(instance.hide).not.toHaveBeenCalled();
    });

    test("stops listening once the panel is hidden", () => {
        const { panel, instance, element } = openPanel();
        const outsideClick = jest.spyOn(panel, "closeOnOutsideClick");

        document.body.click();

        expect(outsideClick).toHaveBeenCalledTimes(1);

        element.dispatchEvent(new Event("hide.bs.offcanvas"));
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));
        document.body.click();

        expect(outsideClick).toHaveBeenCalledTimes(1);
        expect(instance.hide).toHaveBeenCalledTimes(1);
    });
});

describe("DetailPanel escape and semantics", () => {
    function openPanel() {
        const built = build();

        built.panel.select(person);
        built.element.dispatchEvent(new Event("shown.bs.offcanvas"));

        return built;
    }

    test("closes on Escape while the focus is on the chart and keeps the focus there", () => {
        const { instance, element, callbacks } = openPanel();

        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(instance.hide).toHaveBeenCalledTimes(1);

        element.dispatchEvent(new Event("hidden.bs.offcanvas"));

        expect(callbacks.onClose).not.toHaveBeenCalled();
    });

    test("leaves Escape inside the panel to Bootstrap, which hands the focus back", () => {
        const { instance, element } = openPanel();

        element
            .querySelector("[data-panel='title']")
            .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(instance.hide).not.toHaveBeenCalled();
    });

    test("ignores every other key and stops listening once hidden", () => {
        const { panel, instance, element } = openPanel();
        const escapeHandler = jest.spyOn(panel, "closeOnEscape");

        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

        expect(instance.hide).not.toHaveBeenCalled();
        expect(escapeHandler).toHaveBeenCalledTimes(1);

        element.dispatchEvent(new Event("hide.bs.offcanvas"));
        element.dispatchEvent(new Event("hidden.bs.offcanvas"));
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(escapeHandler).toHaveBeenCalledTimes(1);
        expect(instance.hide).not.toHaveBeenCalled();
    });

    test("is no modal dialog, as the chart stays usable beside it", () => {
        const built = build();

        // Bootstrap sets these when it shows the offcanvas
        built.element.setAttribute("role", "dialog");
        built.element.setAttribute("aria-modal", "true");
        built.panel.select(person);
        built.element.dispatchEvent(new Event("shown.bs.offcanvas"));

        expect(built.element.hasAttribute("aria-modal")).toBe(false);
        expect(built.element.getAttribute("role")).toBe("complementary");
    });
});

describe("DetailPanel focus", () => {
    /**
     * Puts the focus on a control outside of the panel, as a user who works in the chart has it.
     *
     * @return {HTMLButtonElement}
     */
    function focusOutside() {
        const outside = document.createElement("button");

        document.body.appendChild(outside);
        outside.focus();

        return outside;
    }

    test("moves the focus to the heading once the offcanvas is shown after a keyboard selection", () => {
        const { panel, element } = build();
        const title = element.querySelector("[data-panel='title']");

        panel.select(person, true);

        expect(document.activeElement).not.toBe(title);

        element.dispatchEvent(new Event("shown.bs.offcanvas"));

        expect(document.activeElement).toBe(title);
    });

    test("moves the focus at once when the offcanvas is already shown", () => {
        const { panel, element } = build();
        const title = element.querySelector("[data-panel='title']");

        panel.select(person);
        panel.select(person, true);

        expect(document.activeElement).toBe(title);
    });

    test("moves the focus to the heading at once without Bootstrap after a keyboard selection", () => {
        const { panel, element } = build({ bootstrap: false });

        panel.select(person, true);

        expect(document.activeElement).toBe(element.querySelector("[data-panel='title']"));
    });

    test("leaves the focus alone without Bootstrap after a selection with the mouse", () => {
        const { panel } = build({ bootstrap: false });
        const outside = focusOutside();

        panel.select(person, false);

        expect(document.activeElement).toBe(outside);
    });

    test("moves the focus to the heading only at the opening that asked for it", () => {
        const { panel, instance, element } = build();
        const title = element.querySelector("[data-panel='title']");
        const focus = jest.spyOn(title, "focus");

        instance.show.mockImplementation(() => {});
        panel.select(person, true);
        element.dispatchEvent(new Event("shown.bs.offcanvas"));
        panel.select(person, false);
        element.dispatchEvent(new Event("shown.bs.offcanvas"));

        expect(focus).toHaveBeenCalledTimes(1);
    });

    test("leaves the focus alone when a mouse selection follows a keyboard selection during the opening", () => {
        const { panel, instance, element } = build();
        const title = element.querySelector("[data-panel='title']");
        const focus = jest.spyOn(title, "focus");

        instance.show.mockImplementation(() => {});
        panel.select(person, true);
        panel.select(person, false);
        element.dispatchEvent(new Event("shown.bs.offcanvas"));

        expect(focus).not.toHaveBeenCalled();
    });

    test("throws an error that names the part a panel element lacks", () => {
        const element = buildPanelElement();

        element.querySelector("[data-panel='empty']").remove();

        expect(() => new DetailPanel(element, {}, { bootstrap: undefined })).toThrow(
            'The detail panel has no part "empty"',
        );
    });

    test("leaves the focus alone after a selection with the mouse", () => {
        const { panel, element } = build();
        const outside = focusOutside();

        panel.select(person, false);
        element.dispatchEvent(new Event("shown.bs.offcanvas"));

        expect(document.activeElement).toBe(outside);
    });
});

describe("DetailPanel content", () => {
    test("writes the name and one row per present fact", () => {
        const { panel, element } = build();

        panel.select(person);

        expect(element.querySelector("[data-panel='title']").textContent).toBe("Anna Schmidt");

        const terms = [...element.querySelectorAll("dt")].map((term) => term.textContent);

        expect(terms).toEqual(["Birth", "Occupation"]);
        expect(element.querySelector(".detail-date").textContent).toBe("12 MAR 1980");
        expect(element.querySelector(".detail-place").textContent).toBe("Leipzig, Sachsen");
        expect(element.querySelector(".detail-place").title).toBe("");
        expect(element.querySelector(".detail-value").textContent).toBe("Teacher");
    });

    test("shows the value first, then the date and the place", () => {
        const { panel, element } = build();

        panel.select({
            ...person,
            facts: [
                {
                    label: "Occupation",
                    date: "01.10.2008",
                    place: "",
                    placeFull: "Wurzen, Sachsen",
                    value: "Clerk",
                },
            ],
        });

        const classes = [...element.querySelector("dd").children].map((line) => line.className);

        expect(classes).toEqual(["detail-value", "detail-date", "detail-place"]);
    });

    test("shows the other spouse of a family event first, and writes it as text", () => {
        const { panel, element } = build();
        const hostile = '<img src=x onerror="window.pwned=1">';

        panel.select({
            ...person,
            facts: [
                {
                    label: "Marriage",
                    date: "05 MAY 1950",
                    place: "",
                    placeFull: "Wurzen, Sachsen",
                    value: "",
                    partner: hostile,
                },
            ],
        });

        const lines = [...element.querySelector("dd").children];

        expect(lines.map((line) => line.className)).toEqual([
            "detail-partner",
            "detail-date",
            "detail-place",
        ]);
        expect(lines[0].textContent).toBe(hostile);
        expect(element.querySelector("[data-panel='facts'] img")).toBeNull();
    });

    describe("order of the facts", () => {
        const fact = (label, sortDay) => ({
            label,
            date: "",
            place: "",
            placeFull: "",
            value: label,
            partner: "",
            ...(sortDay === undefined ? {} : { sortDay }),
        });

        const labelsOf = (element) =>
            [...element.querySelectorAll("dt")].map((term) => term.textContent);

        test("keeps the birth first and the death last and sorts the rest by time", () => {
            const { panel, element } = build();

            panel.select({
                ...person,
                // The birth is dated after one fact and the death before another, so a sort that
                // treats every slot alike would move them.
                facts: [
                    fact("Birth", 2406000),
                    fact("Death", 2401000),
                    fact("Marriage", 2415000),
                    fact("Occupation", 2405000),
                    fact("Residence", 2410000),
                ],
            });

            expect(labelsOf(element)).toEqual([
                "Birth",
                "Occupation",
                "Residence",
                "Marriage",
                "Death",
            ]);
        });

        test("keeps a fact without a usable date at its place among the others", () => {
            const { panel, element } = build();

            panel.select({
                ...person,
                facts: [
                    fact("Birth", 2400000),
                    null,
                    fact("Late", 2420000),
                    fact("Note", 0),
                    fact("Early", 2410000),
                ],
            });

            expect(labelsOf(element)).toEqual(["Birth", "Early", "Note", "Late"]);
        });

        test("keeps the order of the payload when it carries no sort day", () => {
            const { panel, element } = build();

            panel.select({
                ...person,
                facts: [fact("Birth"), fact("Death"), fact("Second"), fact("First")],
            });

            expect(labelsOf(element)).toEqual(["Birth", "Second", "First", "Death"]);
        });

        test("keeps the death last when the birth slot is empty", () => {
            const { panel, element } = build();

            panel.select({
                ...person,
                facts: [
                    null,
                    fact("Death", 2401000),
                    fact("Late", 2420000),
                    fact("Early", 2410000),
                ],
            });

            expect(labelsOf(element)).toEqual(["Early", "Late", "Death"]);
        });

        test("treats a sort day that is no positive number as no date", () => {
            const { panel, element } = build();

            panel.select({
                ...person,
                facts: [
                    null,
                    null,
                    fact("Late", 2420000),
                    fact("Text", "abc"),
                    fact("Negative", -5),
                    fact("Early", 2410000),
                ],
            });

            expect(labelsOf(element)).toEqual(["Early", "Text", "Negative", "Late"]);
        });

        test("does not sort the facts of the same day away from their payload order", () => {
            const { panel, element } = build();

            panel.select({
                ...person,
                facts: [null, null, fact("A", 2410000), fact("B", 2410000)],
            });

            expect(labelsOf(element)).toEqual(["A", "B"]);
        });
    });

    test("shows the other spouse before the value, the date and the place", () => {
        const { panel, element } = build();

        panel.select({
            ...person,
            facts: [
                {
                    label: "Marriage",
                    date: "05 MAY 1950",
                    place: "",
                    placeFull: "Wurzen, Sachsen",
                    value: "Civil",
                    partner: "Anna Schmidt",
                },
            ],
        });

        const classes = [...element.querySelector("dd").children].map((line) => line.className);

        expect(classes).toEqual(["detail-partner", "detail-value", "detail-date", "detail-place"]);
    });

    test("leaves the partner line out when the payload has none", () => {
        const { panel, element } = build();

        panel.select(person);

        expect(element.querySelector(".detail-partner")).toBeNull();
    });

    test("shows the short place when the payload has no full name", () => {
        const { panel, element } = build();

        panel.select({
            ...person,
            facts: [{ label: "Birth", date: "", place: "Rom", placeFull: "", value: "" }],
        });

        expect(element.querySelector(".detail-place").textContent).toBe("Rom");
    });

    test("does not show the GEDCOM value Y, which only says that the event took place", () => {
        const { panel, element } = build();

        panel.select({
            ...person,
            facts: [
                { label: "Birth", date: "", place: "", placeFull: "", value: "Y" },
                { label: "Occupation", date: "", place: "", placeFull: "", value: "Y2" },
            ],
        });

        expect(element.querySelector(".detail-value").textContent).toBe("Y2");
    });

    test("leaves out a fact that has nothing to show and notes an empty panel", () => {
        const { panel, element } = build();

        panel.select({
            ...person,
            facts: [{ label: "Birth", date: "", place: "", placeFull: "", value: "Y" }],
        });

        expect(element.querySelectorAll("dt")).toHaveLength(0);
        expect(element.querySelector("[data-panel='empty']").hidden).toBe(false);
    });

    test("replaces the content of the previous person", () => {
        const { panel, element } = build();

        panel.select(person);
        panel.select({ ...person, name: "Karl Schmidt", facts: [] });

        expect(element.querySelector("[data-panel='title']").textContent).toBe("Karl Schmidt");
        expect(element.querySelectorAll("dt")).toHaveLength(0);
    });

    test("shows a note instead of facts when the payload has none", () => {
        const { panel, element } = build();

        panel.select({ name: "Anna", url: "/i", updateUrl: "/u", generation: 2 });

        expect(element.querySelector("[data-panel='empty']").hidden).toBe(false);
        expect(element.querySelector("[data-panel='hint']").hidden).toBe(true);
    });

    test("survives malformed fact entries", () => {
        const { panel, element } = build();

        panel.select({
            ...person,
            facts: [5, "text", [], undefined, { label: null, date: undefined, value: 7 }],
        });

        expect(element.querySelectorAll("dt")).toHaveLength(1);
    });

    test("writes hostile values as text and builds no element from them", () => {
        const { panel, element } = build();
        const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
        const toStringObject = { toString: () => "<b>bold</b>" };

        panel.select({
            ...person,
            name: hostile,
            facts: [
                {
                    label: hostile,
                    date: hostile,
                    place: "",
                    placeFull: hostile,
                    value: hostile,
                },
                {
                    label: "__proto__",
                    date: "",
                    place: "",
                    placeFull: toStringObject,
                    value: "constructor",
                },
            ],
        });

        expect(element.querySelector("[data-panel='facts'] img")).toBeNull();
        expect(element.querySelector("script")).toBeNull();
        expect(element.querySelector("b")).toBeNull();
        expect(element.querySelector("[data-panel='title']").textContent).toBe(hostile);
        expect(element.querySelector(".detail-value").textContent).toBe(hostile);

        const places = [...element.querySelectorAll(".detail-place")];

        expect(places.map((place) => place.textContent)).toEqual([hostile, "<b>bold</b>"]);
    });

    test("never writes person text through an HTML sink", () => {
        const source = readFileSync("src/chart/panel/detail-panel.js", "utf8");

        expect(source).not.toMatch(/innerHTML|insertAdjacentHTML|\.html\(/);
    });
});

describe("DetailPanel image", () => {
    const imageOf = (element) => element.querySelector("[data-panel='image']");

    test("shows the thumbnail of the person", () => {
        const { panel, element } = build();

        panel.select({ ...person, thumbnail: "/thumb/anna.jpg", silhouette: "/sil/f.svg" });

        expect(imageOf(element).getAttribute("src")).toBe("/thumb/anna.jpg");
        expect(imageOf(element).hidden).toBe(false);
    });

    test("falls back to the silhouette when the thumbnail cannot be loaded", () => {
        const { panel, element } = build();

        panel.select({ ...person, thumbnail: "/thumb/gone.jpg", silhouette: "/sil/f.svg" });
        imageOf(element).dispatchEvent(new Event("error"));

        expect(imageOf(element).getAttribute("src")).toBe("/sil/f.svg");
        expect(imageOf(element).hidden).toBe(false);
    });

    test("keeps the image hidden for a person with a silhouette but no thumbnail", () => {
        const { panel, element } = build();

        panel.select({ ...person, thumbnail: "", silhouette: "/sil/f.svg" });
        imageOf(element).dispatchEvent(new Event("error"));

        expect(imageOf(element).hidden).toBe(true);
        expect(imageOf(element).hasAttribute("src")).toBe(false);
    });

    test("hides the image when the silhouette fails as well, without looping", () => {
        const { panel, element } = build();

        panel.select({ ...person, thumbnail: "/thumb/gone.jpg", silhouette: "/sil/f.svg" });
        imageOf(element).dispatchEvent(new Event("error"));
        imageOf(element).dispatchEvent(new Event("error"));

        expect(imageOf(element).hidden).toBe(true);
    });

    test("hides the image when the person has no thumbnail, as the box shows no silhouette then", () => {
        const { panel, element } = build();

        panel.select({ ...person, thumbnail: "", silhouette: "/sil/f.svg" });

        expect(imageOf(element).hidden).toBe(true);
        expect(imageOf(element).hasAttribute("src")).toBe(false);
    });

    test("hides the image for a payload without image fields", () => {
        const { panel, element } = build();

        panel.select(person);

        expect(imageOf(element).hidden).toBe(true);
    });

    test("hides the image on the first error when there is no silhouette", () => {
        const { panel, element } = build();

        panel.select({ ...person, thumbnail: "/thumb/gone.jpg" });
        imageOf(element).dispatchEvent(new Event("error"));

        expect(imageOf(element).hidden).toBe(true);
    });

    test("shows the image again for the next person after both images failed", () => {
        const { panel, element } = build();

        panel.select({ ...person, thumbnail: "/thumb/a.jpg", silhouette: "/sil/a.svg" });
        imageOf(element).dispatchEvent(new Event("error"));
        imageOf(element).dispatchEvent(new Event("error"));
        panel.select({ ...person, thumbnail: "/thumb/b.jpg", silhouette: "/sil/b.svg" });

        expect(imageOf(element).hidden).toBe(false);
        expect(imageOf(element).getAttribute("src")).toBe("/thumb/b.jpg");
    });

    test("selecting a person without a thumbnail clears the image of the previous person", () => {
        const { panel, element } = build();

        panel.select({ ...person, thumbnail: "/thumb/anna.jpg", silhouette: "/sil/f.svg" });
        panel.select({ ...person, name: "Karl Schmidt" });

        expect(imageOf(element).hidden).toBe(true);
        expect(imageOf(element).hasAttribute("src")).toBe(false);
    });

    test("falls back to the silhouette of the person that is shown", () => {
        const { panel, element } = build();

        panel.select({ ...person, thumbnail: "/thumb/a.jpg", silhouette: "/sil/a.svg" });
        panel.select({ ...person, thumbnail: "/thumb/b.jpg", silhouette: "/sil/b.svg" });
        imageOf(element).dispatchEvent(new Event("error"));

        expect(imageOf(element).getAttribute("src")).toBe("/sil/b.svg");
    });
});

describe("DetailPanel actions", () => {
    test("offers both buttons for a person below the root and hands them the URLs", () => {
        const { panel, element, callbacks } = build();

        panel.select(person);

        element.querySelector("[data-panel='individual']").click();
        element.querySelector("[data-panel='center']").click();

        expect(callbacks.onIndividual).toHaveBeenCalledWith("/individual/I1");
        expect(callbacks.onCenter).toHaveBeenCalledWith("/chart/I1");
        expect(element.querySelector("[data-panel='actions']").hidden).toBe(false);
    });

    test("offers no centring for the root person", () => {
        const { panel, element } = build();

        panel.select({ ...person, generation: 1 });

        expect(element.querySelector("[data-panel='center']").hidden).toBe(true);
        expect(element.querySelector("[data-panel='individual']").hidden).toBe(false);
    });

    test("hides the individual button for a person without a URL", () => {
        const { panel, element } = build();

        panel.select({ ...person, url: "" });

        expect(element.querySelector("[data-panel='individual']").hidden).toBe(true);
    });

    test("does nothing for a button without a URL", () => {
        const { panel, element, callbacks } = build();

        panel.select({ ...person, url: "", updateUrl: "" });
        element.querySelector("[data-panel='individual']").click();
        element.querySelector("[data-panel='center']").click();

        expect(callbacks.onIndividual).not.toHaveBeenCalled();
        expect(callbacks.onCenter).not.toHaveBeenCalled();
    });
});
