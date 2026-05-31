import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { easeCubicOut } from "d3-ease";

import BaseWidget from "src/chart/widgets/base-widget.js";

afterEach(() => {
    document.body.innerHTML = "";
});

class TestWidget extends BaseWidget {}

describe("BaseWidget — target resolution", () => {
    test("resolves target from id string with leading #", () => {
        document.body.innerHTML = '<div id="t"></div>';
        expect(new BaseWidget("#t", {}).target).toBe(document.getElementById("t"));
    });

    test("resolves target from id string without #", () => {
        document.body.innerHTML = '<div id="t"></div>';
        expect(new BaseWidget("t", {}).target).toBe(document.getElementById("t"));
    });

    test("accepts an HTMLElement directly", () => {
        const el = document.createElement("div");
        document.body.appendChild(el);
        expect(new BaseWidget(el, {}).target).toBe(el);
    });

    test.each([
        ["null", null],
        ["undefined", undefined],
        ["empty string", ""],
        ["number", 42],
        ["SVG root", document.createElementNS("http://www.w3.org/2000/svg", "svg")],
    ])("rejects non-HTMLElement target (%s)", (_label, badTarget) => {
        expect(() => new BaseWidget(badTarget, {})).toThrow(
            /target must be an HTMLElement or a non-empty id string/,
        );
    });

    test("throws when id resolves to nothing", () => {
        expect(() => new BaseWidget("#missing", {})).toThrow(/target not found/i);
    });

    test("error message embeds the subclass name", () => {
        expect(() => new TestWidget("#missing", {})).toThrow(/^TestWidget:/);
    });
});

describe("BaseWidget — options handling", () => {
    test("defaults to empty options when none given", () => {
        document.body.innerHTML = '<div id="t"></div>';
        expect(new BaseWidget("#t").options).toEqual({});
    });

    test("tolerates explicit null options without crashing on dimensions()", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new BaseWidget("#t", null);
        expect(() => w.dimensions({ width: 100, height: 100 })).not.toThrow();
    });

    test("does not share the caller's options reference", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const opts = { width: 480 };
        const w = new BaseWidget("#t", opts);
        opts.width = 999;
        expect(w.options.width).toBe(480);
    });
});

describe("BaseWidget — dimensions precedence", () => {
    const makeTargetWith = (clientWidth, clientHeight) => {
        const el = document.createElement("div");
        Object.defineProperty(el, "clientWidth", { value: clientWidth });
        Object.defineProperty(el, "clientHeight", { value: clientHeight });
        document.body.appendChild(el);
        return el;
    };

    test("option width wins over container clientWidth", () => {
        const el = makeTargetWith(320, 0);
        expect(
            new BaseWidget(el, { width: 480 }).dimensions({ width: 250, height: 250 }).width,
        ).toBe(480);
    });

    test("option height wins over container clientHeight", () => {
        const el = makeTargetWith(0, 200);
        expect(
            new BaseWidget(el, { height: 360 }).dimensions({ width: 250, height: 250 }).height,
        ).toBe(360);
    });

    test("container size used when options absent", () => {
        const el = makeTargetWith(320, 240);
        expect(new BaseWidget(el, {}).dimensions({ width: 100, height: 100 })).toEqual({
            width: 320,
            height: 240,
        });
    });

    test("defaults used when neither options nor container provide positive values", () => {
        const el = makeTargetWith(0, 0);
        expect(new BaseWidget(el, {}).dimensions({ width: 123, height: 456 })).toEqual({
            width: 123,
            height: 456,
        });
    });

    const NON_POSITIVE = [
        ["zero", 0],
        ["negative", -100],
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["string '300'", "300"],
        ["null", null],
        ["undefined", undefined],
    ];

    test.each(
        NON_POSITIVE,
    )("non-positive-finite option.width (%s) falls through to container", (_label, badValue) => {
        const el = makeTargetWith(250, 0);
        expect(
            new BaseWidget(el, { width: badValue }).dimensions({ width: 100, height: 100 }).width,
        ).toBe(250);
    });

    test.each(
        NON_POSITIVE,
    )("non-positive-finite option.height (%s) falls through to container", (_label, badValue) => {
        const el = makeTargetWith(0, 250);
        expect(
            new BaseWidget(el, { height: badValue }).dimensions({ width: 100, height: 100 }).height,
        ).toBe(250);
    });

    test("returns numbers for both axes — never booleans or strings", () => {
        const el = makeTargetWith(320, 240);
        const out = new BaseWidget(el, { width: -1, height: -1 }).dimensions({
            width: 200,
            height: 200,
        });
        expect(typeof out.width).toBe("number");
        expect(typeof out.height).toBe("number");
    });
});

