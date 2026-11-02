import { afterAll, afterEach, describe, expect, jest, test } from "@jest/globals";

// The fades run on the clock of d3-timer, which reads the clock once when its module is
// loaded. The fake timers are therefore installed before d3 is imported, so a test moves
// time by exactly the span it reasons about and never waits for it.
jest.useFakeTimers();

const { select } = await import("d3-selection");
const { default: ChartOverlay } = await import("src/chart/chart-overlay.js");

afterAll(() => {
    jest.useRealTimers();
});

afterEach(() => {
    document.body.innerHTML = "";
});

const advance = (milliseconds) => jest.advanceTimersByTime(milliseconds);

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

    test("show renders the tooltip text, fades the overlay in and runs the callback", () => {
        const overlay = mount();
        const callback = jest.fn();

        overlay.show("Hello world", 0, callback);

        const tooltip = document.querySelector("#host > div.overlay > p.tooltip");

        expect(tooltip?.textContent).toBe("Hello world");

        advance(50);

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

    test("hide fades a shown overlay out again", () => {
        const overlay = mount();

        overlay.show("Hello world", 0);
        advance(50);

        overlay.hide(0, 0);
        advance(50);

        expect(Number(overlay.get().node().style.opacity)).toBeLessThan(0.01);
    });

    test("hide waits for its delay before the overlay starts to fade", () => {
        const overlay = mount();

        overlay.show("Hello world", 0);
        advance(50);

        overlay.hide(600, 0);
        advance(150);

        expect(Number(overlay.get().node().style.opacity)).toBe(1);

        advance(600);

        expect(Number(overlay.get().node().style.opacity)).toBeLessThan(0.01);
    });

    test("hide spreads the fade over its duration", () => {
        const overlay = mount();

        overlay.show("Hello world", 0);
        advance(50);

        overlay.hide(0, 1200);
        advance(450);

        const midway = Number(overlay.get().node().style.opacity);

        expect(midway).toBeGreaterThan(0.01);
        expect(midway).toBeLessThan(1);

        advance(1200);

        expect(Number(overlay.get().node().style.opacity)).toBeLessThan(0.01);
    });

    test("show runs its callback only once the fade-in duration has passed", () => {
        const overlay = mount();
        const callback = jest.fn();

        overlay.show("Hello world", 1200, callback);
        advance(450);

        expect(callback).not.toHaveBeenCalled();

        advance(1200);

        expect(callback).toHaveBeenCalledTimes(1);
    });
});
