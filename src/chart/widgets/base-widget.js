/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { easeCubicOut } from "d3-ease";
import "d3-transition";
import { pickPositiveInt } from "../util/coerce.js";

/**
 * Common base class for chart-lib widgets.
 *
 * Subclasses inherit:
 *   - target resolution from id string (with/without leading #) or HTMLElement
 *   - the `width` / `height` accessors: an explicit pixel override, or
 *     `undefined` to size responsively to the host element at draw time
 *   - the object-`margin` accessor (`{top, right, bottom, left}`): a layout
 *     subclass raises `this._defaultMargin` to its own DEFAULT_OPTIONS.margin in
 *     its constructor and re-assigns `this.margin`, so a partial caller object
 *     merges over the widget's real defaults; non-layout widgets inherit a zero
 *     margin they ignore until their renderer grows per-side support
 *   - the `emptyMessage` / `ariaLabel` accessors: a subclass raises
 *     `this._defaultEmptyMessage` / `this._defaultAriaLabel` to its own default
 *     and re-assigns the accessor, mirroring the `_defaultMargin` protocol
 *   - the `accent` / `i18n` accessors (CONSUMING-ONLY, unlike the universal
 *     accessors above): the tolerant setter logic lives here, but the base
 *     constructor does NOT activate them, so a widget that paints no accent and
 *     surfaces no copy never exposes a meaningful value. A consuming subclass
 *     activates its own in its constructor (`this.accent = this.options.accent`
 *     / `this.i18n = this.options.i18n`) and may raise `this._defaultAccent`
 *     first (e.g. world-map lowers it to `undefined` to fall back to its colour
 *     scale), mirroring the `_default*` protocol
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
        // Neutral baselines for the shared accessors; a subclass with a
        // different default raises the matching `_default*` field here and
        // re-assigns the accessor below. See the class JSDoc for the protocol.
        this._defaultMargin = { top: 0, right: 0, bottom: 0, left: 0 };
        this._defaultEmptyMessage = "No data available";
        this._defaultAriaLabel = "";
        this._defaultAccent = "currentColor";
        this._defaultFormatter = (value) => String(value);
        // Activate the GEOMETRY-UNIVERSAL accessors up front so EVERY widget
        // exposes them, even when its layout ignores the value (inert inherited
        // accessor). The `accent` / `i18n` accessors are intentionally NOT
        // activated here: they carry meaning only for the widgets that paint an
        // accent or surface translatable copy, so each such subclass activates
        // its own in its constructor. A non-consuming widget never touches them,
        // so the duplicated tolerant-setter logic is hoisted (DRY) without
        // forcing the accessor onto widgets that have no use for it.
        this.width = this.options.width;
        this.height = this.options.height;
        this.margin = this.options.margin;
        this.emptyMessage = this.options.emptyMessage;
        this.ariaLabel = this.options.ariaLabel;
    }

    /**
     * The explicit pixel width, or `undefined` to size responsively to the host
     * element's width at draw time. Shared by every widget that supports a
     * responsive width; the subclass resolves the rendered width in `draw()`
     * via `pickPositive(this.width, this.target.clientWidth) || <default>`.
     *
     * @returns {number|undefined}
     */
    get width() {
        return this._width;
    }

    /**
     * @param {number|undefined} value An explicit width in pixels; a missing or
     *   non-positive value clears the override so draw falls back to the host
     *   element's width. The runtime guard keeps the JSON dispatcher (which
     *   assigns untyped values) safe.
     */
    set width(value) {
        this._width =
            typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
    }

    /**
     * The explicit pixel height, or `undefined` to size responsively to the
     * host element's height at draw time. Shared by every widget that supports
     * a responsive height; the subclass resolves the rendered height in
     * `draw()` via `pickPositive(this.height, this.target.clientHeight) ||
     * <default>`.
     *
     * @returns {number|undefined}
     */
    get height() {
        return this._height;
    }

    /**
     * @param {number|undefined} value An explicit height in pixels; a missing
     *   or non-positive value clears the override so draw falls back to the host
     *   element's height. The runtime guard keeps the JSON dispatcher (which
     *   assigns untyped values) safe.
     */
    set height(value) {
        this._height =
            typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
    }

    /**
     * The inner margins around the plot area. Shared by every layout widget;
     * caller-supplied keys are merged over the widget's own defaults (set via
     * `this._defaultMargin` in the subclass constructor) so a partial object
     * only overrides the sides it names.
     *
     * @returns {{top: number, right: number, bottom: number, left: number}}
     */
    get margin() {
        return this._margin;
    }

    /**
     * @param {{top?: number, right?: number, bottom?: number, left?: number}|undefined} value
     *   A full or partial margin object; non-plain-object input — including an
     *   array or an untyped JSON dispatcher value — leaves only the defaults.
     *   The runtime guard keeps the JSON dispatcher safe.
     */
    set margin(value) {
        this._margin = {
            ...this._defaultMargin,
            ...(typeof value === "object" && value !== null && !Array.isArray(value) ? value : {}),
        };
    }

    /**
     * The placeholder text rendered when the widget draws an empty dataset.
     * Shared by every widget; a subclass whose default differs from the neutral
     * "No data available" raises `this._defaultEmptyMessage` in its constructor
     * (e.g. to "" for widgets that stay silent on empty data) and re-assigns
     * `this.emptyMessage`.
     *
     * @returns {string}
     */
    get emptyMessage() {
        return this._emptyMessage;
    }

    /**
     * @param {string|undefined} value A custom placeholder; a non-string value
     *   (e.g. an untyped JSON dispatcher value) falls back to the widget's
     *   default. The runtime guard keeps the JSON dispatcher safe.
     */
    set emptyMessage(value) {
        this._emptyMessage = typeof value === "string" ? value : this._defaultEmptyMessage;
    }

    /**
     * The accessible label applied to the widget's root SVG. Shared by every
     * widget; a subclass with a meaningful default raises
     * `this._defaultAriaLabel` in its constructor (e.g. "Bar chart") and
     * re-assigns `this.ariaLabel`. The neutral default is an empty string, which
     * widgets treat as "no explicit label".
     *
     * @returns {string}
     */
    get ariaLabel() {
        return this._ariaLabel;
    }

    /**
     * @param {string|undefined} value A custom label; a missing or empty value
     *   falls back to the widget's default. The runtime guard keeps the JSON
     *   dispatcher safe.
     */
    set ariaLabel(value) {
        this._ariaLabel =
            typeof value === "string" && value !== "" ? value : this._defaultAriaLabel;
    }

    /**
     * The accent colour a paint-bearing widget applies to its primary marks
     * (e.g. a gauge arc, heatmap hue, radial wedge). NOT activated for every
     * widget — only the subclasses that paint an accent call `this.accent =
     * this.options.accent` in their constructor. The neutral baseline is
     * `currentColor` so the marks always paint; a subclass whose default differs
     * (e.g. world-map, which leaves the accent unset to fall back to its colour
     * scale) raises `this._defaultAccent` before activating the accessor.
     *
     * @returns {string|undefined}
     */
    get accent() {
        return this._accent;
    }

    /**
     * @param {string|undefined} value The accent colour (any CSS colour
     *   string); a missing or empty value resets to `this._defaultAccent`. The
     *   runtime guard keeps the JSON dispatcher (which assigns untyped values)
     *   safe.
     */
    set accent(value) {
        this._accent = typeof value === "string" && value !== "" ? value : this._defaultAccent;
    }

    /**
     * The i18n string-pack overrides a copy-bearing widget merges over its
     * built-in English defaults. NOT activated for every widget — only the
     * subclasses that surface translatable copy call `this.i18n =
     * this.options.i18n` in their constructor. A non-object value resets to an
     * empty pack so each lookup falls back to its built-in variant.
     *
     * @returns {object}
     */
    get i18n() {
        return this._i18n;
    }

    /**
     * @param {object|undefined} value The i18n overrides; a non-object value
     *   (including an untyped JSON dispatcher value) resets to an empty pack.
     *   The runtime guard keeps the JSON dispatcher safe.
     */
    set i18n(value) {
        this._i18n = typeof value === "object" && value !== null ? value : {};
    }

    /**
     * The maximum number of rows a list-style widget renders after sanitisation.
     * NOT activated for every widget — only the subclasses that cap their rows
     * (name-timeline, progress-list) call `this.maxItems = this.options.maxItems`
     * in their constructor. A non-positive or non-finite value falls back to
     * `Number.POSITIVE_INFINITY` so the whole dataset shows.
     *
     * @returns {number}
     */
    get maxItems() {
        return this._maxItems;
    }

    /**
     * @param {number|undefined} value The row cap; a missing or non-positive
     *   value resets to `Number.POSITIVE_INFINITY` (no cap). The runtime guard
     *   keeps the JSON dispatcher (which assigns untyped values) safe.
     */
    set maxItems(value) {
        this._maxItems = pickPositiveInt(value, Number.POSITIVE_INFINITY);
    }

    /**
     * The function turning a row value into its display string. NOT activated for
     * every widget — only the subclasses that render formatted values
     * (name-timeline, progress-list) call `this.formatter = this.options.formatter`
     * in their constructor. The neutral baseline is `String`; a subclass whose
     * default differs (e.g. progress-list, which localises) raises
     * `this._defaultFormatter` before activating the accessor.
     *
     * @returns {(value: number) => string}
     */
    get formatter() {
        return this._formatter;
    }

    /**
     * @param {((value: number) => string)|undefined} value The value formatter; a
     *   non-function value resets to `this._defaultFormatter`. The runtime guard
     *   keeps the JSON dispatcher (which assigns untyped values) safe.
     */
    set formatter(value) {
        this._formatter = typeof value === "function" ? value : this._defaultFormatter;
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
     * Build the terminal target for a widget's entry keyframe: a named
     * transition when `animate` is true, otherwise the selection itself. The
     * closure passed to {@see _runEntry} then writes the resting-state
     * attributes exactly once instead of duplicating them across an animate /
     * reduced-motion branch.
     *
     * The return is typed as a `Transition` for ALL callers, including the
     * reduced-motion path that hands back the plain selection. d3's
     * `Selection.attr` / `Selection.style` are call-compatible with their
     * `Transition` counterparts, so the terminal chain works identically
     * whether it animates or jumps straight to the final state — but the
     * overload sets do NOT unify under `checkJs`, so a `Selection | Transition`
     * union loses `.attr()` for function-valued attributes. Casting the
     * no-animate selection to the `Transition` shape lets every widget write
     * ONE terminal chain instead of duplicating the resting state.
     *
     * Contract — callers may ONLY use the methods that exist on both a
     * `Selection` and a `Transition`, i.e. `.attr()` and `.style()`. The
     * transition-only methods — `.attrTween()` / `.styleTween()` / `.tween()`
     * and the timing methods `.delay()` / `.duration()` — must NOT be called on
     * the result: they are absent from a `Selection` and would throw on the
     * reduced-motion path. Widgets that need a tween (e.g. an arc/path morph)
     * keep their own explicit animate / no-animate branch instead.
     *
     * @template {import("d3-selection").BaseType} GElement
     * @template Datum
     * @template {import("d3-selection").BaseType} PElement
     * @template PDatum
     * @param {import("d3-selection").Selection<GElement, Datum, PElement, PDatum>} selection Nodes carrying the held initial keyframe
     * @param {boolean}                                                             animate   Whether to animate (false jumps straight to the final state)
     * @param {string}                                                             name      Named-transition token so concurrent entries don't interrupt each other
     * @param {number}                                                             duration  Transition duration in milliseconds
     * @param {number | ((datum: Datum, index: number) => number)}                 [delay]   Per-node or fixed delay for staggered reveals
     * @param {(normalizedTime: number) => number}                                 [ease]    Easing function (defaults to cubic-out)
     *
     * @returns {import("d3-transition").Transition<GElement, Datum, PElement, PDatum>}
     */
    _enter(selection, animate, name, duration, delay, ease = easeCubicOut) {
        if (!animate) {
            // Reduced motion / held-then-skipped: set the final state at once.
            // Selection is structurally `.attr()`-compatible with Transition;
            // the cast keeps the single terminal chain at the call site.
            return /** @type {import("d3-transition").Transition<GElement, Datum, PElement, PDatum>} */ (
                /** @type {unknown} */ (selection)
            );
        }

        const transition = selection.transition(name).duration(duration).ease(ease);

        if (delay === undefined) {
            return transition;
        }

        // `delay` is `number | ValueFn`, but the two `Transition.delay`
        // overloads each accept ONE of those — the union matches neither, so
        // cast to satisfy the checker. d3 dispatches on the runtime type
        // (number → fixed delay, function → per-node delay) regardless.
        return transition.delay(/** @type {number} */ (delay));
    }

    /**
     * Tween variant of {@see _enter} for entries whose animated form needs a
     * custom per-frame interpolation — an arc / path `d` morph via
     * `.attrTween()`, say — which {@see _enter} cannot express: `.attrTween()`
     * is transition-only and would throw on the reduced-motion (selection)
     * path, and a path string cannot be interpolated by a plain `.attr()`.
     *
     * It centralises the same animate / reduced-motion branch as `_enter` but
     * via two callbacks instead of a returned chain: `applyFinal(selection)`
     * sets the resting state at once (reduced motion / held-then-skipped) and
     * `applyTween(transition)` drives the animated entry. The helper owns the
     * transition's name / duration / ease, so the callbacks describe only WHAT
     * changes, never the timing. (No `delay` parameter — tween-morph entries
     * don't stagger; add one here only when a consumer actually needs it.)
     *
     * @template {import("d3-selection").BaseType} GElement
     * @template Datum
     * @template {import("d3-selection").BaseType} PElement
     * @template PDatum
     * @param {import("d3-selection").Selection<GElement, Datum, PElement, PDatum>} selection Nodes carrying the held initial keyframe
     * @param {boolean}                                                             animate   Whether to animate (false applies the final state at once)
     * @param {string}                                                             name      Named-transition token
     * @param {number}                                                             duration  Transition duration in milliseconds
     * @param {(selection: import("d3-selection").Selection<GElement, Datum, PElement, PDatum>) => void}   applyFinal Sets the resting state with no transition
     * @param {(transition: import("d3-transition").Transition<GElement, Datum, PElement, PDatum>) => void} applyTween Drives the animated entry (e.g. `.attrTween()`)
     * @param {(normalizedTime: number) => number}                                 [ease]    Easing function (defaults to cubic-out)
     *
     * @returns {void}
     */
    _enterTween(selection, animate, name, duration, applyFinal, applyTween, ease = easeCubicOut) {
        if (!animate) {
            applyFinal(selection);
            return;
        }

        applyTween(selection.transition(name).duration(duration).ease(ease));
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
