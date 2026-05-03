/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Persists chart configuration form values to localStorage so settings survive
 * a page reload. Each field is registered by its element ID; the stored value
 * is restored to the input on page load, and an "input" event listener keeps
 * it in sync thereafter.
 *
 * @author  Rico Sonntag <mail@ricosonntag.de>
 * @license https://opensource.org/licenses/GPL-3.0 GNU General Public License v3.0
 * @link    https://github.com/magicsunday/webtrees-chart-lib/
 */
export class Storage {
    /**
     * @param {string} name The localStorage key under which all values are stored as a JSON object
     */
    constructor(name) {
        this._storageKey = name;

        // Tolerate corrupted / hand-edited / version-incompatible payloads
        // by silently resetting to an empty store. JSON.parse throwing here
        // would otherwise brick the configuration form for that user with
        // no recovery path short of devtools.
        let parsed = null;
        try {
            parsed = JSON.parse(localStorage.getItem(this._storageKey));
        } catch (_) {
            // ignore — fall through to empty default
        }
        this._storage = parsed || {};
    }

    /**
     * Registers an input or select element by its ID prefix. If a stored value
     * exists it is restored to the element; otherwise the current element value
     * is written to storage. An "input" event listener is added to all matching
     * elements so future changes are persisted automatically. Uses querySelector
     * with a prefix match to support checkbox IDs that include the checked value.
     *
     * @param {string} name The element ID (or ID prefix for checkboxes/radios)
     */
    register(name) {
        // Use "querySelector" here as the ID of checkbox elements may additionally contain a hyphen and the value
        // Query checked elements (radio and checkbox) separately
        const input = /** @type {HTMLInputElement|null} */ (
            document.querySelector(`input[id^="${name}"]:checked, select[id^="${name}"]`) ||
                document.querySelector(`input[id^="${name}"]`)
        );

        if (input === null) {
            return;
        }

        const storedValue = this.read(name);

        if (storedValue === null) {
            this.onInput(input);
        } else {
            this.restoreInputValue(input, storedValue, name);
        }

        // Add event listener to all inputs by their IDs
        document
            .querySelectorAll(`input[id^="${name}"], select[id^="${name}"]`)
            .forEach((input) => {
                input.addEventListener("input", (event) => {
                    this.onInput(/** @type {HTMLInputElement} */ (event.target));
                });
            });
    }

    /**
     * Persists the current value of an input to storage. For checkboxes the
     * boolean checked state is stored; for all other inputs the string value.
     *
     * @param {HTMLInputElement} element The input or select element
     *
     * @private
     */
    onInput(element) {
        if (element.type && element.type === "checkbox") {
            this.write(element.name, element.checked);
        } else {
            this.write(element.name, element.value);
        }
    }

    /**
     * Returns the value previously stored under the given key, or null if
     * no entry exists.
     *
     * Prefer the typed accessors `readString`, `readBool`, `readNumber` over
     * this raw method when the call site knows the expected shape — they
     * coerce stored legacy strings (e.g. `"1"`, `"true"`) to the right type
     * and return a usable fallback when the entry is missing.
     *
     * @param {string} name The element id or name attribute used as storage key
     *
     * @return {null|string|boolean|number}
     */
    read(name) {
        if (Object.hasOwn(this._storage, name)) {
            return this._storage[name];
        }

        return null;
    }

    /**
     * Returns the stored value coerced to a string, or `fallback` when no
     * entry exists. Numbers and booleans are stringified.
     *
     * @param {string}      name
     * @param {string|null} [fallback=null]
     *
     * @return {string|null}
     */
    readString(name, fallback = null) {
        const value = this.read(name);
        if (value === null) {
            return fallback;
        }
        return String(value);
    }

    /**
     * Returns the stored value coerced to a boolean, or `fallback` when no
     * entry exists. Recognises legacy string forms (`"1"`, `"0"`, `"true"`,
     * `"false"`) and numeric `0`/non-zero so values written by older versions
     * of the form continue to round-trip correctly.
     *
     * @param {string}       name
     * @param {boolean|null} [fallback=null]
     *
     * @return {boolean|null}
     */
    readBool(name, fallback = null) {
        const value = this.read(name);
        if (value === null) {
            return fallback;
        }
        if (typeof value === "boolean") {
            return value;
        }
        if (typeof value === "number") {
            return value !== 0;
        }
        if (value === "true" || value === "1") {
            return true;
        }
        if (value === "false" || value === "0") {
            return false;
        }
        return Boolean(value);
    }

    /**
     * Returns the stored value coerced to a finite number, or `fallback` when
     * the entry is missing or cannot be parsed (e.g. an empty string).
     *
     * @param {string}      name
     * @param {number|null} [fallback=null]
     *
     * @return {number|null}
     */
    readNumber(name, fallback = null) {
        const value = this.read(name);
        if (value === null) {
            return fallback;
        }
        if (typeof value === "number") {
            return Number.isFinite(value) ? value : fallback;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    /**
     * Restores the stored value on the provided input, handling radio/checkbox
     * differences. Radios are matched by name/value; checkboxes use the stored
     * boolean state. All other inputs fall back to string assignment.
     *
     * @param {HTMLInputElement}        input        The input element to restore
     * @param {string|boolean|number}   storedValue  The persisted value
     * @param {string}                  idPrefix     The id prefix used for registration
     *
     * @private
     */
    restoreInputValue(input, storedValue, idPrefix) {
        if (input.type === "radio") {
            const radioToCheck = /** @type {HTMLInputElement|null} */ (
                document.querySelector(
                    `input[type="radio"][name="${input.name}"][value="${storedValue}"]`,
                ) || document.getElementById(`${idPrefix}-${storedValue}`)
            );

            if (radioToCheck) {
                radioToCheck.checked = true;
            }

            return;
        }

        if (input.type === "checkbox") {
            input.checked = Boolean(storedValue);

            return;
        }

        input.value = String(storedValue);
    }

    /**
     * Persists a value under the given key and flushes the entire storage
     * object to localStorage. Logs a warning (but does not throw) when
     * localStorage quota is exceeded.
     *
     * @param {string}                name  The element id or name attribute used as storage key
     * @param {string|boolean|number} value The value to store
     */
    write(name, value) {
        this._storage[name] = value;

        try {
            localStorage.setItem(this._storageKey, JSON.stringify(this._storage));
        } catch (_exception) {
            console.log(
                `There wasn't enough space to store '${name}' with value '${value}' in the local storage.`,
            );
        }
    }
}
