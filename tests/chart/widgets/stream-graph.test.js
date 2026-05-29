import { afterEach, describe, expect, test } from "@jest/globals";

import StreamGraph from "src/chart/widgets/stream-graph.js";

afterEach(() => {
    document.body.innerHTML = "";
    // Drop any reduced-motion override so it can't leak into other tests.
    window.matchMedia = undefined;
});

const SAMPLE = {
    decades: [1900, 1910, 1920],
    names: ["Anna", "Bertha"],
    series: {
        Anna: { 1900: 5, 1910: 8, 1920: 6 },
        Bertha: { 1900: 3, 1910: 4, 1920: 9 },
    },
};

const makeTarget = (id = "g") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("StreamGraph — rendering", () => {
    test("renders one path.band per name", () => {
        makeTarget();
        new StreamGraph("#g", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#g svg path.band")).toHaveLength(SAMPLE.names.length);
    });
});

describe("StreamGraph — reduced-motion entrance parity", () => {
    test("renders bands at full opacity (not the held zero)", () => {
        window.matchMedia = () => ({ matches: true });
        makeTarget();
        new StreamGraph("#g", { animateOnReveal: true }).draw(SAMPLE);

        // entry(false) sets the final opacity (0.85) + silhouette path directly;
        // the held keyframe leaves bands at opacity 0 on the flat baseline.
        const bands = [...document.querySelectorAll("#g svg path.band")];
        expect(bands.length).toBeGreaterThan(0);
        expect(bands.every((b) => b.getAttribute("opacity") === "0.85")).toBe(true);
    });
});
