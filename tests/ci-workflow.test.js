/**
 * This file is part of the package magicsunday/webtrees-chart-lib.
 *
 * For the full copyright and license information, please read the
 * LICENSE file distributed with this source code.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "@jest/globals";

const WORKFLOW = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    ".github",
    "workflows",
    "ci.yml",
);

const BASELINE_GREEN = "if: steps.baseline.outcome == 'success'";
const BASELINE_RED = "if: steps.baseline.outcome == 'failure'";

/**
 * Returns the steps of the `consumer-types` job as raw text blocks.
 *
 * The repository declares no YAML parser, so the job is cut out by its indentation: it
 * starts at its own key and ends at the next job key, and each step starts at a list dash
 * at the step indentation.
 *
 * @returns {string[]} One text block per step, in file order.
 */
function consumerTypesSteps() {
    const workflow = readFileSync(WORKFLOW, "utf8");
    const job = /\n {4}consumer-types:\n([\s\S]*?)(?=\n {4}[\w-]+:\n|$)/.exec(workflow);

    expect(job).not.toBeNull();

    return job[1].split(/\n {12}- /).slice(1);
}

/**
 * Finds the single step whose text contains the marker.
 *
 * @param {string[]} steps Step blocks of the job.
 * @param {string} marker Text that identifies the step.
 * @returns {{index: number, text: string}} The step and its position in the job.
 */
function stepContaining(steps, marker) {
    const matches = steps.filter((step) => step.includes(marker));

    expect(matches).toHaveLength(1);

    return { index: steps.indexOf(matches[0]), text: matches[0] };
}

/**
 * Returns the command of a step, the text after its `run:` key.
 *
 * @param {string} step Step block.
 * @returns {string} The command, or an empty string when the step has none.
 */
function runCommand(step) {
    return /^ {14}run: (.*)$/m.exec(step)?.[1] ?? "";
}

describe("consumer-types job in ci.yml", () => {
    test("typechecks the installed consumer after its install and before the library is swapped in", () => {
        const steps = consumerTypesSteps();
        const install = stepContaining(steps, "Install the consumer");
        const baseline = stepContaining(steps, "id: baseline");
        const swap = stepContaining(steps, "Swap the built library");

        expect(runCommand(baseline.text)).toBe("npm run typecheck");
        expect(baseline.text).toContain("working-directory: consumer");
        expect(baseline.index).toBeGreaterThan(install.index);
        expect(baseline.index).toBeLessThan(swap.index);
    });

    test("lets a red baseline through so the job does not fail on it", () => {
        const baseline = stepContaining(consumerTypesSteps(), "id: baseline");

        expect(baseline.text).toContain("continue-on-error: true");
        expect(baseline.text).not.toContain("if:");
    });

    test("names the consumer in a warning when the baseline is red", () => {
        const report = stepContaining(consumerTypesSteps(), "::warning::");

        expect(report.text).toContain(BASELINE_RED);
        expect(report.text).toMatch(/CONSUMER: \$\{\{ matrix\.consumer \}\}/);
        expect(runCommand(report.text)).toContain("$CONSUMER");
        expect(runCommand(report.text)).not.toMatch(/\$\{\{/);
    });

    test("skips the swap when the baseline is red", () => {
        const swap = stepContaining(consumerTypesSteps(), "Swap the built library");

        expect(swap.text).toContain(BASELINE_GREEN);
    });

    test("skips the second typecheck when the baseline is red but keeps it failing otherwise", () => {
        const steps = consumerTypesSteps();
        const check = stepContaining(steps, "against the built declarations");
        const swap = stepContaining(steps, "Swap the built library");

        expect(check.text).toContain(BASELINE_GREEN);
        expect(check.text).toContain("working-directory: consumer");
        expect(runCommand(check.text)).toBe("npm run typecheck");
        expect(check.text).not.toContain("continue-on-error");
        expect(check.index).toBeGreaterThan(swap.index);
    });
});
