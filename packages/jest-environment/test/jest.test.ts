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
  return jestWith({}, ...args);
}

function jestWith(env: Record<string, string | undefined>, ...args: string[]): JestJson {
  const merged: Record<string, string | undefined> = { ...process.env, ...env };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete merged[key];
  const run = spawnSync("pnpm", ["exec", "jest", "--config", "jest/jest.config.cjs", "--json", ...args], { cwd: pkg, encoding: "utf8", env: merged });
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

// Agent debug mode (docs/agent-debugging.md): not a spec, an @ctrl/dom addition.
describe("failure snapshots under CTRL_DOM_DEBUG (handleTestEvent, test_fn_failure)", () => {
  const SNAPSHOT = [
    "Accessibility snapshot of <body> when the test failed (CTRL_DOM_DEBUG=aria):",
    "- main:",
    '  - heading "Checkout" [level=1]',
    '  - form "Payment":',
    '    - textbox "Email"',
    '    - button "Pay now"',
  ].join("\n");

  test("a failed expect and a thrown error get the body as it was before cleanup appended", { timeout: 60_000 }, () => {
    const result = jestWith({ CTRL_DOM_DEBUG: "aria", CTRL_DOM_DEBUG_LINES: undefined }, "--testMatch", "<rootDir>/failure-snapshot.fixture.cjs");
    expect(result.numFailedTests).toBe(2);
    const [expectFailure, thrown] = result.testResults[0].assertionResults.filter((a) => a.status === "failed").map((a) => a.failureMessages.join("\n").replace(/\u001b\[\d+m/g, ""));
    expect(expectFailure).toContain(`Received: "Checkout"\n\n${SNAPSHOT}\n    at `);
    expect(thrown).toContain(`Error: boom\n\n${SNAPSHOT}\n    at `);
  });

  test("without CTRL_DOM_DEBUG the messages are Jest's own", { timeout: 60_000 }, () => {
    const result = jestWith({ CTRL_DOM_DEBUG: undefined }, "--testMatch", "<rootDir>/failure-snapshot.fixture.cjs");
    expect(result.numFailedTests).toBe(2);
    const messages = result.testResults[0].assertionResults.flatMap((a) => a.failureMessages).join("\n");
    expect(messages).not.toContain("Accessibility snapshot");
    expect(messages).toContain("Error: boom\n    at ");
  });
});
