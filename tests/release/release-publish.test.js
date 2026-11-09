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
     * Runs make in the scratch copy with the stub commands first on PATH.
     *
     * @param {string[]} makeArguments Arguments of the make command.
     * @param {Record<string, string>} environment Further variables for the environment of make.
     * @returns {{status: number|null, output: string}} Exit status and the combined output.
     */
    function runMake(makeArguments, environment) {
        const run = spawnSync("make", makeArguments, {
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

    /**
     * Runs `make release-publish` in the scratch copy with the stub commands first on PATH.
     *
     * @param {string[]} [args] Further make arguments, such as a variable on the command line.
     * @param {Record<string, string>} [environment] Further variables for the environment of make.
     * @returns {{status: number|null, output: string}} Exit status and the combined output.
     */
    function publish(args = [], environment = {}) {
        return runMake(["release-publish", "VERSION=9.9.9", ...args], environment);
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

    test("passes inline notes of the environment through a sub-make", () => {
        installRecordingStub();
        writeFileSync(
            join(work, "module", "sub-make.mk"),
            "include Makefile\n\nvia-sub-make:\n\t@$(MAKE) -f sub-make.mk release-publish VERSION=9.9.9\n",
        );

        const note = "Cost $HOME-ish and $(id) and `echo INJECTED`";
        const { status } = runMake(["-f", "sub-make.mk", "via-sub-make"], { NOTES: note });

        expect(status).toBe(0);
        expect(recordedNotes()).toBe(`${note}\n`);
    });

    test("ignores a raw note left in the environment of a top-level run", () => {
        installRecordingStub();

        const { status } = publish([], { NOTES_RAW: "stale note" });

        expect(status).toBe(0);
        expect(recordedNotes()).not.toContain("stale note");
    });

    test("passes inline notes with dollar signs of the command line unchanged", () => {
        installRecordingStub();

        const note = "Cost $HOME-ish, $$ and $(id) and $(shell touch executed-by-make)";
        const { status } = publish([`NOTES=${note}`]);

        expect(status).toBe(0);
        expect(recordedNotes()).toBe(`${note}\n`);
        expect(existsSync(join(work, "module", "executed-by-make"))).toBe(false);
    });

    /**
     * Runs the real git and fails the test when the command fails.
     *
     * @param {string[]} args Arguments of the git command.
     * @param {string} [directory] Directory to run it in, the repository of the scratch copy by default.
     * @returns {string} Trimmed output of the command.
     */
    function git(args, directory = join(work, "module")) {
        const run = spawnSync("git", args, {
            cwd: directory,
            encoding: "utf8",
            env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: work },
        });

        if (run.status !== 0) {
            throw new Error(`git ${args.join(" ")} failed: ${run.stdout}${run.stderr}`);
        }

        return run.stdout.trim();
    }

    /**
     * Replaces the git stub by the real git and turns the scratch copy into a repository with a bare remote.
     * The leftover annotated tag sits on the first commit, the release tag on HEAD, and the git setting that
     * follows tags is on.
     *
     * @returns {void}
     */
    function createRepositoryWithRemote() {
        const remote = join(work, "remote.git");

        rmSync(join(work, "bin", "git"));
        installStub("gh", "#!/bin/sh\necho stub\n");

        git(["init", "--quiet", "--bare", remote], work);
        git(["init", "--quiet", "--initial-branch=main"]);
        git(["config", "user.name", "Release Test"]);
        git(["config", "user.email", "release-test@example.invalid"]);
        git(["config", "commit.gpgSign", "false"]);
        git(["config", "tag.gpgSign", "false"]);
        git(["config", "push.followTags", "true"]);
        git(["remote", "add", "origin", remote]);

        writeFileSync(join(work, "module", "first"), "first\n");
        git(["add", "first"]);
        git(["commit", "--quiet", "-m", "First commit"]);
        git(["tag", "-a", "8.8.8", "-m", "Leftover tag"]);

        writeFileSync(join(work, "module", "second"), "second\n");
        git(["add", "second"]);
        git(["commit", "--quiet", "-m", "Release commit"]);
        git(["tag", "-a", "9.9.9", "-m", "Release tag"]);
    }

    /**
     * Lists the refs that the bare remote holds.
     *
     * @returns {string[]} The ref names in the order of git.
     */
    function remoteRefs() {
        const refs = git(["for-each-ref", "--format=%(refname)"], join(work, "remote.git"));

        return refs === "" ? [] : refs.split("\n");
    }

    test("publishes only the branch and the release tag", () => {
        createRepositoryWithRemote();

        const { status } = publish();

        expect(status).toBe(0);
        expect(remoteRefs()).toEqual(["refs/heads/main", "refs/tags/9.9.9"]);
    });

    test.each([
        ["an empty version", ""],
        ["a version without a local tag", "7.7.7"],
    ])("sends nothing for %s", (_description, version) => {
        createRepositoryWithRemote();

        const { status, output } = publish([`VERSION=${version}`]);

        expect(status).not.toBe(0);
        expect(remoteRefs()).toEqual([]);
        // The push rejects the refspec of the version and its error names it.
        expect(output).toContain(`refs/tags/${version}`);
    });
});
