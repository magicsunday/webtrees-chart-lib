/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { select } from "d3-selection";

const CHAR_WIDTH = 10;
const measureTextMock = jest.fn((text) => text.length * CHAR_WIDTH);

jest.unstable_mockModule("src/chart/text/measure.js", () => ({
    measureText: measureTextMock,
}));

const { default: TextRenderer } = await import("src/linked-tree/text-renderer.js");
const { default: DateRenderer } = await import("src/linked-tree/date-renderer.js");

const buildRenderer = (RendererClass, isDocumentRtl = false) =>
    new RendererClass(
        { style: jest.fn(() => "Arial") },
        { isDocumentRtl },
        { width: 80 },
        { x: -30 },
    );

describe("TextRenderer.textX", () => {
    test("starts at the text box position when no image takes up room", () => {
        expect(buildRenderer(TextRenderer).textX({ withImage: false })).toBe(-30);
    });

    test("shifts by the image width when the element reserves room for an image", () => {
        expect(buildRenderer(TextRenderer).textX({ withImage: true })).toBe(50);
    });

    test("mirrors the position for right-to-left documents", () => {
        expect(buildRenderer(TextRenderer, true).textX({ withImage: true })).toBe(-50);
    });
});

describe("TextRenderer.measureText", () => {
    test("measures with the font family of the svg element", () => {
        measureTextMock.mockClear();

        expect(buildRenderer(TextRenderer).measureText("Jane", "12px", 700)).toBe(4 * CHAR_WIDTH);
        expect(measureTextMock).toHaveBeenCalledWith("Jane", "Arial", "12px", 700);
    });

    test("defaults to the regular font weight", () => {
        measureTextMock.mockClear();

        buildRenderer(TextRenderer).measureText("Jane", "12px");

        expect(measureTextMock).toHaveBeenCalledWith("Jane", "Arial", "12px", 400);
    });
});

describe("DateRenderer", () => {
    test("inherits the text helpers instead of redefining them", () => {
        expect(Object.getPrototypeOf(DateRenderer)).toBe(TextRenderer);
        expect(Object.hasOwn(DateRenderer.prototype, "textX")).toBe(false);
        expect(Object.hasOwn(DateRenderer.prototype, "measureText")).toBe(false);
    });

    describe("truncateDate", () => {
        const element = { style: jest.fn(() => "12px") };

        test("keeps a date that fits", () => {
            expect(buildRenderer(DateRenderer).truncateDate(element, "1 Jan 1900", 100)).toBe(
                "1 Jan 1900",
            );
        });

        test("cuts a date that is too wide and marks the cut", () => {
            expect(buildRenderer(DateRenderer).truncateDate(element, "12 March 1900", 90)).toBe(
                "12 March…",
            );
        });

        test("drops a trailing full stop left by the cut", () => {
            expect(buildRenderer(DateRenderer).truncateDate(element, "12 Mar. 1900", 70)).toBe(
                "12 Mar…",
            );
        });

        test("never cuts below a single character", () => {
            expect(buildRenderer(DateRenderer).truncateDate(element, "1900", 1)).toBe("1…");
        });
    });
});

