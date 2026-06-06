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
 * Extracts the set of `d3-*` module specifiers imported anywhere in `src/`.
 * Covers both binding imports (`import { x } from "d3-y"`) and side-effect
 * imports (`import "d3-transition"`).
 *
 * @returns {Set<string>} Imported d3 module names.
 */
function collectImportedD3Modules() {
    const modules = new Set();
    const pattern = /(?:from|import)\s+"(d3-[a-z-]+)"/g;

    for (const file of collectJsFiles(join(ROOT, "src"))) {
        const source = readFileSync(file, "utf8");
        let match = pattern.exec(source);

        while (match !== null) {
            modules.add(match[1]);
            match = pattern.exec(source);
        }
    }

    return modules;
}

/**
 * Reads the package manifest as a typed-enough plain object.
 *
 * @returns {{ peerDependencies: Record<string, string> }} Parsed manifest.
 */
function readManifest() {
    return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
}

describe("build configuration stays in sync with the d3 imports", () => {
    const imported = collectImportedD3Modules();

    test("rollup keeps every imported d3 module external", () => {
        const external = new Set(
            (Array.isArray(rollupConfig.external) ? rollupConfig.external : []).filter((id) =>
                id.startsWith("d3-"),
            ),
        );

        // Imported but not external → the module gets bundled into dist/,
        // breaking the peer-dependency strategy (consumer supplies d3 once).
        const bundled = [...imported].filter((id) => !external.has(id)).sort();
        expect(bundled).toEqual([]);

        // External but never imported → stale entry, drop it.
        const unused = [...external].filter((id) => !imported.has(id)).sort();
        expect(unused).toEqual([]);
    });

    test("peerDependencies declares exactly the imported d3 modules", () => {
        const peers = new Set(
            Object.keys(readManifest().peerDependencies).filter((id) => id.startsWith("d3-")),
        );

        const missing = [...imported].filter((id) => !peers.has(id)).sort();
        expect(missing).toEqual([]);

        // Declared as a peer but never imported → consumers install it for
        // nothing. Keep the peer surface honest.
        const extra = [...peers].filter((id) => !imported.has(id)).sort();
        expect(extra).toEqual([]);
    });
});
