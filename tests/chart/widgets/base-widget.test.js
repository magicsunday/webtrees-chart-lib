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

    test("normalises explicit null options to an empty object", () => {
        document.body.innerHTML = '<div id="t"></div>';
        expect(new BaseWidget("#t", null).options).toEqual({});
    });

    test("does not share the caller's options reference", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const opts = { width: 480 };
        const w = new BaseWidget("#t", opts);
        opts.width = 999;
        expect(w.options.width).toBe(480);
    });
});

describe("BaseWidget — shared margin accessor", () => {
    // A layout subclass passes its own default margin through super, exactly as
    // the box widgets do, so the merge resolves over real margins.
    class LayoutWidget extends BaseWidget {
        constructor(target, options) {
            super(target, options, { margin: { top: 12, right: 24, bottom: 32, left: 40 } });
        }
    }

    test("every widget supports margin: a bare widget exposes a zero margin", () => {
        document.body.innerHTML = '<div id="t"></div>';
        expect(new BaseWidget("#t", {}).margin).toEqual({
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
        });
    });

    test("accepts a margin option up front, merging a partial over the baseline", () => {
        document.body.innerHTML = '<div id="t"></div>';
        expect(new BaseWidget("#t", { margin: { left: 16 } }).margin).toEqual({
            top: 0,
            right: 0,
            bottom: 0,
            left: 16,
        });
    });

    test("the setter merges a partial object over the widget's own defaults", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new LayoutWidget("#t", {});
        expect(w.margin).toEqual({ top: 12, right: 24, bottom: 32, left: 40 });
        w.margin = { right: 99 };
        expect(w.margin).toEqual({ top: 12, right: 99, bottom: 32, left: 40 });
    });

    test.each([
        ["number", 5],
        ["string", "wide"],
        ["null", null],
        ["undefined", undefined],
        // An array is `typeof "object"` and non-null, so it passes the first two
        // guard clauses; the `!Array.isArray` clause is what keeps its numeric
        // indices from polluting the merged margin.
        ["array", [1, 2, 3]],
    ])("a non-object margin (%s) leaves only the defaults", (_label, bad) => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new LayoutWidget("#t", {});
        w.margin = /** @type {any} */ (bad);
        expect(w.margin).toEqual({ top: 12, right: 24, bottom: 32, left: 40 });
    });
});

describe("BaseWidget — shared emptyMessage / ariaLabel accessors", () => {
    // A labelled subclass passes both defaults through super, exactly as the
    // chart widgets do, so the fallback resolves over real defaults rather than
    // the BaseWidget baseline.
    class LabelledWidget extends BaseWidget {
        constructor(target, options) {
            super(target, options, { emptyMessage: "Nothing here", ariaLabel: "Demo chart" });
        }
    }

    test("a bare widget exposes the neutral defaults", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new BaseWidget("#t", {});
        expect(w.emptyMessage).toBe("No data available");
        expect(w.ariaLabel).toBe("");
    });

    test("a subclass default overrides the neutral baseline", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new LabelledWidget("#t", {});
        expect(w.emptyMessage).toBe("Nothing here");
        expect(w.ariaLabel).toBe("Demo chart");
    });

    test("a caller option wins over the subclass default", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new LabelledWidget("#t", { emptyMessage: "Custom", ariaLabel: "Custom label" });
        expect(w.emptyMessage).toBe("Custom");
        expect(w.ariaLabel).toBe("Custom label");
    });

    test("emptyMessage keeps an explicit empty string; ariaLabel falls back on it", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new LabelledWidget("#t", { emptyMessage: "", ariaLabel: "" });
        // An explicit "" is a valid (deliberately silent) placeholder.
        expect(w.emptyMessage).toBe("");
        // An empty aria-label carries no meaning, so it resolves to the default.
        expect(w.ariaLabel).toBe("Demo chart");
    });

    test.each([
        ["number", 5],
        ["null", null],
        ["array", [1, 2, 3]],
        ["undefined", undefined],
    ])("a non-string emptyMessage (%s) falls back to the default", (_label, bad) => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new LabelledWidget("#t", {});
        w.emptyMessage = /** @type {any} */ (bad);
        expect(w.emptyMessage).toBe("Nothing here");
    });

    test.each([
        ["number", 5],
        ["null", null],
        ["empty string", ""],
        ["undefined", undefined],
    ])("a non-meaningful ariaLabel (%s) falls back to the default", (_label, bad) => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new LabelledWidget("#t", {});
        w.ariaLabel = /** @type {any} */ (bad);
        expect(w.ariaLabel).toBe("Demo chart");
    });
});

describe("BaseWidget — shared width / height accessors", () => {
    test.each([
        ["zero", 0],
        ["negative", -10],
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["string '300'", "300"],
        ["null", null],
        ["object", {}],
    ])("width setter clears the override for non-positive / non-finite input (%s)", (_label, bad) => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new BaseWidget("#t", {});
        w.width = /** @type {any} */ (bad);
        expect(w.width).toBeUndefined();
    });

    test("width setter keeps an explicit finite-positive number", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new BaseWidget("#t", {});
        w.width = 480;
        expect(w.width).toBe(480);
    });

    test.each([
        ["zero", 0],
        ["negative", -5],
        ["NaN", Number.NaN],
        ["Infinity", Number.POSITIVE_INFINITY],
        ["string '250'", "250"],
        ["null", null],
        ["object", {}],
    ])("height setter clears the override for non-positive / non-finite input (%s)", (_label, bad) => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new BaseWidget("#t", {});
        w.height = /** @type {any} */ (bad);
        expect(w.height).toBeUndefined();
    });

    test("height setter keeps an explicit finite-positive number", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new BaseWidget("#t", {});
        w.height = 360;
        expect(w.height).toBe(360);
    });
});

