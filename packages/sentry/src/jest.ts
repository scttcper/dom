// Jest reporter: one trace per test file, an issue per failing test, an issue per flaky test
// (report.ts).
//
//   reporters: ["default", "@ctrl/dom/sentry/jest"]   // SENTRY_DSN and/or SENTRY_SPOTLIGHT
//   reporters: ["default", ["@ctrl/dom/sentry/jest", { dsn, spotlight: true }]]
//
// With somewhere to send, it sets CTRL_DOM_SENTRY_DIR before Jest starts its workers, and
// @ctrl/dom-jest-environment then collects each test's spans and failure snapshot there
// (jest-collector.ts); the reporter reads them as each file's results arrive.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sendEnvelope } from "./envelope.ts";
import { Delivery } from "./delivery.ts";
import { jestDataFile, type JestFileData } from "./jest-collector.ts";
import { resolveOptions, type CtrlDomSentryOptions, type ResolvedOptions } from "./options.ts";
import { buildReport, type ErrorInfo, type TestCaseReport } from "./report.ts";

export type { CtrlDomSentryOptions } from "./options.ts";

/** The fields of Jest's reporter arguments this reads (@jest/test-result, @jest/reporters). */
interface JestAssertionResult {
  ancestorTitles: string[];
  title: string;
  status: string;
  duration?: number | null;
  startAt?: number | null;
  invocations?: number;
  failureMessages: string[];
  failureDetails: unknown[];
}
interface JestTestResult {
  testFilePath: string;
  testResults: JestAssertionResult[];
  perfStats: { start: number; end: number };
  /** Set when the file could not run (it failed to load). */
  testExecError?: { message: string; stack?: string | null } | null;
}
interface JestTest {
  path: string;
  context?: { config?: { rootDir?: string; displayName?: { name: string } | string } };
}

export default class CtrlDomSentryReporter {
  readonly options: ResolvedOptions | null;
  #rootDir: string;
  #dir: string | null = null;
  #delivery: Delivery | null = null;

  constructor(globalConfig: { rootDir?: string } = {}, reporterOptions: CtrlDomSentryOptions = {}) {
    this.#rootDir = globalConfig.rootDir ?? process.cwd();
    this.options = resolveOptions(reporterOptions);
    if (this.options === null) return;
    this.#delivery = new Delivery(this.options, sendEnvelope);
    // Inherited by the workers Jest starts after constructing its reporters. Kept until the
    // process exits: in watch mode every run writes there.
    const dir = mkdtempSync(join(tmpdir(), "ctrl-dom-sentry-"));
    this.#dir = dir;
    process.env.CTRL_DOM_SENTRY_DIR = dir;
    process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  }

  onTestResult(test: JestTest, testResult: JestTestResult): void {
    if (this.options === null || this.#delivery === null) return;
    const collected = this.#readCollected(test.path);
    const tests = testResult.testResults.map((a): TestCaseReport => {
      const name = [...a.ancestorTitles, a.title].join(" > ");
      const invocations = a.invocations ?? 1;
      const state = a.status === "passed" ? "pass" : a.status === "failed" ? "fail" : "skip";
      return {
        name,
        state,
        startedAt: (a.startAt ?? testResult.perfStats.start) / 1000,
        duration: a.duration ?? 0,
        retries: invocations - 1,
        flaky: state === "pass" && invocations > 1,
        errors: state === "fail" ? [jestError(a)] : [],
        collected: collected?.tests[name] ?? null,
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
          ...(execError ? { fileErrors: [{ message: execError.message, stack: execError.stack ?? undefined }] } : {}),
        },
        this.options,
      ),
    );
  }

  async onRunComplete(): Promise<void> {
    if (this.#delivery === null) return;
    const summary = await this.#delivery.flush();
    if (summary !== null) process.stderr.write(`${summary}\n`);
  }

  getLastError(): Error | undefined {
    return undefined;
  }

  /** The environment's data for a file, removed once read (a watch-mode rerun writes it again). */
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
