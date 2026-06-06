/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "@jest/globals";
import rollupConfig from "../rollup.config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Recursively collects every `*.js` file below a directory.
 *
 * @param {string} dir Directory to walk.
 * @returns {string[]} Absolute file paths.
 */
function collectJsFiles(dir) {
    const files = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...collectJsFiles(full));
        } else if (entry.name.endsWith(".js")) {
            files.push(full);
        }
    }

    return files;
}

/**
 * Blanks out block comments (including JSDoc) and line comments so the import
 * scan never matches a `from "d3-…"` that lives inside a comment — e.g. a JSDoc
 * `@import { … } from "d3-…"` type annotation or a commented-out import. Those
 * are not runtime imports and must not leak a non-bundled module into the set.
 *
 * @param {string} source Raw file contents.
 * @returns {string} Source with comment bodies removed.
 */
function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Extracts the set of `d3-*` module specifiers imported anywhere in `src/`.
 * Covers binding imports (`import { x } from "d3-y"`, including the multi-line
 * form where the specifier sits on the closing line) and side-effect imports
 * (`import "d3-transition"`). The scan targets static import statements against
 * comment-stripped source; a dynamic `import("d3-…")` or a subpath specifier
 * (`"d3-array/src/…"`) would need the pattern extended — none exist today.
 *
 * @returns {Set<string>} Imported d3 module names.
 */
function collectImportedD3Modules() {
    const modules = new Set();
    const pattern = /(?:from|import)\s+"(d3-[a-z-]+)"/g;

    for (const file of collectJsFiles(join(ROOT, "src"))) {
        const source = stripComments(readFileSync(file, "utf8"));

        for (const match of source.matchAll(pattern)) {
            modules.add(match[1]);
        }
    }

    return modules;
}

describe("build configuration stays in sync with the d3 imports", () => {
    const imported = collectImportedD3Modules();

    test("the d3 import scan actually finds modules", () => {
        // Floor guard: a relocated src/, a broken walk, or a broken regex would
        // make `imported` empty, and then the bundled/missing checks below pass
        // vacuously. Anchor on d3-selection (imported by virtually every widget).
        expect(imported.size).toBeGreaterThan(0);
        expect(imported.has("d3-selection")).toBe(true);
    });

    test("rollup keeps every imported d3 module external", () => {
        const external = new Set(rollupConfig.external.filter((id) => id.startsWith("d3-")));

        // Imported but not external → the module gets bundled into dist/,
        // breaking the peer-dependency strategy (consumer supplies d3 once).
        const bundled = [...imported].filter((id) => !external.has(id)).sort();
        expect(bundled).toEqual([]);

        // External but never imported → stale entry, drop it.
        const unused = [...external].filter((id) => !imported.has(id)).sort();
        expect(unused).toEqual([]);
    });

    test("peerDependencies declares exactly the imported d3 modules", () => {
        const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
        const peers = new Set(
            Object.keys(manifest.peerDependencies).filter((id) => id.startsWith("d3-")),
        );

        const missing = [...imported].filter((id) => !peers.has(id)).sort();
        expect(missing).toEqual([]);

        // Declared as a peer but never imported → consumers install it for
        // nothing. Keep the peer surface honest.
        const extra = [...peers].filter((id) => !imported.has(id)).sort();
        expect(extra).toEqual([]);
    });
});
