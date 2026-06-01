import { afterEach, describe, expect, test } from "@jest/globals";

import WorldMap from "src/chart/widgets/world-map.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const FAKE_GEO = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { iso_a2: "DE", name: "Germany" },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [0, 0],
                        [1, 0],
                        [1, 1],
                        [0, 0],
                    ],
                ],
            },
        },
        {
            type: "Feature",
            properties: { iso_a2: "FR", name: "France" },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [2, 2],
                        [3, 2],
                        [3, 3],
                        [2, 2],
                    ],
                ],
            },
        },
    ],
};

const makeTarget = (id = "m", { width = 640, height = 320 } = {}) => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    const el = document.getElementById(id);
    Object.defineProperty(el, "clientWidth", { value: width });
    Object.defineProperty(el, "clientHeight", { value: height });
    return el;
};

describe("WorldMap — construction", () => {
    test("throws when options.geojson is missing", () => {
        makeTarget();
        expect(() => new WorldMap("#m", {})).toThrow(/geojson/i);
    });

    test("throws when options.geojson is null", () => {
        makeTarget();
        expect(() => new WorldMap("#m", { geojson: null })).toThrow(/geojson/i);
    });

    test("throws when options.geojson is not a FeatureCollection", () => {
        makeTarget();
        expect(() => new WorldMap("#m", { geojson: { type: "Bogus" } })).toThrow(
            /FeatureCollection/,
        );
    });
});

describe("WorldMap — empty + null states", () => {
    // For the map widget the geometry IS the primary signal — readers
    // expect to see the world even when no records landed on it. So
    // draw([]) / draw(null) keep rendering the full geojson, every
    // feature falling back to `emptyFill` (data-count='0') the same
    // way an unmatched feature in a non-empty dataset does.
    test("draw([]) renders the full geojson with zero counts", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([]);
        const paths = document.querySelectorAll("#m svg path.msc-world-map-region");
        expect(paths).toHaveLength(2);
        for (const p of paths) {
            expect(p.getAttribute("data-count")).toBe("0");
        }
        expect(document.querySelector("#m > .chart-empty-state")).toBeNull();
    });

    test("draw(null) renders the full geojson without crashing", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw(null);
        const paths = document.querySelectorAll("#m svg path.msc-world-map-region");
        expect(paths).toHaveLength(2);
        for (const p of paths) {
            expect(p.getAttribute("data-count")).toBe("0");
        }
    });

    test("custom emptyMessage is accepted but unused (geometry renders instead)", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO, emptyMessage: "kein Wert" }).draw([]);
        // No placeholder is emitted — geometry renders with zero counts.
        expect(document.querySelector("#m > .chart-empty-state")).toBeNull();
        expect(document.querySelector("#m svg")).not.toBeNull();
    });
});

