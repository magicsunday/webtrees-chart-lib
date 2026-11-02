import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { select } from "d3-selection";

import ChartOverlay from "src/chart/chart-overlay.js";
import { pause, until } from "../support/wait.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const mount = () => {
    document.body.innerHTML = '<div id="host"></div>';

    return new ChartOverlay(select("#host"));
};

describe("ChartOverlay", () => {
    test("starts as a transparent overlay element inside its parent", () => {
        mount();

        const element = document.querySelector("#host > div.overlay");

        expect(element).not.toBeNull();
        expect(Number(element.style.opacity)).toBeLessThan(0.01);
    });

    test("show renders the tooltip text, fades the overlay in and runs the callback", async () => {
        const overlay = mount();
        const callback = jest.fn();

        overlay.show("Hello world", 0, callback);

        const tooltip = document.querySelector("#host > div.overlay > p.tooltip");

        expect(tooltip?.textContent).toBe("Hello world");

        await until(() => callback.mock.calls.length > 0);

        expect(Number(overlay.get().node().style.opacity)).toBe(1);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    test("show replaces the text of an earlier tooltip", () => {
        const overlay = mount();

        overlay.show("First");
        overlay.show("Second");

        const tooltips = document.querySelectorAll("#host > div.overlay > p.tooltip");

        expect(tooltips).toHaveLength(1);
        expect(tooltips[0].textContent).toBe("Second");
    });

    test("hide fades a shown overlay out again", async () => {
        const overlay = mount();
        const callback = jest.fn();

        overlay.show("Hello world", 0, callback);
        await until(() => callback.mock.calls.length > 0);

        overlay.hide(0, 0);
        await until(() => Number(overlay.get().node().style.opacity) < 0.01);

        expect(Number(overlay.get().node().style.opacity)).toBeLessThan(0.01);
    });

    test("hide waits for its delay before the overlay starts to fade", async () => {
        const overlay = mount();
        const callback = jest.fn();

        overlay.show("Hello world", 0, callback);
        await until(() => callback.mock.calls.length > 0);

        overlay.hide(600, 0);
        await pause(150);

        expect(Number(overlay.get().node().style.opacity)).toBe(1);

        await until(() => Number(overlay.get().node().style.opacity) < 0.01);
    });

    test("hide spreads the fade over its duration", async () => {
        const overlay = mount();
        const callback = jest.fn();

        overlay.show("Hello world", 0, callback);
        await until(() => callback.mock.calls.length > 0);

        // The duration is far longer than the default of a transition, so a dropped
        // argument would have finished the fade before the pause is over.
        overlay.hide(0, 1200);
        await pause(450);

        const midway = Number(overlay.get().node().style.opacity);

        expect(midway).toBeGreaterThan(0.01);
        expect(midway).toBeLessThan(1);

        await until(() => Number(overlay.get().node().style.opacity) < 0.01);
    });

    test("show runs its callback only once the fade-in duration has passed", async () => {
        const overlay = mount();
        const callback = jest.fn();

        // Longer than the default of a transition, as in the hide test above.
        overlay.show("Hello world", 1200, callback);
        await pause(450);

        expect(callback).not.toHaveBeenCalled();

        await until(() => callback.mock.calls.length > 0);

        expect(callback).toHaveBeenCalledTimes(1);
    });
});
