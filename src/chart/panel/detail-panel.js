/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { ensureDetailPanelStyle } from "./detail-panel-style.js";

/**
 * One fact of a person as the server serialises it.
 *
 * @typedef {object} PanelFact
 * @property {string} label     The plain text label of the fact
 * @property {string} date      The date as plain text, empty when there is none
 * @property {string} place     The place name as the server formats it, empty when there is none
 * @property {string} placeFull The full place name
 * @property {string} value     The value of the fact, empty when there is none
 * @property {string} partner   The plain text name of the other spouse of a family event, empty otherwise
 * @property {number} [sortDay] The Julian day number of the earliest day the date can mean, zero without a usable date
 */

/**
 * The data of a person that the panel reads.
 *
 * @typedef {object} PanelPerson
 * @property {string}                     name       The plain text name
 * @property {string}                     url        The URL of the individual page
 * @property {string}                     updateUrl  The URL that centres the chart on the person
 * @property {number}                     generation The generation of the person, 1 for the root
 * @property {string|undefined}           thumbnail  The URL of the highlight image, empty when the chart shows none
 * @property {string|undefined}           silhouette The URL of the silhouette that replaces a highlight image that cannot be loaded
 * @property {(PanelFact|null)[]|undefined} facts    The fact slots with the birth in the first and the death in the second, absent when the server sends no facts
 */

/**
 * The callbacks the panel hands the actions of its buttons and its closing to.
 *
 * @typedef {object} PanelCallbacks
 * @property {(url: string) => void} onIndividual   Opens the individual page
 * @property {(url: string) => void} onCenter       Centres the chart on the person
 * @property {() => void}            onClose        Called when the panel closes and focus should go back to the chart
 * @property {() => void}            onHidden       Called whenever the panel has closed, however it was closed
 */

/**
 * The Offcanvas part of Bootstrap that the panel uses.
 *
 * @typedef {object} OffcanvasInstance
 * @property {() => void} show
 * @property {() => void} hide
 */

/**
 * The part of the window the panel depends on, so tests can hand in stand-ins.
 *
 * @typedef {object} PanelWindow
 * @property {{Offcanvas?: {getOrCreateInstance: (element: Element, options: object) => OffcanvasInstance}}|undefined} bootstrap
 */

/**
 * Tells a fact of the payload from the empty slots and from anything malformed.
 *
 * @param {unknown} value A slot of the facts of a person
 *
 * @return {value is PanelFact}
 */