describe("WorldMap — choropleth rendering", () => {
    test("renders one <path.msc-world-map-region> per geojson feature", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { code: "DE", label: "Germany", count: 5 },
        ]);
        expect(document.querySelectorAll("#m svg path.msc-world-map-region")).toHaveLength(2);
    });

    test("matches rows to features by iso_a2 case-insensitively", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { code: "de", label: "Germany", count: 5 },
            { code: "FR", label: "France", count: 2 },
        ]);
        const counts = Array.from(
            document.querySelectorAll("#m svg path.msc-world-map-region"),
        ).map((p) => p.getAttribute("data-count"));
        expect(counts).toEqual(["5", "2"]);
    });

    test("feature without data carries data-count='0'", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { code: "DE", label: "Germany", count: 5 },
        ]);
        const fr = Array.from(document.querySelectorAll("#m svg path.msc-world-map-region")).find(
            (p) => p.getAttribute("data-iso") === "FR",
        );
        expect(fr.getAttribute("data-count")).toBe("0");
    });

    test("each feature carries data-iso with uppercase iso_a2", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { code: "de", label: "Germany", count: 5 },
        ]);
        const isos = Array.from(document.querySelectorAll("#m svg path.msc-world-map-region")).map(
            (p) => p.getAttribute("data-iso"),
        );
        expect(isos.sort()).toEqual(["DE", "FR"]);
    });

    test("no native <title> child on region paths (tooltip handled by chart-lib overlay)", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { code: "DE", label: "Germany", count: 5 },
        ]);
        expect(document.querySelectorAll("#m svg path.msc-world-map-region title")).toHaveLength(0);
    });

    test("svg has viewBox sized to target", () => {
        makeTarget("m", { width: 800, height: 400 });
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { code: "DE", label: "Germany", count: 1 },
        ]);
        const svg = document.querySelector("#m svg");
        expect(svg.getAttribute("viewBox")).toBe("0 0 800 400");
    });

    test("redraw replaces prior svg, does not stack", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO });
        w.draw([{ code: "DE", label: "Germany", count: 5 }]);
        w.draw([{ code: "FR", label: "France", count: 9 }]);
        expect(document.querySelectorAll("#m svg")).toHaveLength(1);
    });

    test("redraw from data → empty keeps the svg and resets every data-count to 0", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO });
        w.draw([{ code: "DE", label: "Germany", count: 5 }]);
        w.draw([]);
        expect(document.querySelector("#m svg")).not.toBeNull();
        expect(document.querySelector("#m > .chart-empty-state")).toBeNull();
        const paths = document.querySelectorAll("#m svg path.msc-world-map-region");
        for (const p of paths) {
            expect(p.getAttribute("data-count")).toBe("0");
        }
    });

    test("redraw from empty → data replaces zero-count svg with the data-bound svg", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO });
        w.draw([]);
        w.draw([{ code: "DE", label: "Germany", count: 5 }]);
        expect(document.querySelectorAll("#m > .chart-empty-state")).toHaveLength(0);
        expect(document.querySelectorAll("#m svg")).toHaveLength(1);
        const de = Array.from(document.querySelectorAll("#m svg path.msc-world-map-region")).find(
            (p) => p.getAttribute("data-iso") === "DE",
        );
        expect(de.getAttribute("data-count")).toBe("5");
    });
});

describe("WorldMap — data sanitization", () => {
    test("rows with non-string code are skipped", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { code: 42, label: "X", count: 1 },
            { code: "DE", label: "Germany", count: 5 },
        ]);
        const byIso = Array.from(
            document.querySelectorAll("#m svg path.msc-world-map-region"),
        ).reduce((acc, p) => {
            acc[p.getAttribute("data-iso")] = p.getAttribute("data-count");
            return acc;
        }, {});
        expect(byIso.DE).toBe("5");
        // The non-string-code row carried count 1 but must be dropped entirely,
        // so no feature picks it up — every other feature stays at 0.
        expect(byIso.FR).toBe("0");
    });

    test("rows with non-finite count are coerced to 0", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { code: "DE", label: "Germany", count: Number.NaN },
        ]);
        const de = Array.from(document.querySelectorAll("#m svg path.msc-world-map-region")).find(
            (p) => p.getAttribute("data-iso") === "DE",
        );
        expect(de.getAttribute("data-count")).toBe("0");
    });

    test("null entries in data array are skipped (no crash)", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            null,
            { code: "DE", label: "Germany", count: 5 },
        ]);
        expect(document.querySelectorAll("#m svg path.msc-world-map-region")).toHaveLength(2);
    });

    test("code with surrounding whitespace still matches feature", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { code: "  DE  ", label: "Germany", count: 42 },
        ]);
        const de = Array.from(document.querySelectorAll("#m svg path.msc-world-map-region")).find(
            (p) => p.getAttribute("data-iso") === "DE",
        );
        expect(de.getAttribute("data-count")).toBe("42");
    });
});

