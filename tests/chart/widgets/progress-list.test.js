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
        expect(document.querySelector("#l ul.msc-progress-list")).toBeNull();
    });

    test("draw(null) renders empty-state instead of crashing", () => {
        makeTarget();
        new ProgressList("#l", {}).draw(null);
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
    });

    test("custom emptyMessage surfaces in placeholder text", () => {
        makeTarget();
        new ProgressList("#l", { emptyMessage: "No value" }).draw([]);
        expect(document.querySelector("#l > .chart-empty-state").textContent).toBe("No value");
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
    test("renders ul.msc-progress-list with one li per row", () => {
        makeTarget();
        new ProgressList("#l", {}).draw(SAMPLE);
        expect(document.querySelectorAll("#l ul.msc-progress-list > li")).toHaveLength(3);
    });

    test("first row has 100% bar relative to dataset max", () => {
        makeTarget();
        new ProgressList("#l", {}).draw(SAMPLE);
        const bar = document.querySelector(
            "#l ul.msc-progress-list > li:first-child .msc-progress-list-bar-fill",
        );
        expect(bar.style.width).toBe("100%");
    });

    test("subsequent rows have proportional widths", () => {
        makeTarget();
        new ProgressList("#l", {}).draw(SAMPLE);
        const widths = Array.from(
            document.querySelectorAll("#l ul.msc-progress-list .msc-progress-list-bar-fill"),
        ).map((el) => el.style.width);
        expect(widths).toEqual(["100%", "75%", "50%"]);
    });

    test("label and value cells receive the data values", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([{ label: "Sonntag", value: 12 }]);
        expect(document.querySelector("#l .msc-progress-list-label").textContent).toBe("Sonntag");
        expect(document.querySelector("#l .msc-progress-list-value").textContent).toBe("12");
    });
});

describe("ProgressList — options", () => {
    test("maxItems trims the list", () => {
        makeTarget();
        new ProgressList("#l", { maxItems: 2 }).draw(SAMPLE);
        expect(document.querySelectorAll("#l ul.msc-progress-list > li")).toHaveLength(2);
    });

    test("formatter customises value display", () => {
        makeTarget();
        new ProgressList("#l", { formatter: (v) => `${v} ×` }).draw(SAMPLE);
        const first = document.querySelector(
            "#l ul.msc-progress-list > li:first-child .msc-progress-list-value",
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
            document.querySelectorAll("#l ul.msc-progress-list .msc-progress-list-bar-fill"),
        ).map((el) => el.style.width);
        expect(widths).toEqual(["25%", "80%"]);
    });
});

