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
     * Runs `make release-publish` in the scratch copy with the stub commands first on PATH.
     *
     * @returns {{status: number|null, output: string}} Exit status and the combined output.
     */
    function publish() {
        const run = spawnSync("make", ["release-publish", "VERSION=9.9.9"], {
            cwd: join(work, "module"),
            encoding: "utf8",
            env: {
                PATH: `${join(work, "bin")}:/usr/local/bin:/usr/bin:/bin`,
                TMPDIR: join(work, "tmp"),
                HOME: work,
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
});
