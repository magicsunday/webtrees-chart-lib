/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { afterEach, describe, expect, test } from "@jest/globals";
import BaseWidget from "src/chart/widgets/base-widget.js";
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
// option. `elsewhere` names an accessor of the widget that this table leaves out,
// with the test file that pins it and why it does not fit the table.
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
            elsewhere: {
                ease: "diverging-bar-chart.test.js, an easing name or function",
                groupLabel:
                    "diverging-bar-chart.test.js, a label with a pinned fallback to the category",
            },
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
        "NameBubbles",
        {
            defaults: { emptyMessage: "" },
            options: [
                { name: "accent", value: "teal", ok: [], bad: ["", 42], fallback: "currentColor" },
            ],
        },
    ],
    [
        "NameTimeline",
        {
            defaults: { emptyMessage: "No data available" },
            options: [],
            elsewhere: {
                activeLabel:
                    "name-timeline.test.js, the reveal of the active row is not a plain option",
                valueMin: "name-timeline.test.js, a number override with an axis effect",
                valueMax: "name-timeline.test.js, a number override with an axis effect",
            },
        },
    ],
    [
        "NetworkGraph",
        {
            defaults: { emptyMessage: "" },
            options: [
                { name: "accent", value: "teal", ok: [], bad: ["", 42], fallback: "currentColor" },
                {
                    name: "i18n",
                    value: { capBadge: "{shown} of {total}" },
                    ok: [],
                    bad: ["x", null, 5],
                    fallback: {},
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
    ["SequenceChain", { defaults: { emptyMessage: "No data available" }, options: [] }],
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
    [
        "WorldMap",
        {
            // No placeholder: the map draws the world outline for an empty dataset.
            defaults: {},
            options: [],
            elsewhere: {
                geojson: "world-map.test.js, a required option whose setter throws",
                projection: "world-map.test.js, a projection object whose setter throws",
                accent: "world-map.test.js, an optional accent that stays unset by default",
            },
        },
    ],
];

// BaseWidget keeps the accent and i18n accessors inert until a widget assigns them in
// its constructor, which leaves the backing field on the instance.
const OPT_IN_FIELDS = { accent: "_accent", i18n: "_i18n" };

// The accessors a widget owns on top of those of BaseWidget: its own and inherited ones
// below BaseWidget, and the opt-in ones it has activated.
const accessorNames = (instance) => {
    const names = new Set();

    for (let object = instance; object && object !== Object.prototype; ) {
        for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(object))) {
            if (key !== "__proto__" && (descriptor.get || descriptor.set)) {
                names.add(key);
            }
        }

        object = Object.getPrototypeOf(object);
    }

    return names;
};

const ownAccessors = (instance, baseNames) => [
    ...[...accessorNames(instance)].filter((name) => !baseNames.has(name)),
    ...Object.entries(OPT_IN_FIELDS)
        .filter(([, field]) => Object.hasOwn(instance, field))
        .map(([name]) => name),
];

const buildWidget = (Widget, name) => {
    document.body.innerHTML = '<div id="t"></div>';

    return new Widget("#t", { ...REQUIRED[name] });
};

describe("the option table and the widgets", () => {
    test("holds a row for every widget and for nothing else", () => {
        expect(OPTION_ROWS.map(([name]) => name).sort()).toEqual(WIDGETS.map(([name]) => name));
    });

    test.each(OPTION_ROWS)(
        "%s: every accessor beyond the base ones has an option row or an entry in elsewhere",
        (name, spec) => {
            const base = accessorNames(buildWidget(BaseWidget, "BaseWidget"));
            const own = ownAccessors(buildWidget(WIDGET_BY_NAME.get(name), name), base).sort();
            const listed = [
                ...spec.options.map((option) => option.name),
                ...Object.keys(spec.elsewhere ?? {}),
            ].sort();

            expect(listed).toEqual(own);
        },
    );
});

describe.each(OPTION_ROWS)("%s option accessors", (name, spec) => {
    const build = (options) => {
        document.body.innerHTML = '<div id="t"></div>';
        return new (WIDGET_BY_NAME.get(name))("#t", options);
    };

    // A widget without a placeholder has no default to pin, and jest refuses an empty table.
    const defaults = Object.entries(spec.defaults);
    const options = spec.options.map((option) => [option.name, option]);

    if (defaults.length > 0) {
        test.each(defaults)(
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
    }

    if (options.length > 0) {
        test.each(options)(
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
    }
});
