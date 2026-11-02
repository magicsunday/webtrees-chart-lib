/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Build the function a widget test file uses to mount its host element. The
 * returned function replaces the document body with one host `div` and returns it.
 *
 * jsdom performs no layout, so a measured size is given as `width` and `height`,
 * which become `clientWidth` and `clientHeight` of the host. The defaults of the
 * factory can be overridden per call.
 *
 * @param {string}                            defaultId Id of the host when a call names none
 * @param {{width?: number, height?: number}} [defaults] Size applied to every host
 *
 * @returns {(id?: string, overrides?: {width?: number, height?: number}) => HTMLElement}
 */
export const targetMaker =
    (defaultId, defaults = {}) =>
    (id = defaultId, overrides = {}) => {
        const { width, height } = { ...defaults, ...overrides };

        document.body.innerHTML = `<div id="${id}"></div>`;

        const element = /** @type {HTMLElement} */ (document.getElementById(id));

        if (width !== undefined) {
            Object.defineProperty(element, "clientWidth", { value: width, configurable: true });
        }

        if (height !== undefined) {
            Object.defineProperty(element, "clientHeight", { value: height, configurable: true });
        }

        return element;
    };
