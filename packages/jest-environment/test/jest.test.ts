/**
 * jest-environment-rtd under a real Jest 30 run (spawned): the stock React + Testing Library
 * suite in jest/ passes, and an unhandled listener exception fails its test.
 *
 * Spec: HTML Standard — The Window object https://html.spec.whatwg.org/#the-window-object,
 *   Reporting exceptions https://html.spec.whatwg.org/#report-an-exception
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const pkg = fileURLToPath(new URL("..", import.meta.url));

interface JestJson {
  numPassedTests: number;
  numFailedTests: number;
  testResults: { message: string; assertionResults: { status: string; fullName: string; failureMessages: string[] }[] }[];
}

function jest(...args: string[]): JestJson {
  const run = spawnSync("pnpm", ["exec", "jest", "--config", "jest/jest.config.cjs", "--json", ...args], { cwd: pkg, encoding: "utf8" });
  return JSON.parse(run.stdout) as JestJson;
}

describe("Jest integration — https://html.spec.whatwg.org/#the-window-object", () => {
  test("stock React + Testing Library suite passes", { timeout: 60_000 }, () => {
    const result = jest("--runInBand");
    // A suite that failed to load (e.g. a broken @rtd/dom import) reports its error here.
    expect(result.testResults.map((r) => r.message).join("").trim()).toBe("");
    const failures = result.testResults.flatMap((r) => r.assertionResults.filter((a) => a.status !== "passed"));
    expect(failures).toEqual([]);
    expect(result.numPassedTests).toBe(17);
  });

  test("an unhandled exception in a React onClick fails the test (https://html.spec.whatwg.org/#report-an-exception)", { timeout: 60_000 }, () => {
    const result = jest("--testMatch", "<rootDir>/uncaught.fixture.cjs");
    expect(result.numFailedTests).toBe(1);
    expect(result.testResults[0].assertionResults[0].failureMessages.join("\n")).toContain("boom from onClick");
  });
});
