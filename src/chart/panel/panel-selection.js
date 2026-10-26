/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * The datum of a person as the tree chart modules bind it to a person element, the node of
 * the hierarchy. Its data is the person the server sent.
 *
 * @typedef {object} PanelNode
 * @property {{xref: string, name?: string}} data The person
 */

/**
 * Keeps track of the person that the detail panel shows. The person is marked in the chart,
 * the marks are applied again after every draw because the person elements are created
 * anew, and the focus can be handed back to the person once the panel has closed.
 *
 * It works on every chart that draws its persons as `g.person` elements whose datum is a
 * hierarchy node, so the pedigree, descendants and fan chart share it.
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

        /** @type {PanelNode|null} */
        this._datum = null;
    }

    /**
     * Marks a person as the selected one.
     *
     * @param {PanelNode} datum The datum of the person
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
        const selected = this.persons()
            ?.filter((person) => person.data === datum)
            .node();

        if (selected instanceof SVGElement) {
            selected.focus({ preventScroll: true });
        }
    }

    /**
     * Lets a person element be reached with the Tab key and be activated with Enter or Space.
     *
     * @param {import("d3-selection").Selection<any, any, any, any>} element  The person element
     * @param {{data: PanelNode}}                                    person   The datum of the element
     * @param {(datum: PanelNode, byKeyboard: boolean) => void}      activate Called with the datum
     */
    makeOperable(element, person, activate) {
        element
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr("aria-label", String(person.data.data.name ?? ""))
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
