/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { afterEach, describe, expect, test } from "@jest/globals";
import * as widgetModule from "src/widgets.js";

// Every widget hands its constructor options to BaseWidget, which owns the
// width, height, margin, ariaLabel and emptyMessage accessors and pins their
// validation in base-widget.test.js. What only a real widget can show is that
// its own constructor forwards those options and renders the placeholder text
// from the emptyMessage accessor. One table covers all widgets, so a new
// widget needs no copy of these cases.
const WIDGETS = Object.entries(widgetModule).sort(([left], [right]) => left.localeCompare(right));

// Options a widget cannot be built without.
const REQUIRED = {
    WorldMap: { geojson: { type: "FeatureCollection", features: [] } },
};

// WorldMap has no placeholder: it draws the world outline for an empty dataset.
const WITH_PLACEHOLDER = WIDGETS.filter(([name]) => name !== "WorldMap");

afterEach(() => {
    document.body.innerHTML = "";
    window.matchMedia = undefined;
});

describe.each(WIDGETS)("%s — base options", (_name, Widget) => {
    test("forwards width, height, margin, ariaLabel and emptyMessage to the base accessors", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const widget = new Widget("#t", {
            ...REQUIRED[_name],
            width: 640,
            height: 360,
            margin: { left: 7 },
            ariaLabel: "Custom label",
            emptyMessage: "Custom message",
        });

        expect(widget.width).toBe(640);
        expect(widget.height).toBe(360);
        expect(widget.margin.left).toBe(7);
        expect(widget.ariaLabel).toBe("Custom label");
        expect(widget.emptyMessage).toBe("Custom message");
    });
});

describe.each(WITH_PLACEHOLDER)("%s — empty placeholder", (_name, Widget) => {
    test("renders the emptyMessage accessor as the placeholder text for an empty draw", () => {
        document.body.innerHTML = '<div id="t"></div>';
        new Widget("#t", { emptyMessage: "Custom message" }).draw(null);

        expect(document.querySelector("#t > .chart-empty-state")?.textContent).toBe(
            "Custom message",
        );
    });
});