describe("BaseWidget — renderEmptyState", () => {
    test("appends a .chart-empty-state element with the message", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const node = new BaseWidget("#t", {}).renderEmptyState("Nothing here");
        const target = document.getElementById("t");
        expect(node.classList.contains("chart-empty-state")).toBe(true);
        expect(node.textContent).toBe("Nothing here");
        expect(target.lastElementChild).toBe(node);
    });

    test("replaces prior empty-state instead of stacking", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new BaseWidget("#t", {});
        w.renderEmptyState("First");
        w.renderEmptyState("Second");
        const matches = document.querySelectorAll("#t > .chart-empty-state");
        expect(matches).toHaveLength(1);
        expect(matches[0].textContent).toBe("Second");
    });

    test("does not touch nested .chart-empty-state inside deeper children", () => {
        document.body.innerHTML = `
            <div id="t">
                <div class="chart"><div class="chart-empty-state">deep</div></div>
            </div>
        `;
        new BaseWidget("#t", {}).renderEmptyState("Top");
        expect(document.querySelector("#t .chart .chart-empty-state").textContent).toBe("deep");
        expect(document.querySelector("#t > .chart-empty-state").textContent).toBe("Top");
    });

    test.each([
        ["null", null, ""],
        ["undefined", undefined, ""],
        ["number", 42, "42"],
        ["boolean", true, "true"],
        ["object", { toString: () => "hi" }, "hi"],
    ])("coerces non-string message (%s) safely", (_label, message, expected) => {
        document.body.innerHTML = '<div id="t"></div>';
        expect(new BaseWidget("#t", {}).renderEmptyState(message).textContent).toBe(expected);
    });

    test("falls back to empty string when toString throws", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const poison = {
            toString: () => {
                throw new Error("boom");
            },
        };
        expect(new BaseWidget("#t", {}).renderEmptyState(poison).textContent).toBe("");
    });

    test("renders < and > as literal text (no HTML injection)", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const node = new BaseWidget("#t", {}).renderEmptyState("<b>bold</b>");
        expect(node.textContent).toBe("<b>bold</b>");
        expect(node.querySelector("b")).toBeNull();
    });
});

// The entry helpers are pure plumbing over the d3 selection/transition API, so
// the tests drive them with chainable stubs rather than live d3 selections:
// under jsdom a real transition never ticks, which would otherwise swallow the
// animated branch these assertions exist to pin (delay dispatch, ease
// forwarding, branch selection).
const makeWidget = () => {
    document.body.innerHTML = '<div id="t"></div>';
    return new BaseWidget("#t", {});
};

const makeTransitionStub = () => {
    const transition = {
        duration: jest.fn(() => transition),
        ease: jest.fn(() => transition),
        delay: jest.fn(() => transition),
    };
    return transition;
};

const makeSelectionStub = (transition) => ({
    transition: jest.fn(() => transition),
});

describe("BaseWidget — _enter entry helper", () => {
    test("returns the selection unchanged on the reduced-motion path", () => {
        const selection = makeSelectionStub(makeTransitionStub());
        expect(makeWidget()._enter(selection, false, "enter", 600)).toBe(selection);
        expect(selection.transition).not.toHaveBeenCalled();
    });

    test("opens a named transition with the duration and default cubic-out ease", () => {
        const transition = makeTransitionStub();
        const selection = makeSelectionStub(transition);
        const result = makeWidget()._enter(selection, true, "enter-x", 600);
        expect(selection.transition).toHaveBeenCalledWith("enter-x");
        expect(transition.duration).toHaveBeenCalledWith(600);
        expect(transition.ease).toHaveBeenCalledWith(easeCubicOut);
        expect(result).toBe(transition);
    });

    test("forwards a caller-supplied ease instead of the default", () => {
        const transition = makeTransitionStub();
        const ease = (t) => t;
        makeWidget()._enter(makeSelectionStub(transition), true, "enter", 600, undefined, ease);
        expect(transition.ease).toHaveBeenCalledWith(ease);
    });

    test("omits .delay() entirely when no delay is supplied", () => {
        const transition = makeTransitionStub();
        makeWidget()._enter(makeSelectionStub(transition), true, "enter", 600);
        expect(transition.delay).not.toHaveBeenCalled();
    });

    test("applies a fixed numeric delay", () => {
        const transition = makeTransitionStub();
        makeWidget()._enter(makeSelectionStub(transition), true, "enter", 600, 120);
        expect(transition.delay).toHaveBeenCalledWith(120);
    });

    test("treats delay 0 as a real fixed delay, not as unset", () => {
        const transition = makeTransitionStub();
        makeWidget()._enter(makeSelectionStub(transition), true, "enter", 600, 0);
        expect(transition.delay).toHaveBeenCalledWith(0);
    });

    test("passes a per-node delay function straight through to d3", () => {
        const transition = makeTransitionStub();
        const delayFn = (_datum, index) => index * 40;
        makeWidget()._enter(makeSelectionStub(transition), true, "enter", 600, delayFn);
        expect(transition.delay).toHaveBeenCalledWith(delayFn);
    });
});

describe("BaseWidget — _enterTween entry helper", () => {
    test("applies the final state at once and never tweens on reduced motion", () => {
        const selection = makeSelectionStub(makeTransitionStub());
        const applyFinal = jest.fn();
        const applyTween = jest.fn();
        makeWidget()._enterTween(selection, false, "morph", 600, applyFinal, applyTween);
        expect(applyFinal).toHaveBeenCalledWith(selection);
        expect(applyTween).not.toHaveBeenCalled();
        expect(selection.transition).not.toHaveBeenCalled();
    });

    test("drives the tween on a named transition and never applies the final state when animating", () => {
        const transition = makeTransitionStub();
        const selection = makeSelectionStub(transition);
        const applyFinal = jest.fn();
        const applyTween = jest.fn();
        makeWidget()._enterTween(selection, true, "morph", 600, applyFinal, applyTween);
        expect(selection.transition).toHaveBeenCalledWith("morph");
        expect(transition.duration).toHaveBeenCalledWith(600);
        expect(transition.ease).toHaveBeenCalledWith(easeCubicOut);
        expect(applyTween).toHaveBeenCalledWith(transition);
        expect(applyFinal).not.toHaveBeenCalled();
    });

    test("forwards a caller-supplied ease to the tween transition", () => {
        const transition = makeTransitionStub();
        const ease = (t) => t;
        makeWidget()._enterTween(
            makeSelectionStub(transition),
            true,
            "morph",
            600,
            jest.fn(),
            jest.fn(),
            ease,
        );
        expect(transition.ease).toHaveBeenCalledWith(ease);
    });
});
