/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

/**
 * Waits until a check holds. A d3 transition and the export pipelines run on timers
 * and promise chains, so a test waits for the state it observes to arrive.
 *
 * @param {() => boolean} check The state to wait for
 *
 * @returns {Promise<void>}
 */
export const until = async (check) => {
    const start = Date.now();

    while (!check()) {
        if (Date.now() - start > 2000) {
            throw new Error("The expected state did not arrive in time");
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};
