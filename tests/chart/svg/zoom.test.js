import { describe, expect, test } from "@jest/globals";
import { select } from "d3-selection";
import { zoomIdentity, zoomTransform } from "d3-zoom";

import ChartZoom from "src/chart/svg/chart-zoom.js";

// A real zoom behaviour on a real SVG. jsdom has no layout, so the extent that the
// behaviour measures from the element is given explicitly.
const setup = () => {
    document.body.innerHTML = '<svg id="chart"><g id="stage"></g></svg>';

    const svg = select("#chart");
    const stage = select("#stage");
    const zoom = new ChartZoom(stage);

    zoom.get().extent([
        [0, 0],
        [400, 300],
    ]);
    svg.call(zoom.get());

    return { svg, stage, behavior: zoom.get() };
};

describe("ChartZoom", () => {
    test("applies the zoom transform to the parent group", () => {
        const { svg, stage, behavior } = setup();

        svg.call(behavior.transform, zoomIdentity.translate(3, 4).scale(2));

        expect(stage.attr("transform")).toBe("translate(3,4) scale(2)");
    });

    test.each([
        ["above", 100, 20],
        ["below", 0.001, 0.1],
    ])("keeps the scale within the zoom range, a request %s it", (_label, requested, limit) => {
        const { svg, behavior } = setup();

        svg.call(behavior.scaleTo, requested);

        expect(zoomTransform(svg.node()).k).toBeCloseTo(limit, 6);
    });

    test("filter allows ctrl+wheel", () => {
        const { behavior } = setup();

        expect(behavior.filter()({ type: "wheel", ctrlKey: true, deltaY: -1 })).toBe(true);
    });

    test("filter rejects a wheel event without ctrl so normal scrolling stays free", () => {
        const { behavior } = setup();

        expect(behavior.filter()({ type: "wheel", ctrlKey: false })).toBe(false);
    });

    test.each([
        [
            "a plain left-button drag is allowed",
            { type: "mousedown", ctrlKey: false, button: 0 },
            true,
        ],
        [
            "a ctrl-modified drag is rejected",
            { type: "mousedown", ctrlKey: true, button: 0 },
            false,
        ],
        [
            "a non-left-button drag is rejected",
            { type: "mousedown", ctrlKey: false, button: 2 },
            false,
        ],
    ])("filter: %s", (_label, event, expected) => {
        const { behavior } = setup();

        expect(behavior.filter()(event)).toBe(expected);
    });

    test.each([
        ["two fingers start a pinch", 2, true],
        ["a single finger does not capture the touch", 1, false],
        ["three fingers do not capture the touch", 3, false],
    ])("filter on touchstart: %s", (_label, touchCount, expected) => {
        const { behavior } = setup();

        expect(
            behavior.filter()({
                type: "touchstart",
                ctrlKey: false,
                touches: new Array(touchCount),
            }),
        ).toBe(expected);
    });

    test("wheelDelta scales wheel movement", () => {
        const { behavior } = setup();
        const wheelDelta = behavior.wheelDelta();

        expect(wheelDelta({ deltaY: 10, deltaMode: 0 })).toBeCloseTo(-0.02);
        expect(wheelDelta({ deltaY: 10, deltaMode: 1 })).toBeCloseTo(-0.5);
        expect(wheelDelta({ deltaY: 10, deltaMode: 2 })).toBeCloseTo(-10);
    });
});