describe("WorldMap — defensive against malformed geojson", () => {
    test("null features in geojson.features are filtered, draw does not crash", () => {
        makeTarget();
        const geo = {
            type: "FeatureCollection",
            features: [null, FAKE_GEO.features[0], undefined, FAKE_GEO.features[1]],
        };
        new WorldMap("#m", { geojson: geo }).draw([{ code: "DE", label: "Germany", count: 5 }]);
        expect(document.querySelectorAll("#m svg path.msc-world-map-region")).toHaveLength(2);
    });

    test("feature with non-string iso_a2 (numeric -99) does not crash", () => {
        makeTarget();
        const geo = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: { iso_a2: -99, name: "Disputed" },
                    geometry: {
                        type: "Polygon",
                        coordinates: [
                            [
                                [0, 0],
                                [1, 0],
                                [1, 1],
                                [0, 0],
                            ],
                        ],
                    },
                },
            ],
        };
        new WorldMap("#m", { geojson: geo }).draw([{ code: "DE", label: "Germany", count: 5 }]);
        const path = document.querySelector("#m svg path.msc-world-map-region");
        expect(path).not.toBeNull();
        expect(path.getAttribute("data-iso")).toBe("-99");
    });

    test("feature with null properties does not crash", () => {
        makeTarget();
        const geo = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: null,
                    geometry: {
                        type: "Polygon",
                        coordinates: [
                            [
                                [0, 0],
                                [1, 0],
                                [1, 1],
                                [0, 0],
                            ],
                        ],
                    },
                },
            ],
        };
        new WorldMap("#m", { geojson: geo }).draw([{ code: "DE", label: "Germany", count: 5 }]);
        expect(
            document.querySelector("#m svg path.msc-world-map-region").getAttribute("data-iso"),
        ).toBe("");
    });
});

describe("WorldMap — projection validation", () => {
    test("throws on projection without fitSize", () => {
        makeTarget();
        expect(() => new WorldMap("#m", { geojson: FAKE_GEO, projection: {} })).toThrow(/fitSize/);
    });

    test("throws on projection as plain function (no fitSize)", () => {
        makeTarget();
        expect(() => new WorldMap("#m", { geojson: FAKE_GEO, projection: () => {} })).toThrow(
            /fitSize/,
        );
    });

    test("accepts a valid d3-geo-style projection", () => {
        makeTarget();
        const fakeProjection = { fitSize: () => fakeProjection };
        expect(
            () => new WorldMap("#m", { geojson: FAKE_GEO, projection: fakeProjection }),
        ).not.toThrow();
    });
});

