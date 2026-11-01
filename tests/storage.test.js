import { afterEach, beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Storage } from "src/storage";

describe("Storage", () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = "";
    });

    test("register restores stored value and listens for updates", () => {
        localStorage.setItem("form", JSON.stringify({ field: "saved" }));

        const input = document.createElement("input");
        input.id = "field";
        input.name = "field";
        document.body.appendChild(input);

        const storage = new Storage("form");
        storage.register("field");

        expect(input.value).toBe("saved");

        input.value = "updated";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        const stored = JSON.parse(localStorage.getItem("form"));
        expect(stored.field).toBe("updated");
    });

    test("register stores checkbox state", () => {
        const checkbox = document.createElement("input");
        checkbox.id = "notify";
        checkbox.name = "notify";
        checkbox.type = "checkbox";
        document.body.appendChild(checkbox);

        const storage = new Storage("options");
        storage.register("notify");

        let stored = JSON.parse(localStorage.getItem("options"));
        expect(stored.notify).toBe(false);

        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("input", { bubbles: true }));

        stored = JSON.parse(localStorage.getItem("options"));
        expect(stored.notify).toBe(true);
    });

    test("register restores radio selection by value", () => {
        localStorage.setItem("displayMode", JSON.stringify({ displayMode: "names" }));

        const radioBoth = document.createElement("input");
        radioBoth.id = "displayMode-both";
        radioBoth.name = "displayMode";
        radioBoth.type = "radio";
        radioBoth.value = "both";

        const radioNames = document.createElement("input");
        radioNames.id = "displayMode-names";
        radioNames.name = "displayMode";
        radioNames.type = "radio";
        radioNames.value = "names";

        document.body.appendChild(radioBoth);
        document.body.appendChild(radioNames);

        const storage = new Storage("displayMode");
        storage.register("displayMode");

        expect(radioNames.checked).toBe(true);
        expect(radioBoth.checked).toBe(false);

        radioBoth.checked = true;
        radioBoth.dispatchEvent(new Event("input", { bubbles: true }));

        const stored = JSON.parse(localStorage.getItem("displayMode"));
        expect(stored.displayMode).toBe("both");
    });

    describe("tolerance", () => {
        afterEach(() => {
            jest.restoreAllMocks();
        });

        test("a stored payload that is not JSON starts an empty store", () => {
            localStorage.setItem("form", "{not json");

            const storage = new Storage("form");

            expect(storage.read("field")).toBeNull();
        });

        test("a corrupted payload is replaced by the first value written", () => {
            localStorage.setItem("form", "{not json");

            const storage = new Storage("form");
            storage.write("field", "fresh");

            expect(JSON.parse(localStorage.getItem("form"))).toEqual({ field: "fresh" });
        });

        test("a missing payload starts an empty store", () => {
            const storage = new Storage("form");

            expect(storage.read("field")).toBeNull();
        });

        test("write keeps the value in memory when the storage quota is exceeded", () => {
            const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
            jest.spyOn(Object.getPrototypeOf(localStorage), "setItem").mockImplementation(() => {
                throw new DOMException("quota", "QuotaExceededError");
            });

            const storage = new Storage("form");

            expect(() => storage.write("field", "value")).not.toThrow();
            expect(storage.read("field")).toBe("value");
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("'field'"));
        });
    });

    describe("typed accessors", () => {
        test("readString returns null fallback when missing", () => {
            const storage = new Storage("ts");
            expect(storage.readString("absent")).toBeNull();
            expect(storage.readString("absent", "fallback")).toBe("fallback");
        });

        test("readString stringifies stored numbers and booleans", () => {
            localStorage.setItem("ts", JSON.stringify({ n: 42, b: true }));
            const storage = new Storage("ts");
            expect(storage.readString("n")).toBe("42");
            expect(storage.readString("b")).toBe("true");
        });

        test("readBool returns null fallback when missing", () => {
            const storage = new Storage("ts");
            expect(storage.readBool("absent")).toBeNull();
            expect(storage.readBool("absent", false)).toBe(false);
        });

        test("readBool coerces native booleans, numbers, and legacy strings", () => {
            localStorage.setItem(
                "ts",
                JSON.stringify({
                    nativeTrue: true,
                    nativeFalse: false,
                    one: 1,
                    zero: 0,
                    strTrue: "true",
                    strFalse: "false",
                    strOne: "1",
                    strZero: "0",
                }),
            );
            const storage = new Storage("ts");
            expect(storage.readBool("nativeTrue")).toBe(true);
            expect(storage.readBool("nativeFalse")).toBe(false);
            expect(storage.readBool("one")).toBe(true);
            expect(storage.readBool("zero")).toBe(false);
            expect(storage.readBool("strTrue")).toBe(true);
            expect(storage.readBool("strFalse")).toBe(false);
            expect(storage.readBool("strOne")).toBe(true);
            expect(storage.readBool("strZero")).toBe(false);
        });

        test("readNumber returns null fallback when missing or non-numeric", () => {
            localStorage.setItem("ts", JSON.stringify({ junk: "not-a-number" }));
            const storage = new Storage("ts");
            expect(storage.readNumber("absent")).toBeNull();
            expect(storage.readNumber("absent", 7)).toBe(7);
            expect(storage.readNumber("junk", 0)).toBe(0);
        });

        test("readNumber parses native and string-encoded numbers", () => {
            localStorage.setItem("ts", JSON.stringify({ n: 42, s: "13.5" }));
            const storage = new Storage("ts");
            expect(storage.readNumber("n")).toBe(42);
            expect(storage.readNumber("s")).toBe(13.5);
        });
    });
});
