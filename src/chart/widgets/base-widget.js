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
 * Dimension precedence: option (finite, > 0) → container clientSize (> 0) → caller default.
 * renderEmptyState() removes any prior direct-child `.chart-empty-state` before appending,
 * so subclass `draw([])` calls are idempotent with respect to the placeholder.
 * Subclasses remain responsible for clearing their own chart output between draws.
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
 * Coerce any value to a placeholder text string. Falls back to empty string
 * if a custom toString throws (e.g. proxies with throwing traps).
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
