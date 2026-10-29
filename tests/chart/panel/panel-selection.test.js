/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { describe, expect, jest, test } from "@jest/globals";
import { select } from "d3-selection";

const { default: PanelSelection } = await import("src/chart/panel/panel-selection.js");

/**
 * Builds the datum of a person the way the charts bind it, a hierarchy node whose data is
 * the node datum that carries the person.
 *
 * @param {string} xref The xref of the person
 * @param {string} name The name of the person
 */
function node(xref, name = "") {
    const datum = { data: { xref, name } };

    return { data: datum, datum };
}

/**
 * Draws one `g.person` element per datum into a fresh svg and returns the visual.
 *
 * @param {{data: object}[]} nodes The hierarchy nodes to bind
 */
function draw(nodes) {
    document.body.innerHTML = "";

    const svg = select(document.body).append("svg");
    const visual = svg.append("g");

    visual.selectAll("g.person").data(nodes).enter().append("g").attr("class", "person");

    return visual;
}

describe("PanelSelection marks", () => {
    test("marks the selected person and nobody else", () => {
        const first = node("I1");
        const second = node("I2");
        const visual = draw([first, second]);
        const selection = new PanelSelection(() => visual);

        selection.select(second.data);

        const marked = [...document.querySelectorAll("g.person")].map((element) => ({
            selected: element.classList.contains("selected"),
            current: element.getAttribute("aria-current"),
        }));

        expect(marked).toEqual([
            { selected: false, current: null },
            { selected: true, current: "true" },
        ]);
    });

    test("marks nobody while nothing is selected", () => {
        const visual = draw([node("I1")]);

        new PanelSelection(() => visual).apply();

        expect(document.querySelectorAll("g.person.selected")).toHaveLength(0);
    });

    test("marks no person without an xref while nothing is selected", () => {
        const visual = draw([node(null)]);

        new PanelSelection(() => visual).apply();

        expect(document.querySelectorAll("g.person.selected")).toHaveLength(0);
        expect(document.querySelectorAll("g.person[aria-current]")).toHaveLength(0);
    });

    test("applies the mark again to elements that were created anew", () => {
        const person = node("I1");
        let visual = draw([person]);
        const selection = new PanelSelection(() => visual);

        selection.select(person.data);
        visual = draw([node("I1"), node("I2")]);
        selection.apply();

        expect(document.querySelectorAll("g.person.selected")).toHaveLength(1);
    });

    test("clears the marks and forgets the person", () => {
        const person = node("I1");
        const visual = draw([person]);
        const selection = new PanelSelection(() => visual);
        const element = /** @type {any} */ (document.querySelector("g.person"));
        const focus = jest.fn();

        element.focus = focus;
        selection.select(person.data);

        expect(element.classList.contains("selected")).toBe(true);

        selection.clear();
        selection.restoreFocus();

        expect(element.classList.contains("selected")).toBe(false);
        expect(element.hasAttribute("aria-current")).toBe(false);
        expect(focus).not.toHaveBeenCalled();
    });

    test("moves the mark when another person is selected", () => {
        const first = node("I1");
        const second = node("I2");
        const visual = draw([first, second]);
        const selection = new PanelSelection(() => visual);

        selection.select(first.data);
        selection.select(second.data);

        const marked = [...document.querySelectorAll("g.person")].map((element) => ({
            selected: element.classList.contains("selected"),
            current: element.getAttribute("aria-current"),
        }));

        expect(marked).toEqual([
            { selected: false, current: null },
            { selected: true, current: "true" },
        ]);
    });

    test("marks nobody when the selected person is not in the chart", () => {
        const visual = draw([node("I1")]);
        const selection = new PanelSelection(() => visual);

        selection.select(node("I9").data);

        expect(document.querySelectorAll("g.person.selected")).toHaveLength(0);
    });

    test("marks every occurrence of the selected person", () => {
        const visual = draw([node("I1"), node("I2"), node("I1")]);
        const selection = new PanelSelection(() => visual);

        selection.select(node("I1").data);

        const marked = [...document.querySelectorAll("g.person")].map((element) =>
            element.classList.contains("selected"),
        );

        expect(marked).toEqual([true, false, true]);
    });

    test("does nothing before the first draw", () => {
        const selection = new PanelSelection(() => null);

        expect(() => selection.select(node("I1").data)).not.toThrow();
        expect(() => selection.clear()).not.toThrow();
        expect(() => selection.restoreFocus()).not.toThrow();
    });
});

