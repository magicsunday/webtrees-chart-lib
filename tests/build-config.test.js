/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "@jest/globals";
import rollupConfig from "../rollup.config.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

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
 * Extracts the `d3-*` module specifiers imported by one source file, on the same
 * terms as the scan of the whole tree below.
 *
 * @param {string} source Raw file contents.
 * @returns {string[]} Imported d3 module names, sorted and unique.
 */
function importedD3Modules(source) {
    const pattern = /(?:from|import)\s+"(d3-[a-z-]+)"/g;

    return [
        ...new Set([...stripComments(source).matchAll(pattern)].map((match) => match[1])),
    ].sort();
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

    for (const file of collectJsFiles(join(ROOT, "src"))) {
        for (const id of importedD3Modules(readFileSync(file, "utf8"))) {
            modules.add(id);
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
        const peers = new Set(
            Object.keys(MANIFEST.peerDependencies).filter((id) => id.startsWith("d3-")),
        );

        const missing = [...imported].filter((id) => !peers.has(id)).sort();
        expect(missing).toEqual([]);

        // Declared as a peer but never imported → consumers install it for
        // nothing. Keep the peer surface honest.
        const extra = [...peers].filter((id) => !imported.has(id)).sort();
        expect(extra).toEqual([]);
    });
});

describe("the declared entrypoints stay wired to the build", () => {
    // The package publishes subpaths only. A consumer's
    // `import … from "@magicsunday/webtrees-chart-lib/chart-core"` resolves only
    // while three things agree: the `exports` map, the rollup input that emits
    // that bundle, and the declaration file the map points at. The surface tests
    // in index.test.js pin what each entrypoint EXPORTS, not that it exists —
    // dropping a key here, or renaming an emitted bundle, would leave those green
    // and still break every consumer with ERR_PACKAGE_PATH_NOT_EXPORTED.
    // Both output directories are derived, never spelled out: `dist` is rollup's
    // own `output.dir` and `dist/types` is the declaration emit's `outDir`.
    // Hard-coding either would let a build restructure move the real artifacts
    // while these assertions still matched the stale literal.
    const bundleDir = rollupConfig.output.dir;
    const { declarationDir, outDir, rootDir } = JSON.parse(
        readFileSync(join(ROOT, "tsconfig.dts.json"), "utf8"),
    ).compilerOptions;
    // tsc writes declarations to `declarationDir` when it is set and to `outDir`
    // otherwise, so this is where the declaration files really land.
    const emitDir = posix.normalize(declarationDir ?? outDir);

    // tsc writes `<outDir>/<source path relative to rootDir>.d.ts`, so the
    // declaration path is derived from the rollup input rather than assumed to be
    // `<outDir>/<chunk name>.d.ts`. Moving a source file into a subdirectory
    // changes where tsc emits it while the chunk name stays put — that rot would
    // survive an assertion built from the chunk name alone.
    const declarationFor = (name) =>
        `./${emitDir}/${relative(rootDir, rollupConfig.input[name]).replace(/\.js$/, ".d.ts")}`;

    test("each subpath agrees with the bundle and declaration paths the build config produces", () => {
        for (const [subpath, name] of [
            ["./chart-core", "chart-core"],
            ["./infra", "infra"],
            ["./linked-tree", "linked-tree"],
            ["./widgets", "widgets"],
        ]) {
            expect(MANIFEST.exports[subpath].import).toBe(
                `./${bundleDir}/${rollupConfig.output.entryFileNames.replace("[name]", name)}`,
            );
            expect(MANIFEST.exports[subpath].types).toBe(declarationFor(name));
        }
    });

    test("the Git-URL install still builds the published artifacts", () => {
        // Consumers pin this package by Git tag, so npm runs `prepare` on install
        // to produce the ignored `dist/`. Losing that script ships a package whose
        // every declared path points at a file that was never built.
        expect(MANIFEST.scripts.prepare).toBe("npm run build");
    });

    test("the build empties the output directory before it emits", () => {
        // Neither rollup nor the declaration emit clears its output, so a rebuild
        // in place keeps the declarations of a removed source file and a publish
        // from that worktree would pack them. The declaration emit must sit below
        // the bundle directory for one clean step to cover both. The whole script
        // is compared, because a command-line flag such as `--outDir` overrides the
        // directory read from the config and a later step could restore stale files.
        expect(emitDir.startsWith(`${bundleDir}/`)).toBe(true);
        expect(MANIFEST.scripts.build).toBe(
            `rm -rf ${bundleDir} && rollup --config && tsc -p tsconfig.dts.json`,
        );
    });

    test("every published path is inside a files entry", () => {
        // Resolution can be perfectly wired and still ship nothing: `files`
        // whitelists what the Git-URL install actually exposes. Narrowing it would
        // leave every path above correct and every consumer broken at install.
        const published = Object.values(MANIFEST.exports).flatMap((entry) => [
            entry.import,
            entry.types,
        ]);

        for (const path of published) {
            const normalised = path.replace(/^\.\//, "");
            // An npm `files` entry is either a directory (everything below it
            // ships) or one exact file. Matching only the directory form would
            // fail this test on a perfectly valid manifest that whitelists a
            // published bundle by name.
            const covered = MANIFEST.files.some((entry) => {
                const trimmed = entry.replace(/\/$/, "");

                return normalised === trimmed || normalised.startsWith(`${trimmed}/`);
            });

            expect(covered).toBe(true);
        }
    });
});
