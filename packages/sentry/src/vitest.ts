// Vitest reporter: one trace per test file, an issue per failing test, an issue per flaky test
// (report.ts). The ctrlDom() plugin registers it, with the setup file that collects each test's
// spans and failure snapshot in the worker (vitest-setup.ts), when its `sentry` option is on:
//
//   plugins: [ctrlDom({ sentry: true })]   // SENTRY_DSN and/or SENTRY_SPOTLIGHT

import type { Reporter, TestCase, TestModule, Vitest } from "vitest/node";
import type { UserConsoleLog } from "vitest";
import { sendEnvelope } from "./envelope.ts";
import { resolveOptions, type CtrlDomSentryOptions, type ResolvedOptions } from "./options.ts";
import { buildReport, type ConsoleEntry, type ErrorInfo, type TestCaseReport } from "./report.ts";
import { Delivery } from "./delivery.ts";

export type { CtrlDomSentryOptions } from "./options.ts";

export class SentryReporter implements Reporter {
  readonly options: ResolvedOptions | null;
  #root = process.cwd();
  #vitest: Vitest | null = null;
  #delivery: Delivery | null;
  /** Each test's console output, by task id, until its file is reported. */
  #console = new Map<string, ConsoleEntry[]>();

  constructor(options: CtrlDomSentryOptions = {}) {
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

export default SentryReporter;

function toTestCaseReport(test: TestCase): TestCaseReport {
  const result = test.result();
  const diagnostic = test.diagnostic();
  return {
    name: test.fullName,
    state: result.state === "passed" ? "pass" : result.state === "failed" ? "fail" : "skip",
    startedAt: (diagnostic?.startTime ?? Date.now()) / 1000,
    duration: diagnostic?.duration ?? 0,
    retries: diagnostic?.retryCount ?? 0,
    flaky: diagnostic?.flaky ?? false,
    errors: (result.errors ?? []).map(toErrorInfo),
    collected: test.meta().ctrlDomSentry ?? null,
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