function isFact(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Tells whether a fact has a usable date to sort by.
 *
 * @param {PanelFact} fact The fact of the payload
 *
 * @return {boolean}
 */
function hasSortDay(fact) {
    return Number(fact.sortDay) > 0;
}

/**
 * Puts the facts of a person into the order of the panel. The birth stays first and the death last,
 * the facts between them follow the time. A fact without a usable date keeps its place among the
 * others, so an undated note does not jump around.
 *
 * @param {unknown} slots The fact slots of the payload, the birth in slot 0 and the death in slot 1
 *
 * @return {PanelFact[]}
 */
function orderFacts(slots) {
    if (!Array.isArray(slots)) {
        return [];
    }

    const birth = isFact(slots[0]) ? [slots[0]] : [];
    const death = isFact(slots[1]) ? [slots[1]] : [];
    const between = slots.slice(2).filter(isFact);

    const dated = between.filter(hasSortDay).sort((a, b) => Number(a.sortDay) - Number(b.sortDay));
    let next = 0;

    const ordered = between.map((fact) => (hasSortDay(fact) ? (dated[next++] ?? fact) : fact));

    return [...birth, ...ordered, ...death];
}

/**
 * The detail panel shows the facts of the selected person. It is a Bootstrap offcanvas without a
 * backdrop that opens on a selection and leaves the chart usable. All texts that do not come from
 * a person are in the markup of the page, so they are translated on the server, and everything
 * that comes from a person is written with textContent only.
 *
 * The panel mirrors the state of the offcanvas from its `hide`, `hidden` and `shown` events. A page
 * listener that cancels `hide`, stops these events before the panel sees them or selects a person
 * from within a `hide` listener is not supported, because it brings the two states out of step.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class DetailPanel {
    /**
     * Constructor.
     *
     * @param {HTMLElement}    element   The panel element of the page
     * @param {PanelCallbacks} callbacks The actions of the panel
     * @param {PanelWindow}    win       The window, replaceable for tests
     */
    constructor(
        element,
        callbacks,
        win = /** @type {PanelWindow} */ (/** @type {unknown} */ (window)),
    ) {
        ensureDetailPanelStyle();

        this._element = element;
        this._callbacks = callbacks;
        this._window = win;

        this._title = this.part("title");
        this._image = /** @type {HTMLImageElement} */ (this.part("image"));
        this._hint = this.part("hint");
        this._facts = this.part("facts");
        this._empty = this.part("empty");
        this._actions = this.part("actions");
        this._individualButton = this.part("individual");
        this._centerButton = this.part("center");

        this._individualUrl = "";
        this._centerUrl = "";
        this._imageFallback = "";

        this._image.addEventListener("error", () => this.imageFailed());

        this._individualButton.addEventListener("click", () => {
            if (this._individualUrl !== "") {
                this._callbacks.onIndividual(this._individualUrl);
            }
        });

        this._centerButton.addEventListener("click", () => {
            if (this._centerUrl !== "") {
                this._callbacks.onCenter(this._centerUrl);
            }
        });

        // Where the panel is in its life, which decides what the events of Bootstrap mean. A hidden
        // event that follows a selection belongs to a close that was replaced, and one that
        // follows a hidden event has been handled already.
        /** @type {"idle"|"open"|"closing"|"closed"} */
        this._state = "idle";

        // Whether the close that began last was a dismissal, which keeps the focus where it is
        this._keepFocus = false;
        this._dismissing = false;

        /** @type {(() => void)|null} */
        this._focusHeading = null;
        this._outsideClick = (/** @type {Event} */ event) => this.closeOnOutsideClick(event);
        this._escape = (/** @type {KeyboardEvent} */ event) => this.closeOnEscape(event);

        // A click beside the panel closes it. The listener only lives while the panel is shown, so
        // the click that opened it cannot close it again.
        this._element.addEventListener("shown.bs.offcanvas", () => {
            // The opening of a panel that was dismissed meanwhile ends after the close began
            if (this._state === "closed") {
                return;
            }

            document.addEventListener("click", this._outsideClick);
            document.addEventListener("keydown", this._escape);

            // The chart stays operable beside the panel, so the panel is no modal dialog
            this._element.removeAttribute("aria-modal");
            this._element.setAttribute("role", "complementary");
        });

        // Bootstrap closes the offcanvas on Escape and by its close button, and the focus goes back
        // to the chart then. After a click somewhere else the focus stays where the user put it.
        this._element.addEventListener("hide.bs.offcanvas", () => {
            // A close of a panel that has been closed already has nothing to begin
            if (this._state === "closed") {
                return;
            }

            this._state = "closing";
            this._keepFocus = this._dismissing;

            // The heading is not to take the focus once the panel is on its way out
            this.cancelHeadingFocus();
        });

        this._element.addEventListener("hidden.bs.offcanvas", () => {
            // A person picked while the panel was still closing shows it again, and the end of
            // the earlier close must then leave the panel and the chart as they are
            if (this._state === "open" || this._state === "closed") {
                return;
            }

            const keepFocus = this._keepFocus;

            this._state = "closed";
            this._keepFocus = false;

            document.removeEventListener("click", this._outsideClick);
            document.removeEventListener("keydown", this._escape);

            if (!keepFocus) {
                this._callbacks.onClose();
            }

            // The selected mark leaves with the panel, after the focus went back to the person
            this._callbacks.onHidden();
        });
    }

    /**
     * Closes the panel on Escape while the focus is outside of it, for example on a person of the
     * chart. Inside the panel Bootstrap closes it, and the focus goes back to the chart then.
     *
     * @param {KeyboardEvent} event The key press
     *
     * @private
     */
    closeOnEscape(event) {
        if (
            event.key !== "Escape" ||
            (event.target instanceof Node && this._element.contains(event.target))
        ) {
            return;
        }

        this.dismiss();
    }

    /**
     * Closes the panel on a click that is neither inside the panel nor on a person, as a click on a
     * person only swaps the content of the panel.
     *
     * @param {Event} event The click
     *
     * @private
     */
    closeOnOutsideClick(event) {
        const target = event.target;

        if (
            !(target instanceof Element) ||
            this._element.contains(target) ||
            target.closest("g.person") !== null
        ) {
            return;
        }

        this.dismiss();
    }

    /**
     * Hides the panel without handing the focus back to the chart, as the user has put it
     * somewhere else. A close that is already running ends by itself and only loses its focus
     * return. A panel that is not shown stays as it is.
     */
    dismiss() {
        // The panel counts as open from the selection on, as Bootstrap sets the show class only
        // when the opening transition is over
        if (this._state !== "open" && this._state !== "closing") {
            return;
        }

        // Bootstrap does not hide a panel that is closing already, so the hidden event of the
        // running close is the end, and the focus is the one thing left to take back
        if (this._state === "closing") {
            this._keepFocus = true;

            return;
        }

        const offcanvas = this.offcanvas();

        // Without Bootstrap the panel is a plain block that no event ends
        if (offcanvas === null) {
            this._state = "closed";
            this._element.classList.remove("show");
            this._callbacks.onHidden();

            return;
        }

        // Bootstrap reports the start of the close from within hide(), which is where the wish
        // is taken over. A hide() that does nothing must not leave the wish for the next close.
        this._dismissing = true;

        try {
            offcanvas.hide();
        } finally {
            this._dismissing = false;
        }
    }

    /**
     * Returns the child of the panel that carries the given data-panel name.
     *
     * @param {string} name The value of the data-panel attribute
     *
     * @return {HTMLElement}
     *
     * @private
     */
    part(name) {
        const part = /** @type {HTMLElement|null} */ (
            this._element.querySelector(`[data-panel="${name}"]`)
        );

        if (part === null) {
            throw new Error(`The detail panel has no part "${name}"`);
        }

        return part;
    }

    /**
     * Makes the panel part of the page. Without this the panel stays hidden, so a chart
     * without the panel is not changed.
     */
    enable() {
        this._element.hidden = false;
    }

    /**
     * Shows the facts of a person and opens the offcanvas. Re-selecting only replaces the content.
     *
     * @param {PanelPerson} person The data of the person
     * @param {boolean}   focus  Whether the focus moves to the heading of the panel
     */
    select(person, focus = false) {
        this._state = "open";
        this.render(person);
        this.open(focus);
    }

    /**
     * Opens the offcanvas, and moves the focus into it once it is shown.
     *
     * @param {boolean} focus Whether the focus moves to the heading
     *
     * @private
     */
    open(focus) {
        const offcanvas = this.offcanvas();

        if (offcanvas === null) {
            this._element.classList.add("show");

            if (focus) {
                this._title.focus();
            }

            return;
        }

        // A selection before the opening ends replaces the wait of the earlier one, also when it
        // asks for no focus move itself
        this.cancelHeadingFocus();

        if (focus) {
            if (this._element.classList.contains("show")) {
                this._title.focus();
            } else {
                const focusHeading = () => {
                    this._focusHeading = null;
                    this._title.focus();
                };

                this._focusHeading = focusHeading;
                this._element.addEventListener("shown.bs.offcanvas", focusHeading, {
                    once: true,
                });
            }
        }

        offcanvas.show();
    }

    /**
     * Ends the wait to move the focus to the heading once the opening is over.
     *
     * @private
     */
    cancelHeadingFocus() {
        if (this._focusHeading !== null) {
            this._element.removeEventListener("shown.bs.offcanvas", this._focusHeading);
            this._focusHeading = null;
        }
    }

    /**
     * Returns the Offcanvas instance of the panel, or null when Bootstrap is not available.
     *
     * @return {OffcanvasInstance|null}
     *
     * @private
     */
    offcanvas() {
        const offcanvas = this._window.bootstrap?.Offcanvas;

        if (offcanvas === undefined) {
            return null;
        }

        return offcanvas.getOrCreateInstance(this._element, { scroll: true, backdrop: false });
    }

    /**
     * Writes the person into the panel.
     *
     * @param {PanelPerson} person The data of the person
     *
     * @private
     */
    render(person) {
        this._title.textContent = String(person?.name ?? "");
        this._hint.hidden = true;
        this._actions.hidden = false;

        this._individualUrl = String(person?.url ?? "");
        this._centerUrl = person?.generation === 1 ? "" : String(person?.updateUrl ?? "");

        this._individualButton.hidden = this._individualUrl === "";
        this._centerButton.hidden = this._centerUrl === "";

        this.renderImage(person);

        this._facts.replaceChildren();

        const facts = orderFacts(person?.facts);

        let rows = 0;

        for (const fact of facts) {
            const row = this.factRow(fact);

            if (row !== null) {
                this._facts.appendChild(row);
                ++rows;
            }
        }

        this._empty.hidden = rows > 0;
    }

    /**
     * Shows the highlight image of the person, as the box in the chart does. A person without one
     * shows no image at all, the silhouette only replaces an image that cannot be loaded.
     *
     * @param {PanelPerson} person The data of the person
     *
     * @private
     */
    renderImage(person) {
        const thumbnail = String(person?.thumbnail ?? "");

        this._imageFallback = thumbnail === "" ? "" : String(person?.silhouette ?? "");

        if (thumbnail === "") {
            this._image.removeAttribute("src");
            this._image.hidden = true;

            return;
        }

        this._image.setAttribute("src", thumbnail);
        this._image.hidden = false;
    }

    /**
     * Swaps an image that cannot be loaded for the silhouette, and hides the image when there is
     * none or when the silhouette fails as well.
     *
     * @private
     */
    imageFailed() {
        if (this._imageFallback === "") {
            this._image.hidden = true;

            return;
        }

        const silhouette = this._imageFallback;

        this._imageFallback = "";
        this._image.setAttribute("src", silhouette);
    }

    /**
     * Builds the term and the description of one fact, or returns null when the fact has nothing
     * to show. The GEDCOM value "Y" only says that the event took place, so it is not shown. The
     * name of the other spouse of a marriage or divorce comes first, as it says who the event is
     * about.
     *
     * @param {PanelFact} fact The fact of the payload
     *
     * @return {DocumentFragment|null}
     *
     * @private
     */
    factRow(fact) {
        const row = document.createDocumentFragment();

        const term = document.createElement("dt");
        term.textContent = String(fact.label ?? "");

        const description = document.createElement("dd");
        const placeFull = String(fact.placeFull ?? "");
        const value = String(fact.value ?? "");

        /** @type {Array<[string, string]>} */
        const lines = [
            ["partner", String(fact.partner ?? "")],
            ["value", value === "Y" ? "" : value],
            ["date", String(fact.date ?? "")],
            ["place", placeFull === "" ? String(fact.place ?? "") : placeFull],
        ];

        for (const [name, text] of lines) {
            if (text === "") {
                continue;
            }

            const line = document.createElement("div");
            line.className = `detail-${name}`;
            line.textContent = text;
            description.appendChild(line);
        }

        if (description.childElementCount === 0) {
            return null;
        }

        row.append(term, description);

        return row;
    }
}
