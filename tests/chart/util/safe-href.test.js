import { describe, expect, test } from "@jest/globals";

import { safeHref } from "src/chart/util/safe-href.js";

describe("safeHref — allowed targets pass through unchanged", () => {
    test.each([
        ["a relative path", "/tree/individual/I1"],
        ["a bare relative path", "individual/I1"],
        ["a same-document fragment", "#/a"],
        ["a plain fragment", "#section"],
        ["an https URL", "https://example.com/x"],
        ["an http URL", "http://example.com/x"],
        ["a protocol-relative URL", "//example.com/x"],
        ["a protocol-relative URL with a port", "//example.com:8080/x"],
        ["a query-only target", "?id=I1"],
        // Colon-bearing relative URLs must NOT be mistaken for a scheme: a colon
        // after the first path/fragment/query segment is legal and navigable.
        ["a relative path with a later-segment colon", "tree/a:b"],
        ["a dot-relative path with a colon", "./a:b"],
        ["a fragment containing a colon", "#a:b"],
        ["a query containing a colon", "?x=a:b"],
    ])("%s", (_label, href) => {
        expect(safeHref(href)).toBe(href);
    });

    test("an http(s) URL keeps its original case (only normalisation is internal)", () => {
        expect(safeHref("HTTPS://Example.com/Path")).toBe("HTTPS://Example.com/Path");
    });
});

describe("safeHref — hostile schemes are blocked", () => {
    test.each([
        ["javascript:", "javascript:alert(1)"],
        ["mixed-case JavaScript:", "JavaScript:alert(1)"],
        ["leading-space javascript:", "  javascript:alert(1)"],
        ["trailing-space javascript:", "javascript:alert(1)  "],
        ["tab-split java\\tscript:", "java\tscript:alert(1)"],
        ["newline-split java\\nscript:", "java\nscript:alert(1)"],
        ["NUL-split java\\0script:", "java\u0000script:alert(1)"],
        ["data: URL", "data:text/html,<script>alert(1)</script>"],
        ["vbscript:", "vbscript:msgbox(1)"],
        ["an unlisted scheme (mailto:)", "mailto:a@b.c"],
        ["an unlisted scheme (ftp:)", "ftp://host/f"],
        ["an unlisted scheme (tel:)", "tel:+1234"],
        // A bare scheme-shaped target (no `/`, `#`, `?` before the colon) is an
        // explicit, non-http(s) scheme per RFC 3986 and is blocked defensively.
        ["a bare scheme-shaped target", "foo:bar"],
    ])("blocks %s -> empty string", (_label, href) => {
        expect(safeHref(href)).toBe("");
    });
});

describe("safeHref — unusable input falls back to empty string", () => {
    test.each([
        ["empty string", ""],
        ["whitespace only", "   "],
        ["control chars only", "\t\n"],
        ["null", null],
        ["undefined", undefined],
        ["a number", 42],
        ["an object", {}],
    ])("%s -> empty string", (_label, input) => {
        expect(safeHref(input)).toBe("");
    });
});
