// Jest reporter: one trace per test file, an issue per failing test, an issue per flaky test
// (report.ts).
//
//   reporters: ["default", "@ctrl/sentry-tests/jest"],   // SENTRY_DSN and/or SENTRY_SPOTLIGHT
//   testRunner: "@ctrl/sentry-tests/jest-runner",        // describe, test, hook and test function spans
//
// With somewhere to send, it sets SENTRY_TESTS_DIR before Jest starts its workers, and the test
// runner (jest-runner.ts) writes each file's spans and failure captures there; the reporter reads
// them as each file's results arrive. Without the runner, each test is one span.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sendEnvelope } from "./envelope.ts";
import { Delivery } from "./delivery.ts";
import { jestDataFile, type JestFileData } from "./jest-collector.ts";
import { resolveOptions, type SentryTestsOptions, type ResolvedOptions } from "./options.ts";
import { buildReport, FILE_FAILURE, type ErrorInfo, type TestCaseReport } from "./report.ts";

export type { SentryTestsOptions } from "./options.ts";

/** The fields of Jest's reporter arguments this reads (@jest/test-result, @jest/reporters). */
interface JestAssertionResult {
  ancestorTitles: string[];
  title: string;
  status: string;
  duration?: number | null;
  invocations?: number;
  failureMessages: string[];
  failureDetails: unknown[];
}
interface JestTestResult {
  testFilePath: string;
  testResults: JestAssertionResult[];
  /** Set when the file could not run (it failed to load). */
  testExecError?: { message: string; stack?: string | null } | null;
}
interface JestTest {
  path: string;
  context?: { config?: { rootDir?: string; displayName?: { name: string } | string } };
}

export default class SentryTestsReporter {
  readonly options: ResolvedOptions | null;
  #rootDir: string;
  #dir: string | null = null;
  #delivery: Delivery | null = null;
  /** Whether any file arrived with the test runner's spans. */
  #collected = false;

  constructor(globalConfig: { rootDir?: string } = {}, reporterOptions: SentryTestsOptions = {}) {
    this.#rootDir = globalConfig.rootDir ?? process.cwd();
    this.options = resolveOptions(reporterOptions);
    if (this.options === null) return;
    this.#delivery = new Delivery(this.options, sendEnvelope);
    // Inherited by the workers Jest starts after constructing its reporters. Kept until the
    // process exits: in watch mode every run writes there.
    const dir = mkdtempSync(join(tmpdir(), "sentry-tests-"));
    this.#dir = dir;
    process.env.SENTRY_TESTS_DIR = dir;
    process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  }

  onTestResult(test: JestTest, testResult: JestTestResult): void {
    if (this.options === null || this.#delivery === null) return;
    const data = this.#readCollected(test.path);
    if (data !== null) this.#collected = true;
    const tests = testResult.testResults.map((a): TestCaseReport => {
      const name = [...a.ancestorTitles, a.title].join(" > ");
      const invocations = a.invocations ?? 1;
      const state = a.status === "passed" ? "pass" : a.status === "failed" ? "fail" : "skip";
      return {
        key: name,
        name,
        state,
        duration: a.duration ?? 0,
        retries: invocations - 1,
        flaky: state === "pass" && invocations > 1,
        errors: state === "fail" ? [jestError(a)] : [],
      };
    });
    const displayName = test.context?.config?.displayName;
    const project = typeof displayName === "string" ? displayName : displayName?.name;
    const execError = testResult.testExecError;
    this.#delivery.add(
      buildReport(
        {
          runner: "jest",
          root: test.context?.config?.rootDir ?? this.#rootDir,
          file: testResult.testFilePath,
          ...(project ? { project } : {}),
          tests,
          collected: data?.collected ?? null,
          ...(execError ? { outsideTests: [{ name: FILE_FAILURE, error: { message: execError.message, stack: execError.stack ?? undefined } }] } : {}),
        },
        this.options,
      ),
    );
  }

  async onRunComplete(): Promise<void> {
    if (this.#delivery === null) return;
    const summary = await this.#delivery.flush();
    if (summary !== null) process.stderr.write(`${summary}${this.#collected ? "" : ' (no traces: add testRunner: "@ctrl/sentry-tests/jest-runner")'}\n`);
  }

  getLastError(): Error | undefined {
    return undefined;
  }

  /** The runner's data for a file, removed once read (a watch-mode rerun writes it again). */
  #readCollected(testPath: string): JestFileData | null {
    if (this.#dir === null) return null;
    const file = jestDataFile(this.#dir, testPath);
    try {
      const data = JSON.parse(readFileSync(file, "utf8")) as JestFileData;
      rmSync(file, { force: true });
      return data;
    } catch {
      return null;
    }
  }
}

/** The failing test's error: Jest's `failureDetails` when it kept the error object, else its message text. */
function jestError(result: JestAssertionResult): ErrorInfo {
  const detail = result.failureDetails[0] as { name?: unknown; message?: unknown; stack?: unknown } | undefined;
  if (detail !== undefined && typeof detail.message === "string") {
    // The error crosses from Jest's worker without its stack; failureMessages keeps it as text.
    const stack = typeof detail.stack === "string" ? detail.stack : result.failureMessages[0];
    return { name: typeof detail.name === "string" ? detail.name : undefined, message: detail.message, stack };
  }
  const text = result.failureMessages[0] ?? "Test failed";
  const at = text.search(/\n\s+at /);
  return { message: at < 0 ? text : text.slice(0, at), stack: text };
}
