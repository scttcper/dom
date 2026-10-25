// Vitest: one trace per test file, an issue per failing test, an issue per flaky test (report.ts).
//
//   // vitest.config.ts
//   import { sentryTests } from "@ctrl/sentry-tests/vitest";
//   export default defineConfig({ plugins: [sentryTests()] });   // SENTRY_DSN and/or SENTRY_SPOTLIGHT
//
// With somewhere to send, the plugin makes the project's runner the one that records each file's
// spans in the worker (vitest-runner.ts) and adds the reporter, which builds and sends the events
// in the main process as each file finishes. With nowhere to send, it changes nothing.

import { fileURLToPath } from "node:url";
import type { Reporter, TestCase, TestModule, Vitest } from "vitest/node";
import type { Plugin } from "vitest/config";
import type { UserConsoleLog } from "vitest";
import { sendEnvelope } from "./envelope.ts";
import { resolveOptions, type SentryTestsOptions, type ResolvedOptions } from "./options.ts";
import { buildReport, type ConsoleEntry, type ErrorInfo, type TestCaseReport } from "./report.ts";
import { Delivery } from "./delivery.ts";
// TaskMeta.sentryTests
import type {} from "./vitest-runner.ts";

export type { SentryTestsOptions } from "./options.ts";

// Next to this module: src/*.ts in the workspace, dist/*.js published.
const RUNNER = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "./vitest-runner.ts" : "./vitest-runner.js", import.meta.url));
/** Vitest instances the reporter was added to (configureVitest runs once per project). */
const registered = new WeakSet<Vitest>();

/** The Vitest plugin: spans from the runner, events from the reporter, when there is somewhere to send them. */
export function sentryTests(options: SentryTestsOptions = {}): Plugin {
  const resolved = resolveOptions(options);
  return {
    name: "@ctrl/sentry-tests",
    config(config) {
      if (resolved === null) return;
      const own = (config as { test?: { runner?: string } }).test?.runner;
      if (own !== undefined && own !== RUNNER) {
        console.warn(`@ctrl/sentry-tests: the project has its own runner (${own}), so tests are reported without describe, hook and test function spans. Build it with withSentry() from "@ctrl/sentry-tests/vitest-runner" to get them.`);
        return;
      }
      return { test: { runner: RUNNER } };
    },
    // Vitest builds its reporters after this hook, so this one can still join them.
    configureVitest({ vitest }) {
      if (resolved === null || registered.has(vitest)) return;
      registered.add(vitest);
      vitest.config.reporters.push(new SentryReporter(options) as never);
    },
  };
}


/**
 * The reporter alone, which the plugin adds: also `reporters: ["default", "@ctrl/sentry-tests/vitest"]`
 * (each test is then one span, without the runner's).
 */
export class SentryReporter implements Reporter {
  readonly options: ResolvedOptions | null;
  #root = process.cwd();
  #vitest: Vitest | null = null;
  #delivery: Delivery | null;
  /** Each test's console output, by task id, until its file is reported. */
  #console = new Map<string, ConsoleEntry[]>();

  constructor(options: SentryTestsOptions = {}) {
    this.options = resolveOptions(options);
    this.#delivery = this.options === null ? null : new Delivery(this.options, sendEnvelope);
  }

  onInit(vitest: Vitest): void {
    this.#vitest = vitest;
    this.#root = vitest.config.root;
  }

  onUserConsoleLog(log: UserConsoleLog): void {
    if (this.options === null || log.taskId === undefined) return;
    const entries = this.#console.get(log.taskId) ?? [];
    entries.push({ timestamp: log.time / 1000, stream: log.type, message: log.content.trimEnd() });
    this.#console.set(log.taskId, entries);
  }

  onTestModuleEnd(module: TestModule): void {
    if (this.options === null || this.#delivery === null) return;
    const tests = [...module.children.allTests()].map((test) => {
      const report = toTestCaseReport(test);
      const output = this.#console.get(test.id);
      if (output !== undefined) {
        report.console = output;
        this.#console.delete(test.id);
      }
      return report;
    });
    const project = module.project.name;
    this.#delivery.add(
      buildReport(
        {
          runner: "vitest",
          root: this.#root,
          file: module.moduleId,
          ...(project ? { project } : {}),
          tests,
          collected: module.meta().sentryTests ?? null,
          environmentSetupMs: module.diagnostic().environmentSetupDuration,
          fileErrors: module.errors().map(toErrorInfo),
        },
        this.options,
      ),
    );
  }

  async onTestRunEnd(): Promise<void> {
    if (this.#delivery === null) return;
    const summary = await this.#delivery.flush();
    if (summary !== null) (this.#vitest?.logger ?? console).log(summary);
  }
}

function toTestCaseReport(test: TestCase): TestCaseReport {
  const result = test.result();
  const diagnostic = test.diagnostic();
  return {
    key: test.id,
    name: test.fullName,
    state: result.state === "passed" ? "pass" : result.state === "failed" ? "fail" : "skip",
    startedAt: (diagnostic?.startTime ?? Date.now()) / 1000,
    duration: diagnostic?.duration ?? 0,
    retries: diagnostic?.retryCount ?? 0,
    flaky: diagnostic?.flaky ?? false,
    errors: (result.errors ?? []).map(toErrorInfo),
  };
}

/** Vitest's serialized errors carry source-mapped frames (`stacks`). */
function toErrorInfo(e: { name?: string; message: string; stack?: string; stacks?: ReadonlyArray<{ method: string; file: string; line: number; column: number }> }): ErrorInfo {
  return {
    name: e.name,
    message: e.message,
    stack: e.stack,
    ...(e.stacks ? { frames: e.stacks.map((s) => ({ method: s.method, file: s.file, line: s.line, column: s.column })) } : {}),
  };
}

export default SentryReporter;