describe("ProgressList — native get/set accessors", () => {
    test("getters read back the constructor options", () => {
        makeTarget();
        const formatter = (v) => `${v}!`;
        const widget = new ProgressList("#l", {
            maxItems: 5,
            formatter,
            emptyMessage: "No value",
        });
        expect(widget.maxItems).toBe(5);
        expect(widget.formatter).toBe(formatter);
        expect(widget.emptyMessage).toBe("No value");
    });

    test("getters expose the validated defaults when options are omitted", () => {
        makeTarget();
        const widget = new ProgressList("#l", {});
        // An omitted maxItems means "no cap".
        expect(widget.maxItems).toBe(Number.POSITIVE_INFINITY);
        // The default formatter is the localised number formatter.
        expect(widget.formatter(1234)).toBe((1234).toLocaleString());
        // An omitted emptyMessage exposes the default placeholder text.
        expect(widget.emptyMessage).toBe("No data available");
    });

    test("the maxItems setter validates and normalises, getter reads it back", () => {
        makeTarget();
        const widget = new ProgressList("#l", {});
        widget.maxItems = 3;
        expect(widget.maxItems).toBe(3);
        // A fractional value floors to an integer.
        widget.maxItems = 4.9;
        expect(widget.maxItems).toBe(4);
        // A non-positive value resets to the uncapped default.
        widget.maxItems = 0;
        expect(widget.maxItems).toBe(Number.POSITIVE_INFINITY);
        widget.maxItems = -2;
        expect(widget.maxItems).toBe(Number.POSITIVE_INFINITY);
        // The runtime guard also defaults a non-number value — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.maxItems = /** @type {any} */ ("five");
        expect(widget.maxItems).toBe(Number.POSITIVE_INFINITY);
    });

    test("the formatter setter keeps a function else the default, getter reads it back", () => {
        makeTarget();
        const widget = new ProgressList("#l", {});
        const formatter = (v) => `#${v}`;
        widget.formatter = formatter;
        expect(widget.formatter).toBe(formatter);
        // The runtime guard resets a non-function value to the default — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.formatter = /** @type {any} */ ("nope");
        expect(widget.formatter(1234)).toBe((1234).toLocaleString());
    });

    test("the emptyMessage setter validates and normalises, getter reads it back", () => {
        makeTarget();
        // An omitted emptyMessage exposes the default placeholder text.
        const fallback = new ProgressList("#l", {});
        expect(fallback.emptyMessage).toBe("No data available");
        // A custom string reads back unchanged.
        const widget = new ProgressList("#l", { emptyMessage: "Nothing to show" });
        expect(widget.emptyMessage).toBe("Nothing to show");
        // An empty string is a valid emptyMessage (only non-string resets).
        widget.emptyMessage = "";
        expect(widget.emptyMessage).toBe("");
        // The runtime guard resets a non-string value to the default — the cast
        // simulates the JSON dispatcher assigning an untyped payload value.
        widget.emptyMessage = /** @type {any} */ (42);
        expect(widget.emptyMessage).toBe("No data available");
    });

    test("the dispatcher pattern (Object.entries → widget[k] = v) configures the widget", () => {
        makeTarget();
        const widget = new ProgressList("#l", {});
        const formatter = (v) => `${v} ×`;
        for (const [key, value] of Object.entries({
            maxItems: 2,
            formatter,
            emptyMessage: "Empty",
        })) {
            widget[key] = value;
        }
        expect(widget.maxItems).toBe(2);
        expect(widget.formatter).toBe(formatter);
        expect(widget.emptyMessage).toBe("Empty");
    });
});

describe("ProgressList — XSS + sanitization", () => {
    test("HTML in label is rendered as text, not parsed", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([{ label: "<b>boom</b>", value: 5 }]);
        const labelCell = document.querySelector("#l .msc-progress-list-label");
        expect(labelCell.textContent).toBe("<b>boom</b>");
        expect(labelCell.querySelector("b")).toBeNull();
    });

    test("HTML in formatter output is rendered as text, not parsed", () => {
        makeTarget();
        new ProgressList("#l", { formatter: () => "<script>evil</script>" }).draw([
            { label: "A", value: 5 },
        ]);
        const valueCell = document.querySelector("#l .msc-progress-list-value");
        expect(valueCell.textContent).toBe("<script>evil</script>");
        expect(valueCell.querySelector("script")).toBeNull();
    });

    test("rows with null/undefined entries are skipped", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([null, undefined, { label: "A", value: 5 }]);
        expect(document.querySelectorAll("#l ul.msc-progress-list > li")).toHaveLength(1);
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
        expect(document.querySelectorAll("#l ul.msc-progress-list > li")).toHaveLength(1);
    });

    test("missing label coerces to empty string", () => {
        makeTarget();
        new ProgressList("#l", {}).draw([{ value: 5 }]);
        expect(document.querySelector("#l .msc-progress-list-label").textContent).toBe("");
    });
});

describe("ProgressList — redraw idempotence", () => {
    test("redraw replaces prior ul, does not stack", () => {
        makeTarget();
        const w = new ProgressList("#l", {});
        w.draw(SAMPLE);
        w.draw([{ label: "X", value: 5 }]);
        expect(document.querySelectorAll("#l ul.msc-progress-list")).toHaveLength(1);
        expect(document.querySelectorAll("#l ul.msc-progress-list > li")).toHaveLength(1);
    });

    test("redraw from data → empty replaces ul with empty-state", () => {
        makeTarget();
        const w = new ProgressList("#l", {});
        w.draw(SAMPLE);
        w.draw([]);
        expect(document.querySelector("#l ul.msc-progress-list")).toBeNull();
        expect(document.querySelector("#l > .chart-empty-state")).not.toBeNull();
    });

    test("redraw from empty → data replaces placeholder with ul", () => {
        makeTarget();
        const w = new ProgressList("#l", {});
        w.draw([]);
        w.draw(SAMPLE);
        expect(document.querySelectorAll("#l > .chart-empty-state")).toHaveLength(0);
        expect(document.querySelectorAll("#l ul.msc-progress-list")).toHaveLength(1);
    });
});