describe("BaseWidget — responsive size resolution", () => {
    /**
     * jsdom performs no layout, so `clientWidth` / `clientHeight` are always 0.
     * Stubbing them is what makes the "host measures the element" step of the
     * precedence observable at all.
     *
     * @param {number} clientWidth  Measured host width to report.
     * @param {number} clientHeight Measured host height to report.
     * @param {object} [options]    Constructor options, carrying the explicit
     *   `width` / `height` overrides — the first arm of the precedence.
     *
     * @returns {BaseWidget}
     */
    function widgetWithHostSize(clientWidth, clientHeight, options = {}) {
        document.body.innerHTML = '<div id="t"></div>';
        const host = /** @type {HTMLElement} */ (document.querySelector("#t"));
        Object.defineProperty(host, "clientWidth", { configurable: true, value: clientWidth });
        Object.defineProperty(host, "clientHeight", { configurable: true, value: clientHeight });

        return new BaseWidget(host, options);
    }

    test("an explicit width option wins over the measured host and the fallback", () => {
        expect(widgetWithHostSize(800, 400, { width: 320 })._resolveWidth(600)).toBe(320);
    });

    test("without an explicit width the measured host wins over the fallback", () => {
        expect(widgetWithHostSize(800, 400)._resolveWidth(600)).toBe(800);
    });

    test("a host that measures zero (detached / display:none) falls back", () => {
        // The reason the fallback exists at all: an unattached or hidden host
        // reports 0, which must not become the chart's width.
        expect(widgetWithHostSize(0, 0)._resolveWidth(600)).toBe(600);
    });

    test("the minimum floors a narrow measured host", () => {
        expect(widgetWithHostSize(100, 400)._resolveWidth(600, 240)).toBe(240);
    });

    test("without a minimum a narrow measured host is not floored", () => {
        // The default `minimum = 0` arm, which the eight single-argument call
        // sites rely on: they must honour a host narrower than every other
        // widget's floor rather than silently inheriting one.
        expect(widgetWithHostSize(100, 400)._resolveWidth(600)).toBe(100);
    });

    test("the minimum floors an explicit width below it", () => {
        // The surprising arm: the floor runs AFTER the precedence, so it raises
        // even a width the caller asked for. Guaranteeing a legible chart wins
        // over honouring the option unconditionally.
        expect(widgetWithHostSize(800, 400, { width: 100 })._resolveWidth(600, 240)).toBe(240);
    });

    test("the minimum floors a fallback below it", () => {
        expect(widgetWithHostSize(0, 0)._resolveWidth(100, 240)).toBe(240);
    });

    test("the minimum never raises a width that already clears it", () => {
        expect(widgetWithHostSize(800, 400)._resolveWidth(600, 240)).toBe(800);
    });

    test("an explicit height option wins over the measured host and the fallback", () => {
        expect(widgetWithHostSize(800, 400, { height: 150 })._resolveHeight(300)).toBe(150);
    });

    test("without an explicit height the measured host wins over the fallback", () => {
        expect(widgetWithHostSize(800, 400)._resolveHeight(300)).toBe(400);
    });

    test("a host that measures zero height falls back", () => {
        expect(widgetWithHostSize(800, 0)._resolveHeight(300)).toBe(300);
    });
});

describe("BaseWidget — consuming-only accent / i18n accessors stay inert", () => {
    // Unlike width/height/margin/emptyMessage/ariaLabel, the base constructor
    // does NOT activate accent/i18n: a widget that never paints an accent or
    // surfaces copy must leave them unset. TestWidget extends BaseWidget without
    // activating either, standing in for any non-consuming widget.
    test("a non-consuming widget reports accent as undefined", () => {
        document.body.innerHTML = '<div id="t"></div>';
        expect(new TestWidget("#t", { accent: "rebeccapurple" }).accent).toBeUndefined();
    });

    test("a non-consuming widget reports i18n as undefined", () => {
        document.body.innerHTML = '<div id="t"></div>';
        expect(new TestWidget("#t", { i18n: { foo: "bar" } }).i18n).toBeUndefined();
    });

    test("activating accent applies the shared tolerant setter (default currentColor)", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new TestWidget("#t", {});
        w.accent = "rebeccapurple";
        expect(w.accent).toBe("rebeccapurple");
        // Empty / non-string resets to the baseline the base constructor seeds.
        w.accent = "";
        expect(w.accent).toBe("currentColor");
        w.accent = /** @type {any} */ (42);
        expect(w.accent).toBe("currentColor");
    });

    test("a lowered _defaultAccent baseline resets to undefined, mirroring world-map", () => {
        document.body.innerHTML = '<div id="t"></div>';
        // accent is opt-in, so its default is subclass-raised (not passed through
        // super like the base-activated accessors): world-map lowers the baseline
        // to `undefined` before activating, so a non-string reset falls back to
        // `undefined` (its colour-scale fallback) rather than currentColor.
        const w = new TestWidget("#t", {});
        w._defaultAccent = undefined;
        w.accent = /** @type {any} */ (42);
        expect(w.accent).toBeUndefined();
    });

    test("activating i18n applies the shared tolerant setter (non-object resets to {})", () => {
        document.body.innerHTML = '<div id="t"></div>';
        const w = new TestWidget("#t", {});
        w.i18n = { greeting: "hi" };
        expect(w.i18n).toEqual({ greeting: "hi" });
        w.i18n = /** @type {any} */ ("nope");
        expect(w.i18n).toEqual({});
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
