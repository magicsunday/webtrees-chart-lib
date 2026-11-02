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
 * @param {() => boolean} check   The state to wait for
 * @param {number}        timeout Longest wait in milliseconds
 *
 * @returns {Promise<void>}
 */
export const until = async (check, timeout = 2000) => {
    const start = Date.now();

    while (!check()) {
        if (Date.now() - start > timeout) {
            throw new Error("The expected state did not arrive in time");
        }

        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

/**
 * Lets a fixed time pass, for a test that observes the state in the middle of a timed
 * effect such as a delayed or slow d3 transition.
 *
 * @param {number} milliseconds The time to let pass
 *
 * @returns {Promise<void>}
 */
export const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
