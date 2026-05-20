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
            geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
        {
            type: "Feature",
            properties: { iso_a2: "FR", name: "France" },
            geometry: { type: "Polygon", coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
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
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([]);
        expect(document.querySelector("#m > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#m svg")).toBeNull();
    });

    test("draw(null) renders empty-state without crashing", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw(null);
        expect(document.querySelector("#m > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO, emptyMessage: "kein Wert" }).draw([]);
        expect(document.querySelector("#m > .chart-empty-state").textContent)
            .toBe("kein Wert");
    });
});

describe("WorldMap — choropleth rendering", () => {
    test("renders one <path.country> per geojson feature", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { countryCode: "DE", label: "Germany", count: 5 },
        ]);
        expect(document.querySelectorAll("#m svg path.country")).toHaveLength(2);
    });

    test("matches rows to features by iso_a2 case-insensitively", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { countryCode: "de", label: "Germany", count: 5 },
            { countryCode: "FR", label: "France",  count: 2 },
        ]);
        const counts = Array.from(document.querySelectorAll("#m svg path.country"))
            .map((p) => p.getAttribute("data-count"));
        expect(counts).toEqual(["5", "2"]);
    });

    test("country without data carries data-count='0'", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { countryCode: "DE", label: "Germany", count: 5 },
        ]);
        const fr = Array.from(document.querySelectorAll("#m svg path.country"))
            .find((p) => p.getAttribute("data-iso") === "FR");
        expect(fr.getAttribute("data-count")).toBe("0");
    });

    test("each feature carries data-iso with uppercase iso_a2", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { countryCode: "de", label: "Germany", count: 5 },
        ]);
        const isos = Array.from(document.querySelectorAll("#m svg path.country"))
            .map((p) => p.getAttribute("data-iso"));
        expect(isos.sort()).toEqual(["DE", "FR"]);
    });

    test("each feature has <title> with row label when present, feature name as fallback", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { countryCode: "DE", label: "Deutschland", count: 5 },
        ]);
        const titles = Array.from(document.querySelectorAll("#m svg path.country title"))
            .map((t) => t.textContent);
        expect(titles).toContain("Deutschland: 5");
        expect(titles).toContain("France: 0");
    });

    test("svg has viewBox sized to target", () => {
        makeTarget("m", { width: 800, height: 400 });
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { countryCode: "DE", label: "Germany", count: 1 },
        ]);
        const svg = document.querySelector("#m svg");
        expect(svg.getAttribute("viewBox")).toBe("0 0 800 400");
    });

    test("redraw replaces prior svg, does not stack", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO });
        w.draw([{ countryCode: "DE", label: "Germany", count: 5 }]);
        w.draw([{ countryCode: "FR", label: "France", count: 9 }]);
        expect(document.querySelectorAll("#m svg")).toHaveLength(1);
    });

    test("redraw from data → empty replaces svg with empty-state", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO });
        w.draw([{ countryCode: "DE", label: "Germany", count: 5 }]);
        w.draw([]);
        expect(document.querySelector("#m svg")).toBeNull();
        expect(document.querySelector("#m > .chart-empty-state")).not.toBeNull();
    });

    test("redraw from empty → data replaces placeholder with svg", () => {
        makeTarget();
        const w = new WorldMap("#m", { geojson: FAKE_GEO });
        w.draw([]);
        w.draw([{ countryCode: "DE", label: "Germany", count: 5 }]);
        expect(document.querySelectorAll("#m > .chart-empty-state")).toHaveLength(0);
        expect(document.querySelectorAll("#m svg")).toHaveLength(1);
    });
});

describe("WorldMap — data sanitization", () => {
    test("rows with non-string countryCode are skipped", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { countryCode: 42, label: "X", count: 1 },
            { countryCode: "DE", label: "Germany", count: 5 },
        ]);
        const de = Array.from(document.querySelectorAll("#m svg path.country"))
            .find((p) => p.getAttribute("data-iso") === "DE");
        expect(de.getAttribute("data-count")).toBe("5");
    });

    test("rows with non-finite count are coerced to 0", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { countryCode: "DE", label: "Germany", count: Number.NaN },
        ]);
        const de = Array.from(document.querySelectorAll("#m svg path.country"))
            .find((p) => p.getAttribute("data-iso") === "DE");
        expect(de.getAttribute("data-count")).toBe("0");
    });

    test("null entries in data array are skipped (no crash)", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            null,
            { countryCode: "DE", label: "Germany", count: 5 },
        ]);
        expect(document.querySelectorAll("#m svg path.country")).toHaveLength(2);
    });

    test("countryCode with surrounding whitespace still matches feature", () => {
        makeTarget();
        new WorldMap("#m", { geojson: FAKE_GEO }).draw([
            { countryCode: "  DE  ", label: "Germany", count: 42 },
        ]);
        const de = Array.from(document.querySelectorAll("#m svg path.country"))
            .find((p) => p.getAttribute("data-iso") === "DE");
        expect(de.getAttribute("data-count")).toBe("42");
    });
});

describe("WorldMap — defensive against malformed geojson", () => {
    test("null features in geojson.features are filtered, draw does not crash", () => {
        makeTarget();
        const geo = {
            type: "FeatureCollection",
            features: [
                null,
                FAKE_GEO.features[0],
                undefined,
                FAKE_GEO.features[1],
            ],
        };
        new WorldMap("#m", { geojson: geo }).draw([
            { countryCode: "DE", label: "Germany", count: 5 },
        ]);
        expect(document.querySelectorAll("#m svg path.country")).toHaveLength(2);
    });

    test("feature with non-string iso_a2 (numeric -99) does not crash", () => {
        makeTarget();
        const geo = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: { iso_a2: -99, name: "Disputed" },
                    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
                },
            ],
        };
        new WorldMap("#m", { geojson: geo }).draw([
            { countryCode: "DE", label: "Germany", count: 5 },
        ]);
        const path = document.querySelector("#m svg path.country");
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
                    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
                },
            ],
        };
        new WorldMap("#m", { geojson: geo }).draw([
            { countryCode: "DE", label: "Germany", count: 5 },
        ]);
        expect(document.querySelector("#m svg path.country").getAttribute("data-iso")).toBe("");
    });
});

describe("WorldMap — projection validation", () => {
    test("throws on projection without fitSize", () => {
        makeTarget();
        expect(() =>
            new WorldMap("#m", { geojson: FAKE_GEO, projection: {} })
        ).toThrow(/fitSize/);
    });

    test("throws on projection as plain function (no fitSize)", () => {
        makeTarget();
        expect(() =>
            new WorldMap("#m", { geojson: FAKE_GEO, projection: () => {} })
        ).toThrow(/fitSize/);
    });

    test("accepts a valid d3-geo-style projection", () => {
        makeTarget();
        const fakeProjection = { fitSize: () => fakeProjection };
        expect(() =>
            new WorldMap("#m", { geojson: FAKE_GEO, projection: fakeProjection })
        ).not.toThrow();
    });
});