describe("WorldMap — native get/set accessors", () => {
    test("getters read back the values passed via options", () => {
        makeTarget();
        const fakeProjection = { fitSize: () => fakeProjection };
        const scale = (value) => `rgb(${value},0,0)`;
        const w = new WorldMap("#m", {
            geojson: FAKE_GEO,
            projection: fakeProjection,
            colorScale: scale,
            accent: "#336699",
            width: 800,
            height: 400,
            emptyMessage: "nothing here",
        });
        expect(w.geojson.type).toBe("FeatureCollection");
        expect(w.projection).toBe(fakeProjection);
        expect(w.colorScale).toBe(scale);
        expect(w.accent).toBe("#336699");
        expect(w.width).toBe(800);
        expect(w.height).toBe(400);
        expect(w.emptyMessage).toBe("nothing here");
    });

    test("optional options default to undefined / built-ins when omitted", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO });
        expect(w.projection).toBeUndefined();
        expect(w.colorScale).toBeUndefined();
        expect(w.accent).toBeUndefined();
        expect(w.width).toBeUndefined();
        expect(w.height).toBeUndefined();
        expect(w.emptyMessage).toBe("No data available");
    });

    test("geojson getter exposes the filtered FeatureCollection", () => {
        makeTarget();
        const geo = {
            type: "FeatureCollection",
            features: [null, FAKE_GEO.features[0], undefined, FAKE_GEO.features[1]],
        };
        const w = new WorldMap("#m", { geojson: geo });
        expect(w.geojson.features).toHaveLength(2);
    });

    test("colorScale setter clears the override on a non-function value", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO });
        w.colorScale = /** @type {any} */ ("not-a-function");
        expect(w.colorScale).toBeUndefined();
        w.colorScale = /** @type {any} */ (42);
        expect(w.colorScale).toBeUndefined();
    });

    test("accent setter clears the override on an empty or non-string value", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO, accent: "#abcdef" });
        w.accent = "";
        expect(w.accent).toBeUndefined();
        w.accent = /** @type {any} */ (123);
        expect(w.accent).toBeUndefined();
    });

    test("width setter clears the override on a non-positive or non-finite value", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO, width: 500 });
        w.width = /** @type {any} */ (-10);
        expect(w.width).toBeUndefined();
        w.width = /** @type {any} */ (Number.NaN);
        expect(w.width).toBeUndefined();
        w.width = /** @type {any} */ ("nope");
        expect(w.width).toBeUndefined();
    });

    test("height setter clears the override on a non-positive or non-finite value", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO, height: 250 });
        w.height = /** @type {any} */ (0);
        expect(w.height).toBeUndefined();
        w.height = /** @type {any} */ (Number.POSITIVE_INFINITY);
        expect(w.height).toBeUndefined();
    });

    test("emptyMessage setter resets to the default on a non-string value", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO, emptyMessage: "custom" });
        w.emptyMessage = /** @type {any} */ (null);
        expect(w.emptyMessage).toBe("No data available");
    });

    test("projection setter throws on a present value without fitSize", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO });
        expect(() => {
            w.projection = /** @type {any} */ ({});
        }).toThrow(/fitSize/);
    });

    test("projection setter accepts undefined to clear the override", () => {
        makeTarget();
        const fakeProjection = { fitSize: () => fakeProjection };
        const w = new WorldMap("#m", { geojson: FAKE_GEO, projection: fakeProjection });
        w.projection = undefined;
        expect(w.projection).toBeUndefined();
    });

    test("geojson setter throws on an invalid FeatureCollection", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO });
        expect(() => {
            w.geojson = /** @type {any} */ ({ type: "Bogus" });
        }).toThrow(/FeatureCollection/);
    });

    test("explicit width/height override the container size in the rendered svg", () => {
        makeTarget("m", { width: 640, height: 320 });
        new WorldMap("#m", { geojson: FAKE_GEO, width: 900, height: 450 }).draw([
            { code: "DE", label: "Germany", count: 1 },
        ]);
        const svg = document.querySelector("#m svg");
        expect(svg.getAttribute("viewBox")).toBe("0 0 900 450");
        expect(svg.getAttribute("width")).toBe("900");
        expect(svg.getAttribute("height")).toBe("450");
    });

    test("draw falls back to the container size when width/height are unset", () => {
        makeTarget("m", { width: 700, height: 360 });
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { code: "DE", label: "Germany", count: 1 },
        ]);
        const svg = document.querySelector("#m svg");
        expect(svg.getAttribute("viewBox")).toBe("0 0 700 360");
    });

    test("dispatcher Object.entries → widget[k] = v assigns every option", () => {
        makeTarget();
        const fakeProjection = { fitSize: () => fakeProjection };
        const scale = (value) => `rgb(0,0,${value})`;
        const w = new WorldMap("#m", { geojson: FAKE_GEO });
        const config = {
            projection: fakeProjection,
            colorScale: scale,
            accent: "#102030",
            width: 720,
            height: 360,
            emptyMessage: "empty",
        };
        for (const [key, value] of Object.entries(config)) {
            w[key] = value;
        }
        expect(w.projection).toBe(fakeProjection);
        expect(w.colorScale).toBe(scale);
        expect(w.accent).toBe("#102030");
        expect(w.width).toBe(720);
        expect(w.height).toBe(360);
        expect(w.emptyMessage).toBe("empty");
    });
});
