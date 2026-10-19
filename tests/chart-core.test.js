import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
    buildChartAjaxUrl,
    Storage,
    setChartAjaxUrl,
    setChartOptionsGlobal,
    syncCollapseToggle,
} from "src/chart-core";

describe("chart-core helpers", () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = "";
        // @ts-expect-error test global
        window.WebtreesFanChart = undefined;
    });

    test("buildChartAjaxUrl applies mixed query modes", () => {
        const xref = document.createElement("input");
        xref.id = "xref";
        xref.value = "I123";
        document.body.appendChild(xref);

        const ajaxUrl = buildChartAjaxUrl("https://example.test/chart?showDescendants=1", {
            query: [
                { key: "generations", value: 6 },
                { key: "showPlaces", value: false, mode: "boolean-1-0" },
                { key: "showDescendants", value: false, mode: "boolean-1-or-delete" },
            ],
        });
        const url = new URL(ajaxUrl);

        expect(url.searchParams.get("xref")).toBe("I123");
        expect(url.searchParams.get("generations")).toBe("6");
        expect(url.searchParams.get("showPlaces")).toBe("0");
        expect(url.searchParams.has("showDescendants")).toBe(false);
    });

    test("buildChartAjaxUrl deletes the query keys with a null or undefined value", () => {
        const ajaxUrl = buildChartAjaxUrl("https://example.test/chart?showPlaces=1&placeParts=2", {
            query: [
                { key: "showPlaces", value: null },
                { key: "placeParts", value: undefined },
            ],
        });
        const url = new URL(ajaxUrl);

        expect(url.searchParams.has("showPlaces")).toBe(false);
        expect(url.searchParams.has("placeParts")).toBe(false);
    });

    test("buildChartAjaxUrl sends no xref when the page has no xref input", () => {
        const url = new URL(buildChartAjaxUrl("https://example.test/chart"));

        expect(url.searchParams.has("xref")).toBe(false);
    });

    test("syncCollapseToggle restores state and persists shown/hidden events", () => {
        const collapse = document.createElement("div");
        collapse.id = "showMoreOptions";
        const toggle = document.createElement("button");
        toggle.id = "options";
        toggle.innerHTML = "<span>show</span><span class='d-none'>hide</span>";
        document.body.appendChild(collapse);
        document.body.appendChild(toggle);

        const storage = new Storage("chart-options");
        storage.write("showMoreOptions", true);

        const clickSpy = jest.spyOn(toggle, "click");

        expect(syncCollapseToggle(storage)).toBe(true);
        expect(clickSpy).toHaveBeenCalledTimes(1);

        collapse.dispatchEvent(new Event("shown.bs.collapse"));
        expect(storage.readBool("showMoreOptions")).toBe(true);

        collapse.dispatchEvent(new Event("hidden.bs.collapse"));
        expect(storage.readBool("showMoreOptions")).toBe(false);
    });

    test("syncCollapseToggle reports false when the collapse or the toggle is missing", () => {
        const storage = new Storage("chart-options");

        expect(syncCollapseToggle(storage)).toBe(false);

        const collapse = document.createElement("div");
        collapse.id = "showMoreOptions";
        document.body.appendChild(collapse);

        expect(syncCollapseToggle(storage)).toBe(false);

        collapse.remove();
        const toggle = document.createElement("button");
        toggle.id = "options";
        document.body.appendChild(toggle);

        expect(syncCollapseToggle(storage)).toBe(false);
    });

    test("setChartAjaxUrl reports false when the container is missing", () => {
        expect(setChartAjaxUrl("no-such-container", "https://example.test/chart")).toBe(false);
    });

    test("setChartAjaxUrl and setChartOptionsGlobal update DOM/global targets", () => {
        const container = document.createElement("div");
        container.id = "fan-chart-url";
        document.body.appendChild(container);

        expect(setChartAjaxUrl("fan-chart-url", "https://example.test/chart?xref=I1")).toBe(true);
        expect(container.getAttribute("data-wt-ajax-url")).toBe(
            "https://example.test/chart?xref=I1",
        );

        // @ts-expect-error test global
        window.WebtreesFanChart = {};
        expect(setChartOptionsGlobal("WebtreesFanChart", { generations: 4 })).toBe(true);
        // @ts-expect-error test global
        expect(window.WebtreesFanChart.chartOptions).toEqual({ generations: 4 });
    });
});
