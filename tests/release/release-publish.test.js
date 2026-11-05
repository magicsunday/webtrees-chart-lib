/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { spawnSync } from "node:child_process";
import {
    chmodSync,
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("the release-publish target", () => {
    // Every test runs in its own scratch directory outside the repository. It holds a copy of the
    // Makefile and Make/, the stub commands that come first on PATH and the TMPDIR of the run.
    let work = "";

    beforeEach(() => {
        work = mkdtempSync(join(tmpdir(), "release-publish-"));
        mkdirSync(join(work, "bin"));
        mkdirSync(join(work, "tmp"));
        mkdirSync(join(work, "module"));
        cpSync(join(ROOT, "Makefile"), join(work, "module", "Makefile"));
        cpSync(join(ROOT, "Make"), join(work, "module", "Make"), { recursive: true });
        installStub("git", "#!/bin/sh\nexit 0\n");
    });

    afterEach(() => {
        rmSync(work, { recursive: true, force: true });
    });

    /**
     * Writes an executable stub command into the directory that comes first on PATH.
     *
     * @param {string} name Name of the command to shadow.
     * @param {string} script Shell script that the stub runs.
     * @returns {void}
     */
    function installStub(name, script) {
        const path = join(work, "bin", name);

        writeFileSync(path, script);
        chmodSync(path, 0o755);
    }

    /**
     * Installs a `gh` stub that keeps the content of the notes file handed to `gh release create`.
     *
     * @returns {void}
     */
    function installRecordingStub() {
        installStub(
            "gh",
            `#!/bin/sh\nif [ "$1" = release ]; then\n    while [ $# -gt 0 ]; do\n        if [ "$1" = --notes-file ]; then cp "$2" "${join(work, "recorded-notes")}"; fi\n        shift\n    done\nfi\nexit 0\n`,
        );
    }

    /**
     * Reads the notes file that the recording `gh` stub kept.
     *
     * @returns {string} Content of the notes file.
     */
    function recordedNotes() {
        return readFileSync(join(work, "recorded-notes"), "utf8");
    }

    /**
     * Runs `make release-publish` in the scratch copy with the stub commands first on PATH.
     *
     * @param {string[]} [args] Further make arguments, such as a variable on the command line.
     * @param {Record<string, string>} [environment] Further variables for the environment of make.
     * @returns {{status: number|null, output: string}} Exit status and the combined output.
     */
    function publish(args = [], environment = {}) {
        const run = spawnSync("make", ["release-publish", "VERSION=9.9.9", ...args], {
            cwd: join(work, "module"),
            encoding: "utf8",
            env: {
                PATH: `${join(work, "bin")}:/usr/local/bin:/usr/bin:/bin`,
                TMPDIR: join(work, "tmp"),
                HOME: work,
                ...environment,
            },
        });

        return { status: run.status, output: `${run.stdout}${run.stderr}` };
    }

    test("fails when the release cannot be created", () => {
        installStub(
            "gh",
            '#!/bin/sh\nif [ "$1" = release ]; then echo "gh: release failed" >&2; exit 3; fi\necho stub\n',
        );

        const { status, output } = publish();

        expect(status).not.toBe(0);
        expect(output).not.toContain("published");
        expect(readdirSync(join(work, "tmp"))).toEqual([]);
    });

    test("fails when the release notes cannot be generated", () => {
        const created = join(work, "release-created");

        installStub(
            "gh",
            `#!/bin/sh\nif [ "$1" = release ]; then touch "${created}"; exit 0; fi\necho "gh: notes failed" >&2\nexit 4\n`,
        );

        const { status, output } = publish();

        expect(status).not.toBe(0);
        expect(output).not.toContain("published");
        expect(existsSync(created)).toBe(false);
        expect(readdirSync(join(work, "tmp"))).toEqual([]);
    });

    test("reports the publication when the release is created", () => {
        installStub("gh", "#!/bin/sh\necho stub\n");

        const { status, output } = publish();

        expect(status).toBe(0);
        expect(output).toContain("Release 9.9.9 published");
        expect(readdirSync(join(work, "tmp"))).toEqual([]);
    });

    test("passes inline notes of the command line without shell evaluation", () => {
        installRecordingStub();

        const note = "Fix `echo INJECTED` and \"quoted\" and 'single' text";
        const { status } = publish([`NOTES=${note}`]);

        expect(status).toBe(0);
        expect(recordedNotes()).toBe(`${note}\n`);
    });

    test("passes inline notes of the environment unchanged", () => {
        installRecordingStub();

        const note = "Cost $HOME-ish and $(id) and `echo INJECTED`";
        const { status } = publish([], { NOTES: note });

        expect(status).toBe(0);
        expect(recordedNotes()).toBe(`${note}\n`);
    });

    test("passes inline notes with dollar signs of the command line unchanged", () => {
        installRecordingStub();

        const note = "Cost $HOME-ish, $$ and $(id) and $(shell touch executed-by-make)";
        const { status } = publish([`NOTES=${note}`]);

        expect(status).toBe(0);
        expect(recordedNotes()).toBe(`${note}\n`);
        expect(existsSync(join(work, "module", "executed-by-make"))).toBe(false);
    });
});
