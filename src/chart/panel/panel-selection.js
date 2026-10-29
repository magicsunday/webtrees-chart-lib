/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * The datum that a hierarchy node of a tree chart carries. The node itself is what a person
 * element is bound to, its data is this datum, and the data of this datum is the person the
 * server sent.
 *
 * @typedef {object} PanelNode
 * @property {{xref: string, name?: string}} data The person
 */

/**
 * Reads the text a person element shows. The tspans of each of its `text` elements make one
 * line, and the lines are joined by a space. A `title` next to them is only the tooltip of the
 * same text and does not count.
 *
 * @param {unknown} node The person element
 *
 * @return {string} The visible lines, empty if the element shows no text
 */
function visibleText(node) {
    if (!(node instanceof Element)) {
        return "";
    }

    return Array.from(node.querySelectorAll("text"))
        .map((text) =>
            Array.from(text.querySelectorAll("tspan"))
                .map((tspan) => tspan.textContent ?? "")
                .join(" ")
                .trim(),
        )
        .filter((line) => line !== "")
        .join(" ");
}

/**
 * Keeps track of the person that the detail panel shows. The person is marked in the chart,
 * the marks are applied again after every draw because the person elements are created
 * anew, and the focus can be handed back to the person once the panel has closed.
 *
 * It works on every chart that draws its persons as `g.person` elements whose datum is a
 * hierarchy node, so the pedigree, descendants and fan chart share it. A chart names the
 * type of its own datum with the template, so the datum that comes back in the activation
 * callback is typed as the chart knows it.
 *
 * The mark follows the xref of the selected person. The focus goes back to the element whose
 * hierarchy node carries the datum object that was handed to `select()`, which is the `data` of
 * the node and not the node itself. That picks the right element when a person appears twice,
 * provided each occurrence has a datum object of its own, because occurrences that share one
 * match the first element. When no element carries that object any more, as after a chart update
 * that binds new hierarchy nodes, the first element of the person with the same xref takes the
 * focus, so a selection that stays on screen is found again.
 *
 * @template {PanelNode} [T=PanelNode]
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class PanelSelection {
    /**
     * Constructor.
     *
     * @param {() => import("d3-selection").Selection<any, any, any, any>|null|undefined} visual
     *        Returns the selection that holds the person elements, or nothing before the first draw
     */
    constructor(visual) {
        this._visual = visual;

        /** @type {string|null} */
        this._xref = null;

        /** @type {T|null} */
        this._datum = null;
    }

    /**
     * Marks a person as the selected one.
     *
     * @param {T} datum The datum of the person
     */
    select(datum) {
        this._xref = datum.data.xref;
        this._datum = datum;
        this.apply();
    }

    /**
     * Removes the selection, so no person stays marked.
     */
    clear() {
        this._xref = null;
        this._datum = null;
        this.apply();
    }

    /**
     * Marks the selected person in the chart. Call it after every draw as well.
     */
    apply() {
        const xref = this._xref;

        this.persons()
            ?.classed("selected", (person) => xref !== null && person.data.data.xref === xref)
            .attr("aria-current", (person) =>
                xref !== null && person.data.data.xref === xref ? "true" : null,
            );
    }

    /**
     * Gives the focus back to the selected person, if it is still in the chart.
     */
    restoreFocus() {
        const datum = this._datum;
        const xref = this._xref;
        const persons = this.persons();
        const selected =
            persons?.filter((person) => person.data === datum).node() ??
            persons?.filter((person) => xref !== null && person.data.data.xref === xref).node();

        if (selected instanceof SVGElement) {
            selected.focus({ preventScroll: true });
        }
    }

    /**
     * Lets a person element be reached with the Tab key and be activated with Enter or Space.
     * The element is named with the text it shows, so the accessible name contains the visible
     * text, and with the bare name of the person when the tspans of its `text` elements hold no
     * text. Call it after the text is drawn.
     *
     * @param {import("d3-selection").Selection<any, any, any, any>} element  The person element
     * @param {{data: T}}                                            person   The datum of the element
     * @param {(datum: T, byKeyboard: boolean) => void}              activate Called with the datum
     */
    makeOperable(element, person, activate) {
        element
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr("aria-label", visibleText(element.node()) || String(person.data.data.name ?? ""))
            .on("keydown", (event) => {
                if (event.key !== "Enter" && event.key !== " ") {
                    return;
                }

                // Space would scroll the page otherwise
                event.preventDefault();
                activate(person.data, true);
            });
    }

    /**
     * Returns the person elements of the chart, or null before the first draw.
     *
     * @return {import("d3-selection").Selection<any, any, any, any>|null}
     *
     * @private
     */
    persons() {
        return this._visual()?.selectAll("g.person") ?? null;
    }
}
