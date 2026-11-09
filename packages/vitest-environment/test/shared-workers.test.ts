/**
 * The ctrlDom() plugin's `sharedWorkers` mode under a real Vitest run (spawned): three fixture
 * files run one after another in one worker (test/shared-workers), each checking what it starts
 * from and then leaving a mounted tree, a focused element, attributes on `<body>` and `<html>`, a
 * hoisted style sheet, storage, a cookie, a pushed history entry, a pending timer and a pending
 * animation frame behind. An @ctrl/dom addition, not a spec; what it relies on:
 *
 * Vitest `isolate` — https://vitest.dev/config/#isolate (false: files of a worker share a realm)
 * Vitest `vi.resetModules()` — https://vitest.dev/api/vi.html#vi-resetmodules
 * Vitest setup files — https://vitest.dev/config/#setupfiles (run before each test file)
 * Testing Library cleanup — https://testing-library.com/docs/react-testing-library/api#cleanup
 * React style sheet precedence — https://react.dev/reference/react-dom/components/style#rendering-an-inline-css-stylesheet
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const out = mkdtempSync(join(tmpdir(), "ctrl-dom-shared-workers-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

interface VitestJson {
  numTotalTests: number;
  numPassedTests: number;
  testResults: { assertionResults: { title: string; status: string }[] }[];
}

let run = 0;

/** One run of the fixture project: how many tests there were, and the titles of the failed ones. */
function fixture(env: Record<string, string>): { total: number; passed: number; failed: string[] } {
  const file = join(out, `run-${run++}.json`);
  spawnSync(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "--config",
      "test/shared-workers/vitest.config.ts",
      "--reporter=json",
      `--outputFile.json=${file}`,
    ],
    { cwd: pkg, encoding: "utf8", env: { ...process.env, ...env } },
  );
  const json = JSON.parse(readFileSync(file, "utf8")) as VitestJson;
  const failed = json.testResults.flatMap((r) =>
    r.assertionResults.filter((a) => a.status !== "passed").map((a) => a.title),
  );
  return { total: json.numTotalTests, passed: json.numPassedTests, failed };
}

describe("sharedWorkers: each file of a shared worker starts as the first one did", () => {
  test("without runner globals: the window is reset and first-party modules are fresh for every file", () => {
    expect(fixture({ FIXTURE_GLOBALS: "0" })).toEqual({ total: 12, passed: 12, failed: [] });
  });

  test("with runner globals: Testing Library's cleanup also runs after each test of every file, not only the first", () => {
    expect(fixture({ FIXTURE_GLOBALS: "1" })).toEqual({ total: 12, passed: 12, failed: [] });
  });

  test("the fixture does detect a shared worker: with `isolate: false` alone the later files fail", () => {
    const { total, failed } = fixture({ FIXTURE_GLOBALS: "1", FIXTURE_SHARED: "0" });
    expect(total).toBe(12);
    // The second and third file find the first one's module state, tree, storage and URL.
    expect(failed.filter((title) => title.includes("starts from a reset window"))).toHaveLength(2);
  });
});