describe("PanelSelection focus", () => {
    test("gives the focus back to the selected person", () => {
        const first = node("I1");
        const second = node("I2");
        const visual = draw([first, second]);
        const focus = jest.fn();

        for (const element of document.querySelectorAll("g.person")) {
            /** @type {any} */ (element).focus = focus;
        }

        const selection = new PanelSelection(() => visual);

        selection.select(second.data);
        selection.restoreFocus();

        expect(focus).toHaveBeenCalledTimes(1);
        expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    });

    test("focuses the occurrence of the person that was selected, not the first one", () => {
        const first = node("I1");
        const second = node("I1");
        const visual = draw([first, second]);
        const focused = [];

        [...document.querySelectorAll("g.person")].forEach((element, index) => {
            /** @type {any} */ (element).focus = () => focused.push(index);
        });

        const selection = new PanelSelection(() => visual);

        selection.select(second.data);
        selection.restoreFocus();

        expect(focused).toEqual([1]);
    });

    test("does nothing when the selected person is gone after a redraw", () => {
        const person = node("I1");
        let visual = draw([person]);
        const selection = new PanelSelection(() => visual);

        selection.select(person.data);
        visual = draw([node("I2")]);

        const focus = jest.fn();

        /** @type {any} */ (document.querySelector("g.person")).focus = focus;
        selection.restoreFocus();

        expect(focus).not.toHaveBeenCalled();
    });

    test("finds the person by its xref when a redraw bound new data objects", () => {
        const person = node("I1");
        let visual = draw([person]);
        const selection = new PanelSelection(() => visual);

        selection.select(person.data);
        visual = draw([node("I2"), node("I1")]);

        const focused = [];

        [...document.querySelectorAll("g.person")].forEach((element, index) => {
            /** @type {any} */ (element).focus = () => focused.push(index);
        });
        selection.restoreFocus();

        expect(focused).toEqual([1]);
    });

    test("prefers the occurrence that was selected over an earlier one with the same xref", () => {
        const first = node("I1");
        const second = node("I1");
        const visual = draw([first, second]);
        const selection = new PanelSelection(() => visual);

        selection.select(second.data);

        const focused = [];

        [...document.querySelectorAll("g.person")].forEach((element, index) => {
            /** @type {any} */ (element).focus = () => focused.push(index);
        });
        selection.restoreFocus();

        expect(focused).toEqual([1]);
    });
});

describe("PanelSelection keyboard", () => {
    /**
     * Makes the only person of a drawn chart operable and returns the pieces to drive it.
     */
    function operable() {
        const person = node("I1", "Anna Schmidt");
        const visual = draw([person]);
        const element = visual.select("g.person");
        const activate = jest.fn();

        new PanelSelection(() => visual).makeOperable(element, { data: person.data }, activate);

        return { element: /** @type {Element} */ (element.node()), person, activate };
    }

    test("makes the person a focusable button that carries its name", () => {
        const { element } = operable();

        expect(element.getAttribute("tabindex")).toBe("0");
        expect(element.getAttribute("role")).toBe("button");
        expect(element.getAttribute("aria-label")).toBe("Anna Schmidt");
    });

    test("labels the person with the text it shows and not with the bare name", () => {
        const person = node("I1", "Anna Schmidt");
        const visual = draw([person]);
        const element = visual.select("g.person");

        element.html(
            "<title>Tooltip</title><text><tspan>Anna</tspan><tspan>Schmidt</tspan></text>" +
                "<text><tspan>* 1900</tspan></text><text><tspan> </tspan></text>",
        );
        new PanelSelection(() => visual).makeOperable(element, { data: person.data }, () => {});

        expect(element.attr("aria-label")).toBe("Anna Schmidt * 1900");
    });

    test("keeps the bare name for a person that shows no text", () => {
        const person = node("I1", "Anna Schmidt");
        const visual = draw([person]);
        const element = visual.select("g.person");

        element.html("<title>Tooltip</title><text><tspan> </tspan></text>");
        new PanelSelection(() => visual).makeOperable(element, { data: person.data }, () => {});

        expect(element.attr("aria-label")).toBe("Anna Schmidt");
    });

    test("activates with Enter and with Space, and tells that a key did it", () => {
        const { element, person, activate } = operable();

        for (const key of ["Enter", " "]) {
            const event = new KeyboardEvent("keydown", { key, cancelable: true });

            element.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(true);
        }

        expect(activate).toHaveBeenCalledTimes(2);
        expect(activate).toHaveBeenLastCalledWith(person.data, true);
    });

    test("ignores every other key and leaves its default alone", () => {
        const { element, activate } = operable();
        const event = new KeyboardEvent("keydown", { key: "a", cancelable: true });

        element.dispatchEvent(event);

        expect(activate).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    test("labels a person without a name with an empty text", () => {
        const person = node("I1");

        delete (/** @type {any} */ (person.data.data).name);

        const visual = draw([person]);
        const element = visual.select("g.person");

        new PanelSelection(() => visual).makeOperable(element, { data: person.data }, () => {});

        expect(element.attr("aria-label")).toBe("");
    });
});