describe("DateRenderer.appendDate", () => {
    const TEXT_Y = 20;
    const IMAGE_WIDTH = 80;
    const TEXT_WIDTH = 300;

    afterEach(() => {
        document.body.innerHTML = "";
    });

    const renderDates = ({
        vertical,
        showAlternativeName = false,
        isDocumentRtl = false,
        datum,
    }) => {
        const renderer = new DateRenderer(
            { style: jest.fn(() => "Arial"), _configuration: { showAlternativeName } },
            { isVertical: vertical, isDocumentRtl },
            { width: IMAGE_WIDTH },
            { x: -30, y: TEXT_Y, width: TEXT_WIDTH },
        );
        const parent = select(document.body)
            .append("svg")
            .append("g")
            .datum({ data: { data: datum } });

        renderer.appendDate(parent);

        return parent;
    };

    const person = (overrides = {}) => ({
        timespan: "1900 - 1980",
        birth: "1 Jan 1900",
        death: "2 Feb 1980",
        thumbnail: "",
        ...overrides,
    });

    test("draws the life span once below the name in a vertical layout", () => {
        const parent = renderDates({ vertical: true, datum: person() });
        const dates = parent.selectAll("text.date");

        expect(dates.size()).toBe(1);
        expect(dates.select("tspan").text()).toBe("1900 - 1980");
        expect(dates.select("title").text()).toBe("1900 - 1980");
        expect(dates.attr("y")).toBe(String(TEXT_Y + 45));
    });

    test("moves the vertical life span down when the alternative name row is shown", () => {
        const parent = renderDates({
            vertical: true,
            showAlternativeName: true,
            datum: person(),
        });

        expect(parent.select("text.date").attr("y")).toBe(String(TEXT_Y + 45 + 30));
    });

    test("draws a birth and a death row with their icons in a horizontal layout", () => {
        const parent = renderDates({ vertical: false, datum: person() });
        const dates = parent.selectAll("text.date");
        const icons = parent.selectAll("text[fill='currentColor'] tspan");

        expect(dates.nodes().map((node) => node.querySelector("tspan").textContent)).toEqual([
            "1 Jan 1900",
            "2 Feb 1980",
        ]);
        expect(icons.nodes().map((node) => node.textContent)).toEqual(["★", "†"]);
        expect(dates.nodes().map((node) => node.getAttribute("y"))).toEqual([
            String(TEXT_Y + 30),
            String(TEXT_Y + 30 + 20),
        ]);
    });

    test("leaves out the row of a missing date", () => {
        const parent = renderDates({ vertical: false, datum: person({ death: "" }) });

        expect(parent.selectAll("text.date").size()).toBe(1);
        expect(parent.selectAll("text.date tspan").text()).toBe("1 Jan 1900");
    });

    test("starts the dates after the image when the person has a thumbnail", () => {
        const withImage = renderDates({ vertical: false, datum: person({ thumbnail: "a.jpg" }) });

        expect(withImage.select("text.date").attr("x")).toBe(String(-30 + IMAGE_WIDTH));

        document.body.innerHTML = "";

        const withoutImage = renderDates({ vertical: false, datum: person() });

        expect(withoutImage.select("text.date").attr("x")).toBe("-30");
    });
    test("cuts a vertical life span at the full text width", () => {
        const parent = renderDates({
            vertical: true,
            datum: person({ timespan: "1 September 1900 - 12 December 1980" }),
        });

        expect(parent.select("text.date tspan").text()).toBe("1 September 1900 - 12 December…");
    });

    test("leaves room for the icon column when a horizontal date has no image", () => {
        const parent = renderDates({
            vertical: false,
            datum: person({ birth: "12 September 1900 at midnight", death: "" }),
        });

        expect(parent.select("text.date tspan").text()).toBe("12 September 1900 at midnig…");
    });

    test("also takes the image width off a horizontal date when the person has a thumbnail", () => {
        const parent = renderDates({
            vertical: false,
            datum: person({
                birth: "2 September 1900 at noon",
                death: "",
                thumbnail: "a.jpg",
            }),
        });

        expect(parent.select("text.date tspan").text()).toBe("2 September 1900 at…");
    });

    test.each([
        [false, ["5", "15"]],
        [true, ["-5", "-15"]],
    ])(
        "mirrors the icon and date offsets for a right-to-left document (rtl %s)",
        (rtl, offsets) => {
            const parent = renderDates({ vertical: false, isDocumentRtl: rtl, datum: person() });
            const [iconOffset, dateOffset] = offsets;

            expect(
                parent
                    .selectAll("text[fill='currentColor'] tspan")
                    .nodes()
                    .map((n) => n.getAttribute("dx")),
            ).toEqual([iconOffset, iconOffset]);
            expect(
                parent
                    .selectAll("text.date tspan")
                    .nodes()
                    .map((n) => n.getAttribute("dx")),
            ).toEqual([dateOffset, dateOffset]);
        },
    );

    test("sets the second icon row one pixel lower than the second date row", () => {
        const parent = renderDates({ vertical: false, datum: person() });
        const iconRows = parent.selectAll("text[fill='currentColor']").nodes();
        const dateRows = parent.selectAll("text.date").nodes();

        expect(iconRows[1].getAttribute("y")).toBe(String(TEXT_Y + 30 + 21));
        expect(dateRows[1].getAttribute("y")).toBe(String(TEXT_Y + 30 + 20));
    });
});
