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
// widget needs no copy of these cases. The last table pins the option accessors
// that the widgets own themselves and the defaults they hand to BaseWidget.
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

describe.each(WIDGETS)("%s responsive size", (_name, Widget) => {
    test("without width and height options both stay undefined", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const widget = new Widget("#t", { ...REQUIRED[_name] });

        expect(widget.width).toBeUndefined();
        expect(widget.height).toBeUndefined();
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

const WIDGET_BY_NAME = new Map(WIDGETS);

const PACK = { totalSingular: "{count} Person", totalPlural: "{count} Personen" };
const TEXT_GUARD = [42, null, {}];
const FLAG_GUARD = ["yes", 1, null];

// A margin is four finite non-negative numbers and an accessible label is a text. The
// README documents only the default of the empty message, so the other defaults are
// checked by their structure and a consumer reads the value from the accessor.
const MARGIN = Symbol("margin");
const NAMED = Symbol("named label");

// One entry per widget. `defaults` holds the values a widget hands to BaseWidget
// (margin, ariaLabel, emptyMessage) and `options` the accessors the widget owns:
// `value` is a valid value, `ok` further valid values, `bad` values that the
// setter must replace with `fallback`, which is also the default of an omitted
// option.
const OPTION_ROWS = [
    [
        "AreaDensity",
        {
            defaults: {
                margin: MARGIN,
                ariaLabel: NAMED,
                emptyMessage: "No data available",
            },
            options: [
                { name: "showLine", value: false, ok: [true], bad: FLAG_GUARD, fallback: true },
                { name: "xLabel", value: "years", ok: [""], bad: TEXT_GUARD, fallback: "" },
                { name: "yLabel", value: "count", ok: [""], bad: TEXT_GUARD, fallback: "" },
            ],
        },
    ],
    [
        "BarChart",
        {
            defaults: {
                margin: MARGIN,
                ariaLabel: NAMED,
                emptyMessage: "No data available",
            },
            options: [
                {
                    name: "orientation",
                    value: "horizontal",
                    ok: ["vertical"],
                    bad: ["diagonal", 3, null],
                    fallback: "vertical",
                },
                { name: "brush", value: true, ok: [false], bad: FLAG_GUARD, fallback: false },
                { name: "xLabel", value: "Age", ok: [""], bad: TEXT_GUARD, fallback: "" },
                { name: "yLabel", value: "Count", ok: [""], bad: TEXT_GUARD, fallback: "" },
            ],
        },
    ],
    [
        "BoxPlot",
        {
            defaults: {
                margin: MARGIN,
                ariaLabel: NAMED,
                emptyMessage: "No data available",
            },
            options: [
                {
                    name: "orientation",
                    value: "horizontal",
                    ok: ["vertical"],
                    bad: ["diagonal", 3, null],
                    fallback: "vertical",
                },
            ],
        },
    ],
    [
        "ChordDiagram",
        {
            defaults: { ariaLabel: NAMED, emptyMessage: "No data available" },
            options: [{ name: "i18n", value: PACK, ok: [], bad: ["x", null, 5], fallback: {} }],
        },
    ],
    [
        "DivergingBarChart",
        {
            defaults: { emptyMessage: "" },
            options: ["leftLabel", "rightLabel", "axisLabel", "categoryUnit", "valueLabel"].map(
                (name) => ({
                    name,
                    value: "Text",
                    ok: [""],
                    bad: [5, null, undefined],
                    fallback: "",
                }),
            ),
        },
    ],
    [
        "DonutChart",
        {
            defaults: { emptyMessage: "No data available" },
            options: [
                {
                    name: "holeSize",
                    value: 40,
                    ok: [0],
                    bad: [-1, Number.NaN, Number.POSITIVE_INFINITY, "10", null, {}],
                    fallback: undefined,
                },
                {
                    name: "centerLabel",
                    value: "Members",
                    ok: [""],
                    bad: [123, null, undefined, {}, []],
                    fallback: "",
                },
                {
                    name: "centerValue",
                    value: "230",
                    ok: [""],
                    bad: [123, null, undefined, {}, []],
                    fallback: "",
                },
            ],
        },
    ],
    [
        "EventTimeline",
        {
            defaults: { ariaLabel: NAMED },
            options: [
                { name: "accent", value: "teal", ok: [], bad: ["", 42], fallback: "currentColor" },
            ],
        },
    ],
    [
        "GaugeArc",
        {
            defaults: { emptyMessage: "" },
            options: [
                {
                    name: "accent",
                    value: "rebeccapurple",
                    ok: [],
                    bad: ["", 42],
                    fallback: "currentColor",
                },
            ],
        },
    ],
    [
        "Heatmap",
        {
            defaults: {
                margin: MARGIN,
                emptyMessage: "",
            },
            options: [
                {
                    name: "accent",
                    value: "var(--ochre)",
                    ok: [],
                    bad: ["", 42],
                    fallback: "currentColor",
                },
                { name: "valueLabel", value: "deaths", ok: [""], bad: TEXT_GUARD, fallback: "" },
            ],
        },
    ],
    [
        "LineChart",
        {
            defaults: {
                margin: MARGIN,
                ariaLabel: NAMED,
                emptyMessage: "No data available",
            },
            options: [
                { name: "showArea", value: false, ok: [true], bad: FLAG_GUARD, fallback: true },
                {
                    name: "multiSeriesArea",
                    value: true,
                    ok: [false],
                    bad: FLAG_GUARD,
                    fallback: false,
                },
                {
                    name: "perPointTooltip",
                    value: true,
                    ok: [false],
                    bad: FLAG_GUARD,
                    fallback: false,
                },
                { name: "xLabel", value: "Decade", ok: [""], bad: TEXT_GUARD, fallback: "" },
                { name: "yLabel", value: "Count", ok: [""], bad: TEXT_GUARD, fallback: "" },
                { name: "yUnit", value: " %", ok: [""], bad: TEXT_GUARD, fallback: "" },
                { name: "xLabelEvery", value: 2, ok: [5], bad: [0, -4, "nope"], fallback: 1 },
            ],
        },
    ],
    [
        "MirrorHistogram",
        {
            defaults: { emptyMessage: "" },
            options: [
                { name: "topLabel", value: "Husbands", ok: [""], bad: TEXT_GUARD, fallback: "" },
                { name: "bottomLabel", value: "Wives", ok: [""], bad: TEXT_GUARD, fallback: "" },
            ],
        },
    ],
    [
        "MonthRadial",
        {
            defaults: { emptyMessage: "" },
            options: [
                {
                    name: "accent",
                    value: "rebeccapurple",
                    ok: [],
                    bad: ["", 42],
                    fallback: "currentColor",
                },
                {
                    name: "centerLabel",
                    value: "Maximum",
                    ok: [],
                    bad: ["", 42],
                    fallback: "Peak",
                },
            ],
        },
    ],
    [
        "SankeyFlow",
        {
            defaults: {
                margin: MARGIN,
                ariaLabel: NAMED,
                emptyMessage: "No data available",
            },
            options: [{ name: "i18n", value: PACK, ok: [], bad: ["x", null, 5], fallback: {} }],
        },
    ],
    [
        "StackedBar",
        {
            defaults: {
                margin: MARGIN,
                ariaLabel: NAMED,
                emptyMessage: "No data available",
            },
            options: [
                { name: "legend", value: false, ok: [true], bad: FLAG_GUARD, fallback: true },
                { name: "percentage", value: true, ok: [false], bad: FLAG_GUARD, fallback: false },
                {
                    name: "i18n",
                    value: { totalInCategoryPattern: "{count} all up" },
                    ok: [],
                    bad: ["x", null, 5],
                    fallback: {},
                },
            ],
        },
    ],
    [
        "StreamGraph",
        {
            defaults: {
                margin: MARGIN,
                ariaLabel: NAMED,
                emptyMessage: "No data available",
            },
            options: [{ name: "i18n", value: PACK, ok: [], bad: ["x", null, 5], fallback: {} }],
        },
    ],
    [
        "Treemap",
        {
            defaults: { emptyMessage: "" },
            options: [
                {
                    name: "accent",
                    value: "var(--slate)",
                    ok: [],
                    bad: ["", 42],
                    fallback: "currentColor",
                },
                { name: "valueLabel", value: "persons", ok: [""], bad: TEXT_GUARD, fallback: "" },
                {
                    name: "restLabel",
                    value: "übrige",
                    ok: [],
                    bad: ["", 42],
                    fallback: "Rest",
                },
            ],
        },
    ],
];

describe.each(OPTION_ROWS)("%s option accessors", (name, spec) => {
    const build = (options) => {
        document.body.innerHTML = '<div id="t"></div>';
        return new (WIDGET_BY_NAME.get(name))("#t", options);
    };

    test.each(Object.entries(spec.defaults))(
        "an omitted %s takes the default the widget hands to BaseWidget",
        (key, expected) => {
            const actual = build({})[key];

            if (expected === MARGIN) {
                expect(Object.keys(actual).sort()).toEqual(["bottom", "left", "right", "top"]);
                expect(
                    Object.values(actual).every((side) => Number.isFinite(side) && side >= 0),
                ).toBe(true);
            } else if (expected === NAMED) {
                expect(typeof actual).toBe("string");
                expect(actual).not.toBe("");
            } else {
                expect(actual).toEqual(expected);
            }
        },
    );

    test.each(spec.options.map((option) => [option.name, option]))(
        "%s reads back the constructor option, defaults when omitted and guards the setter",
        (_option, option) => {
            expect(build({ [option.name]: option.value })[option.name]).toEqual(option.value);
            expect(build({})[option.name]).toEqual(option.fallback);

            const widget = build({});
            for (const accepted of [option.value, ...option.ok]) {
                widget[option.name] = accepted;
                expect(widget[option.name]).toEqual(accepted);
            }

            for (const rejected of option.bad) {
                widget[option.name] = option.value;
                widget[option.name] = rejected;
                expect(widget[option.name]).toEqual(option.fallback);
            }
        },
    );
});
