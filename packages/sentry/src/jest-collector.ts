// The worker side for Jest, driven by @ctrl/dom-jest-environment when the reporter (jest.ts) has
// set CTRL_DOM_SENTRY_DIR: collects each test's spans (collector.ts) from jest-circus's events and
// the page when its function fails (`test_fn_failure` comes before afterEach hooks, so before
// Testing Library's cleanup), then writes the file's results for the reporter to read.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startCollecting, type CollectedTest } from "./collector.ts";

/** The fields of jest-circus's events and test entries this reads. */
interface CircusTest {
  name: string;
  parent?: { name: string; parent?: unknown };
}
interface CircusEvent {
  name: string;
  test?: CircusTest;
  error?: unknown;
}

export interface JestCollector {
  handleTestEvent(event: CircusEvent): void;
  /** Stop collecting and write the file's results (environment teardown). */
  finish(): void;
}

/** What the environment writes per test file: collected data by test name. */
export interface JestFileData {
  testPath: string;
  tests: Record<string, CollectedTest>;
}

/** Where the environment writes a test file's data in the reporter's directory. */
export function jestDataFile(dir: string, testPath: string): string {
  return join(dir, `${createHash("sha1").update(testPath).digest("hex")}.json`);
}

/** describe blocks and the test, joined with " > " (the root describe block has no name of its own). */
export function circusTestName(test: CircusTest): string {
  const names = [test.name];
  for (let block = test.parent as CircusTest | undefined; block?.parent !== undefined; block = block.parent as CircusTest | undefined) names.unshift(block.name);
  return names.join(" > ");
}

export function createJestCollector(options: { dir: string; testPath: string; getDocument: () => unknown }): JestCollector {
  const collector = startCollecting();
  const attempts = new Map<CircusTest, CollectedTest>();
  const tests: Record<string, CollectedTest> = {};
  return {
    handleTestEvent(event) {
      if (event.test === undefined) return;
      if (event.name === "test_start") {
        collector.beginTest(attempts.get(event.test));
      } else if (event.name === "test_fn_failure") {
        collector.captureFailure(options.getDocument(), event.error);
      } else if (event.name === "test_done") {
        const collected = collector.endTest();
        if (collected === null) return;
        attempts.set(event.test, collected);
        tests[circusTestName(event.test)] = collected;
      }
    },
    finish() {
      collector.stop();
      const data: JestFileData = { testPath: options.testPath, tests };
      // Reporting must never fail a test file: without the data, the reporter sends the results alone.
      try {
        mkdirSync(options.dir, { recursive: true });
        writeFileSync(jestDataFile(options.dir, options.testPath), JSON.stringify(data));
      } catch {}
    },
  };
}
