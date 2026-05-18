import { Storage } from "./storage.js";

/**
 * @typedef {"string" | "boolean-1-0" | "boolean-1-or-delete"} QueryMode
 *
 * @typedef {{
 *   key: string,
 *   value: string | number | boolean | null | undefined,
 *   mode?: QueryMode,
 * }} QueryEntry
 */

/**
 * Converts mixed boolean-like values to a real boolean.
 *
 * @param {string | number | boolean | null | undefined} value
 *
 * @returns {boolean}
 */
function toBoolean(value) {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        return value !== 0;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return normalized !== "" && normalized !== "0" && normalized !== "false";
    }

    return false;
}

/**
 * Applies a query entry to URLSearchParams. Null/undefined values remove the
 * key to avoid leaking stale params from pre-filled base URLs.
 *
 * @param {URLSearchParams} searchParams
 * @param {QueryEntry}      entry
 */
export function applyQueryEntry(searchParams, entry) {
    if (entry.value === null || typeof entry.value === "undefined") {
        searchParams.delete(entry.key);
        return;
    }

    const mode = entry.mode ?? (typeof entry.value === "boolean" ? "boolean-1-0" : "string");
    const boolValue = toBoolean(entry.value);

    if (mode === "boolean-1-or-delete") {
        if (boolValue) {
            searchParams.set(entry.key, "1");
        } else {
            searchParams.delete(entry.key);
        }
        return;
    }

    if (mode === "boolean-1-0") {
        searchParams.set(entry.key, boolValue ? "1" : "0");
        return;
    }

    searchParams.set(entry.key, String(entry.value));
}

/**
 * Builds an AJAX URL from a base URL + xref + query entries.
 *
 * @param {string}                  baseUrl
 * @param {object}                  [options]
 * @param {string | null | undefined} [options.xref]
 * @param {string}                  [options.xrefInputId]
 * @param {string}                  [options.xrefParam]
 * @param {QueryEntry[]}            [options.query]
 *
 * @returns {string}
 */
export function buildChartAjaxUrl(baseUrl, options = {}) {
    const url = new URL(baseUrl);
    const xrefInputId = options.xrefInputId ?? "xref";
    const xrefParam = options.xrefParam ?? "xref";
    const xrefInput = /** @type {HTMLInputElement | null} */ (document.getElementById(xrefInputId));
    const xrefValue = options.xref ?? xrefInput?.value ?? null;

    if (xrefValue !== null && typeof xrefValue !== "undefined") {
        url.searchParams.set(xrefParam, String(xrefValue));
    }

    (options.query ?? []).forEach((entry) => {
        applyQueryEntry(url.searchParams, entry);
    });

    return url.toString();
}

/**
 * Restores and persists a collapse state + toggles button labels.
 *
 * @param {Storage} storage
 * @param {object}  [options]
 * @param {string}  [options.collapseId]
 * @param {string}  [options.toggleId]
 * @param {string}  [options.storageKey]
 *
 * @returns {boolean} true when both required elements were found
 */
export function syncCollapseToggle(storage, options = {}) {
    const collapseId = options.collapseId ?? "showMoreOptions";
    const toggleId = options.toggleId ?? "options";
    const storageKey = options.storageKey ?? "showMoreOptions";
    const collapse = document.getElementById(collapseId);
    const toggle = document.getElementById(toggleId);

    if (!collapse || !toggle) {
        return false;
    }

    collapse.addEventListener("shown.bs.collapse", () => {
        storage.write(storageKey, true);
    });

    collapse.addEventListener("hidden.bs.collapse", () => {
        storage.write(storageKey, false);
    });

    toggle.addEventListener("click", () => {
        Array.from(toggle.children).forEach((element) => {
            element.classList.toggle("d-none");
        });
    });

    if (storage.read(storageKey)) {
        toggle.click();
    }

    return true;
}

/**
 * Writes an AJAX URL into a data-* attribute consumed by webtrees.load().
 *
 * @param {string} containerId
 * @param {string} ajaxUrl
 * @param {string} [attributeName]
 *
 * @returns {boolean} true when the container exists
 */
export function setChartAjaxUrl(containerId, ajaxUrl, attributeName = "data-wt-ajax-url") {
    const container = document.getElementById(containerId);
    if (!container) {
        return false;
    }

    container.setAttribute(attributeName, ajaxUrl);
    return true;
}

/**
 * Writes chart options into a UMD global namespace when present.
 *
 * @param {string} globalNamespace
 * @param {object} chartOptions
 *
 * @returns {boolean} true when the target namespace exists
 */
export function setChartOptionsGlobal(globalNamespace, chartOptions) {
    const globalScope = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (window));
    const namespaceValue = globalScope[globalNamespace];

    if (typeof namespaceValue !== "object" || namespaceValue === null) {
        return false;
    }

    /** @type {{ chartOptions?: object }} */ (namespaceValue).chartOptions = chartOptions;
    return true;
}

export { Storage };
