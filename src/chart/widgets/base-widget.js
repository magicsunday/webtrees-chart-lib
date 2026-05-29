/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Common base class for chart-lib widgets.
 *
 * Subclasses inherit:
 *   - target resolution from id string (with/without leading #) or HTMLElement
 *   - dimensions() with options-over-container-over-defaults precedence
 *   - renderEmptyState() helper that keeps the target free of stale empty-state nodes
 *
 * Dimension precedence: option (finite, > 0) → container clientSize (> 0) →
 * caller default. renderEmptyState() removes any prior direct-child
 * `.chart-empty-state` before appending, so subclass `draw([])` calls are
 * idempotent with respect to the placeholder. Subclasses remain responsible for
 * clearing their own chart output between draws.
 *
 * Targets must be HTMLElement; SVG containers are not supported because the
 * placeholder is an HTML <div>. Widgets that render SVG should target an HTML
 * wrapper (`<div>`), not the `<svg>` root.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export default class BaseWidget {
    /**
     * @param {string|HTMLElement} target  DOM id (with or without leading #) or HTMLElement.
     * @param {object}             [options]  Widget-specific options. See subclasses.
     */
    constructor(target, options) {
        this.target = this._resolveTarget(target);
        this.options = { ...(options ?? {}) };
        this._selectionCallback = null;
        this._currentSelection = null;
    }

    /**
     * Register a callback that fires every time the user clicks a widget
     * element that opts in to selection. The widget calls `cb({source,
     * predicate})` on click, where `predicate: null` signals a cleared
     * selection (the user clicked the same element twice). `source` is the
     * widget's identity from `options.source` (or empty string when unset) so
     * the dashboard-bus can disambiguate multi-widget pages.
     *
     * @param {(payload: {source: string, predicate: object|null}) => void} callback
     * @returns {this}
     */
    onSelectionChanged(callback) {
        this._selectionCallback = typeof callback === "function" ? callback : null;
        return this;
    }

    /**
     * Internal helper used by selection-enabled subclasses to surface a click.
     * Toggles the predicate against the previous selection so re-clicking the
     * same predicate clears.
     *
     * @param {object|null} predicate  Widget-specific shape (e.g. `{slice: 'Male'}`)
     * @returns {{predicate: object|null}}  The post-toggle selection state
     */
    _emitSelection(predicate) {
        const next = this._samePredicate(this._currentSelection, predicate) ? null : predicate;
        this._currentSelection = next;
        if (this._selectionCallback !== null) {
            this._selectionCallback({
                source: typeof this.options.source === "string" ? this.options.source : "",
                predicate: next,
            });
        }
        return { predicate: next };
    }

    /**
     * Apply an externally-set selection (typically broadcast by a dashboard bus
     * from a sibling widget). Subclasses override `_applySelection` to update
     * their visual highlight state; the base implementation only tracks the
     * predicate so subsequent toggles still work.
     *
     * Predicate shape is widget-specific and intentionally opaque to the bus —
     * a widget that doesn't recognise the shape just leaves its highlight
     * untouched, which is the correct default when sibling widgets emit a
     * dimension the receiver doesn't carry (e.g. surname predicate hits a
     * century-keyed donut).
     *
     * @param {object|null} predicate  `null` clears the highlight.
     * @returns {this}
     */
    setSelection(predicate) {
        this._currentSelection = predicate;
        this._applySelection(predicate);
        return this;
    }

    /**
     * Subclass-overridable hook called by `setSelection`. Default no-op so
     * widgets that don't carry a sensible visual highlight (or haven't migrated
     * yet) simply ignore foreign selections.
     *
     * @param {object|null} _predicate
     * @returns {void}
     */
    _applySelection(_predicate) {
        // No-op default.
    }

    /**
     * Shallow equality test for predicate toggling — same keys with same
     * primitive values count as the same selection.
     *
     * @param {object|null} a
     * @param {object|null} b
     * @returns {boolean}
     */
    _samePredicate(a, b) {
        if (a === null || b === null) {
            return false;
        }
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) {
            return false;
        }
        return aKeys.every((key) => a[key] === b[key]);
    }

    /**
     * Play a held entry animation on the widget's already-rendered elements.
     * No-op unless `draw()` deferred an entrance via {@see _runEntry} (i.e. the
     * consumer set `options.animateOnReveal = true`). This NEVER re-draws — it
     * runs the stored closure, which only starts a transition on the nodes
     * `draw()` already created. Idempotent: the closure is cleared after the
     * first call.
     *
     * Reveal-on-scroll consumers (e.g. a dashboard dispatcher) draw every
     * widget up front but call `playEntry()` once a widget scrolls into view.
     *
     * @returns {void}
     */
    playEntry() {
        const entry = this._entry;
        this._entry = null;
        if (typeof entry === "function") {
            entry(true);
        }
    }

    /**
     * Drive a widget's entrance. `draw()` applies the initial keyframe itself,
     * then hands the *final-state* application to this helper as a closure
     * `(animate: boolean) => void` — it inserts a d3 transition when `animate`
     * is true and sets the attributes directly when false. Behaviour:
     *
     *   - reduced motion → `entry(false)`: jump straight to the final state.
     *   - reveal-on-scroll (`animateOnReveal`) → store the closure; the held
     *     initial keyframe stays visible until {@see playEntry} runs it.
     *   - otherwise → `entry(true)`: animate inline immediately (default).
     *
     * @param {(animate: boolean) => void} entry
     * @returns {void}
     */
    _runEntry(entry) {
        if (this._prefersReducedMotion()) {
            entry(false);
            return;
        }
        if (this._deferEntry()) {
            this._entry = entry;
            return;
        }
        entry(true);
    }

    /**
     * Whether `draw()` should hold the entry animation for a later
     * `playEntry()` call (reveal-on-scroll) instead of running it inline.
     *
     * @returns {boolean}
     */
    _deferEntry() {
        return this.options.animateOnReveal === true;
    }

    /**
     * Whether the user has requested reduced motion. Animated widgets skip
     * their entrance entirely when this is true and render the final state
     * directly.
     *
     * @returns {boolean}
     */
    _prefersReducedMotion() {
        return (
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        );
    }

    /**
     * @param {string|HTMLElement} target
     * @returns {HTMLElement}
     */
    _resolveTarget(target) {
        if (target instanceof HTMLElement) {
            return target;
        }
        if (typeof target !== "string" || target.length === 0) {
            throw new Error(
                `${this.constructor.name}: target must be an HTMLElement or a non-empty id string`,
            );
        }
        const id = target.startsWith("#") ? target.slice(1) : target;
        const el = document.getElementById(id);
        if (el === null) {
            throw new Error(`${this.constructor.name}: target not found for "${target}"`);
        }
        return el;
    }

    /**
     * Resolve effective width / height. Option wins if finite-positive,
     * otherwise container clientSize, otherwise the caller-supplied default.
     *
     * @param {{width: number, height: number}} defaults
     * @returns {{width: number, height: number}}
     */
    dimensions(defaults) {
        return {
            width: pickDimension(this.options.width, this.target.clientWidth, defaults.width),
            height: pickDimension(this.options.height, this.target.clientHeight, defaults.height),
        };
    }

    /**
     * Replace any prior empty-state placeholder under target with a fresh one.
     *
     * @param {string} message  Human-readable message rendered as text (no HTML)
     * @returns {HTMLElement}
     */
    renderEmptyState(message) {
        const text = coerceMessage(message);
        const el = document.createElement("div");
        el.className = "chart-empty-state";
        el.textContent = text;
        for (const stale of this.target.querySelectorAll(":scope > .chart-empty-state")) {
            stale.remove();
        }
        this.target.appendChild(el);
        return el;
    }
}

/**
 * @param {unknown} optionValue
 * @param {number}  containerValue
 * @param {number}  defaultValue
 * @returns {number}
 */
function pickDimension(optionValue, containerValue, defaultValue) {
    if (typeof optionValue === "number" && Number.isFinite(optionValue) && optionValue > 0) {
        return optionValue;
    }
    if (typeof containerValue === "number" && containerValue > 0) {
        return containerValue;
    }
    return defaultValue;
}

/**
 * Coerce any value to a placeholder text string. Falls back to empty string if
 * a custom toString throws (e.g. proxies with throwing traps).
 *
 * @param {unknown} message
 * @returns {string}
 */
function coerceMessage(message) {
    if (message === null || message === undefined) {
        return "";
    }
    try {
        return String(message);
    } catch {
        return "";
    }
}
