/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * @param {boolean} reduceMotion Whether the user prefers reduced motion
 *
 * @returns {void}
 */
const stubMatchMedia = (reduceMotion) => {
    window.matchMedia = (query) => ({
        matches: reduceMotion && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
    });
};

/**
 * jsdom has no `matchMedia`. Installs a stub on which the user prefers reduced
 * motion, so a widget draws its final state at once.
 *
 * @returns {void}
 */
export const stubReducedMotion = () => {
    stubMatchMedia(true);
};

/**
 * Installs a stub on which the user does not prefer reduced motion, so a widget
 * runs its entrance animation.
 *
 * @returns {void}
 */
export const stubMotionAllowed = () => {
    stubMatchMedia(false);
};
