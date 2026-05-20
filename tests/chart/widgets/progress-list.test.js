import { afterEach, describe, expect, test } from "@jest/globals";

import ProgressList from "src/chart/widgets/progress-list.js";

afterEach(() => {
    document.body.innerHTML = "";
});

const SAMPLE = [
    { label: "Sonntag", value: 12 },
    { label: "Schmidt", value: 9 },
    { label: "Meier", value: 6 },
];

const makeTarget = (id = "l") => {
    document.body.innerHTML = `<div id="${id}"></div>`;
    return document.getElementById(id);
};

describe("ProgressList — empty states", () => {
    test("draw([]) renders empty-state", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([]);
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
        expect(document.querySelector("#l ul.progress-list")).toBeNull();
    });

    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new ProgressList("#l", {}).draw(null);
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new ProgressList("#l", { emptyMessage: "kein Wert" }).draw([]);
        expect(document.querySelector("#l > .chart-empty-state").textContent).toBe("kein Wert");
    });

    test("dataset of all-zero values renders empty-state", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([
            { label: "A", value: 0 },
            { label: "B", value: 0 },
        ]);
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
    });
});

describe("ProgressList — rendering", () => {
    test("renders ul.progress-list with one li per row", () => {
        makeTarget();
        new ProgressList("#l", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#l ul.progress-list > li")).toHaveLength(3);
    });

    test("first row has 100% bar relative to dataset max", () => {
        makeTarget();
        new ProgressList("#l", {}).draw(SAMPLE);
        const bar = document.querySelector(
            "#l ul.progress-list > li:first-child .progress-bar-fill",
        );
        expect(bar.style.width).toBe("100%");
    });

    test("subsequent rows have proportional widths", () => {
        makeTarget();
        new ProgressList("#l", {}).draw(SAMPLE);
        const widths = Array.from(
            document.querySelectorAll("#l ul.progress-list .progress-bar-fill"),
        ).map((el) => el.style.width);
        expect(widths).toEqual(["100%", "75%", "50%"]);
    });

    test("label and value cells receive the data values", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([{ label: "Sonntag", value: 12 }]);
        expect(document.querySelector("#l .progress-label").textContent).toBe("Sonntag");
        expect(document.querySelector("#l .progress-value").textContent).toBe("12");
    });
});

describe("ProgressList — options", () => {
    test("maxItems trims the list", () => {
        makeTarget();
        new ProgressList("#l", { maxItems: 2 }).draw(SAMPLE);
        expect(document.querySelectorAll("#l ul.progress-list > li")).toHaveLength(2);
    });

    test("formatter customises value display", () => {
        makeTarget();
        new ProgressList("#l", { formatter: (v) => `${v} ×` }).draw(SAMPLE);
        const first = document.querySelector(
            "#l ul.progress-list > li:first-child .progress-value",
        );
        expect(first.textContent).toBe("12 ×");
    });

    test("per-row total drives its own bar width", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([
            { label: "A", value: 25, total: 100 },
            { label: "B", value: 80, total: 100 },
        ]);
        const widths = Array.from(
            document.querySelectorAll("#l ul.progress-list .progress-bar-fill"),
        ).map((el) => el.style.width);
        expect(widths).toEqual(["25%", "80%"]);
    });
});

describe("ProgressList — XSS + sanitization", () => {
    test("HTML in label is rendered as text, not parsed", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([{ label: "<b>boom</b>", value: 5 }]);
        const labelCell = document.querySelector("#l .progress-label");
        expect(labelCell.textContent).toBe("<b>boom</b>");
        expect(labelCell.querySelector("b")).toBeNull();
    });

    test("HTML in formatter output is rendered as text, not parsed", () => {
        makeTarget();
        new ProgressList("#l", { formatter: () => "<script>evil</script>" }).draw([
            { label: "A", value: 5 },
        ]);
        const valueCell = document.querySelector("#l .progress-value");
        expect(valueCell.textContent).toBe("<script>evil</script>");
        expect(valueCell.querySelector("script")).toBeNull();
    });

    test("rows with null/undefined entries are skipped", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([null, undefined, { label: "A", value: 5 }]);
        expect(document.querySelectorAll("#l ul.progress-list > li")).toHaveLength(1);
    });

    test("non-finite values are coerced to 0 and drop their rows", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([
            { label: "A", value: 5 },
            { label: "NaN", value: Number.NaN },
            { label: "Infinity", value: Number.POSITIVE_INFINITY },
            { label: "null", value: null },
            { label: "string", value: "5" },
        ]);
        expect(document.querySelectorAll("#l ul.progress-list > li")).toHaveLength(1);
    });

    test("missing label coerces to empty string", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([{ value: 5 }]);
        expect(document.querySelector("#l .progress-label").textContent).toBe("");
    });
});

describe("ProgressList — redraw idempotence", () => {
    test("redraw replaces prior ul, does not stack", () => {
        makeTarget();
        const w = new ProgressList("#l", {});
        w.draw(SAMPLE);
        w.draw([{ label: "X", value: 5 }]);
        expect(document.querySelectorAll("#l ul.progress-list")).toHaveLength(1);
        expect(document.querySelectorAll("#l ul.progress-list > li")).toHaveLength(1);
    });

    test("redraw from data → empty replaces ul with empty-state", () => {
        makeTarget();
        const w = new ProgressList("#l", {});
        w.draw(SAMPLE);
        w.draw([]);
        expect(document.querySelector("#l ul.progress-list")).toBeNull();
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
    });

    test("redraw from empty → data replaces placeholder with ul", () => {
        makeTarget();
        const w = new ProgressList("#l", {});
        w.draw([]);
        w.draw(SAMPLE);
        expect(document.querySelectorAll("#l > .chart-empty-state")).toHaveLength(0);
        expect(document.querySelectorAll("#l ul.progress-list")).toHaveLength(1);
    });
});
