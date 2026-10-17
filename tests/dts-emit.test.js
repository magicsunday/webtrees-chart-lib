/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSC = join(ROOT, "node_modules", "typescript", "bin", "tsc");

// A full declaration emit plus a second compile, so the default test timeout is too short.
const TIMEOUT_MS = 180_000;

/**
 * Runs the TypeScript compiler of this repository.
 *
 * @param {string[]} args Command line arguments.
 * @param {string} cwd Working directory of the run.
 * @returns {{status: number|null, output: string}} Exit status and the combined output.
 */
function tsc(args, cwd) {
    const run = spawnSync(process.execPath, [TSC, ...args], { cwd, encoding: "utf8" });

    return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe("the emitted declarations", () => {
    // The declarations are emitted outside the repository so no test run touches `dist/`.
    // `node_modules` is linked in, because the emitted files import the d3 type packages.
    let work = "";

    beforeAll(() => {
        work = mkdtempSync(join(tmpdir(), "dts-emit-"));
        symlinkSync(join(ROOT, "node_modules"), join(work, "node_modules"), "dir");
    });

    afterAll(() => {
        rmSync(work, { recursive: true, force: true });
    });

    test(
        "type-check under noImplicitAny, as a strict consumer would check them",
        () => {
            // The strict pass over the sources cannot see this: an untyped member of a
            // JavaScript class only shows up once the declaration is emitted. A consumer
            // that type-checks the package strictly would then fail inside the library.
            const emit = tsc(["-p", "tsconfig.dts.json", "--outDir", join(work, "types")], ROOT);

            expect(emit.output).toBe("");
            expect(emit.status).toBe(0);

            const check = tsc(
                [
                    "--ignoreConfig",
                    "--noEmit",
                    "--noImplicitAny",
                    "--skipLibCheck",
                    "false",
                    "--target",
                    "ES2022",
                    "--module",
                    "ESNext",
                    "--moduleResolution",
                    "Bundler",
                    "--lib",
                    "ES2022,DOM",
                    join(work, "types", "index.d.ts"),
                    join(work, "types", "chart-core.d.ts"),
                ],
                work,
            );

            expect(check.output).toBe("");
            expect(check.status).toBe(0);
        },
        TIMEOUT_MS,
    );
});
