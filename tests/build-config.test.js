/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
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
    // The package publishes two subpaths. A consumer's
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
    const { outDir, rootDir } = JSON.parse(
        readFileSync(join(ROOT, "tsconfig.dts.json"), "utf8"),
    ).compilerOptions;

    // tsc writes `<outDir>/<source path relative to rootDir>.d.ts`, so the
    // declaration path is derived from the rollup input rather than assumed to be
    // `<outDir>/<chunk name>.d.ts`. Moving a source file into a subdirectory
    // changes where tsc emits it while the chunk name stays put — that rot would
    // survive an assertion built from the chunk name alone.
    const declarationFor = (name) =>
        `./${outDir}/${relative(rootDir, rollupConfig.input[name]).replace(/\.js$/, ".d.ts")}`;

    test("the exports map and the rollup inputs describe the same two entrypoints", () => {
        expect(Object.keys(MANIFEST.exports).sort()).toEqual([".", "./chart-core"]);
        expect(Object.keys(rollupConfig.input).sort()).toEqual(["chart-core", "index"]);
    });

    test("each subpath agrees with the bundle and declaration paths the build config produces", () => {
        for (const [subpath, name] of [
            [".", "index"],
            ["./chart-core", "chart-core"],
        ]) {
            expect(MANIFEST.exports[subpath].import).toBe(
                `./${bundleDir}/${rollupConfig.output.entryFileNames({ name })}`,
            );
            expect(MANIFEST.exports[subpath].types).toBe(declarationFor(name));
        }
    });

    test("every published path is inside a files entry", () => {
        // Resolution can be perfectly wired and still ship nothing: `files`
        // whitelists what the Git-URL install actually exposes. Narrowing it would
        // leave every path above correct and every consumer broken at install.
        const published = [
            MANIFEST.module,
            MANIFEST.types,
            ...Object.values(MANIFEST.exports).flatMap((entry) => [entry.import, entry.types]),
        ];

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

    test("the Git-URL install still builds the published artifacts", () => {
        // Consumers pin this package by Git tag, so npm runs `prepare` on install
        // to produce the ignored `dist/`. Losing that script ships a package whose
        // every declared path points at a file that was never built.
        expect(MANIFEST.scripts.prepare).toBe("npm run build");
    });

    test("the root module/types fields agree with the '.' subpath", () => {
        // `exports` is authoritative for modern resolvers, but the root `module`
        // and `types` fields are still published metadata that bundlers and
        // editors read. Pinning only the `exports` map lets these two rot to a
        // non-existent file while every other test here stays green.
        expect(`./${MANIFEST.module}`).toBe(MANIFEST.exports["."].import);
        expect(MANIFEST.types).toBe(MANIFEST.exports["."].types);
    });
});

describe("the package description counts the widgets it advertises", () => {
    // The published description enumerates the widget set. It had drifted badly
    // — "19 widget primitives" while the directory held 22 — because both the
    // number and the names were maintained by hand and nothing observed them.
    // These assertions make both halves a lockstep against the source.
    const declared = MANIFEST.description.match(/(\d+) widget primitives \(([^)]+)\)/);

    // A widget is a class declaration extending BaseWidget. Counting
    // DECLARATIONS rather than files keeps a module that ever holds two of them
    // from counting once, and the comment strip is what makes the derivation
    // sound: docblocks here do reference sibling widget classes in prose, so a
    // raw-source scan would let a sentence inflate the count. Deriving from the
    // source rather than from a file listing also means a non-widget helper
    // dropped into the directory cannot skew it.
    const widgets = collectJsFiles(join(ROOT, "src/chart/widgets")).flatMap((file) =>
        [
            ...stripComments(readFileSync(file, "utf8")).matchAll(
                /class\s+(\w+)\s+extends\s+BaseWidget\b/g,
            ),
        ].map((match) => ({ name: match[1], module: basename(file, ".js") })),
    );

    test("the description states a widget count and lists the widgets", () => {
        // Floor guard: a reworded description would make every assertion below
        // read from `null` and throw somewhere less obvious than here.
        expect(declared).not.toBeNull();
    });

    test("the widget derivation actually finds widgets", () => {
        // Mirrors the d3-scan floor guard above. Renaming the base class would
        // otherwise reduce the count check to 0 === 0 and pass silently while
        // pinning nothing.
        expect(widgets.length).toBeGreaterThan(0);
        expect(widgets.map((widget) => widget.name)).toContain("DonutChart");
    });

    test("the stated count matches the number of widget implementations", () => {
        expect(Number(declared[1])).toBe(widgets.length);
    });

    test("the advertised list names exactly the widgets that exist", () => {
        // The count alone cannot see a swap — remove one widget, add another,
        // and the number still matches while the list names a module that is
        // gone. The advertised names are prose shorthand rather than filenames
        // (`mirror` for mirror-histogram, `gauge` for gauge-arc), so each is
        // matched as a prefix of a module name.
        const advertised = declared[2].split(",").map((name) => name.trim());
        const modules = widgets.map((widget) => widget.module);

        // Arity first. The two membership checks below are both satisfied by a
        // list that is one entry too LONG through a redundant shorthand — both
        // `donut` and `donut-chart` map to exactly one module and every module
        // stays covered, so nothing but the count catches the duplicate.
        expect(advertised).toHaveLength(widgets.length);

        // Each shorthand must name exactly ONE widget. A mere "is a prefix of
        // something" test accepts the empty string, which prefixes every
        // module, and `b`, which prefixes bar-chart and box-plot alike — both
        // would pass while pinning nothing.
        expect(
            advertised.filter(
                (name) => modules.filter((module) => module.startsWith(name)).length !== 1,
            ),
        ).toEqual([]);

        // …and every widget is advertised. This is the direction a stale entry
        // for a removed widget trips on.
        expect(
            modules.filter((module) => !advertised.some((name) => module.startsWith(name))),
        ).toEqual([]);
    });
});

describe("the TypeScript configs stay TS7-ready", () => {
    // TypeScript 7 removed the `baseUrl` compiler option (error TS5102) and the
    // 6.x-era `ignoreDeprecations: "6.0"` shim that only silenced the baseUrl
    // deprecation. Re-introducing either would make `npm run typecheck`
    // (jsconfig.json) or the declaration build (tsconfig.dts.json) fail in CI —
    // the exact latent breakage GH-40 fixed. This test fails fast on a plain
    // config read, without needing a tsc invocation.
    for (const config of ["jsconfig.json", "tsconfig.dts.json"]) {
        test(`${config} carries neither baseUrl nor ignoreDeprecations`, () => {
            const { compilerOptions } = JSON.parse(readFileSync(join(ROOT, config), "utf8"));

            expect(compilerOptions.baseUrl).toBeUndefined();
            expect(compilerOptions.ignoreDeprecations).toBeUndefined();
        });
    }
});
