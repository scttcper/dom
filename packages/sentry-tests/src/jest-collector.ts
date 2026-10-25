// The worker side for Jest: turns jest-circus's events into the file's spans (collector.ts), one
// per describe block, test attempt, hook and test function, and captures the page when a test
// function or beforeEach hook fails (`test_fn_failure` and `hook_failure` come before the afterEach
// hooks, so before Testing Library's cleanup). The test runner wrapper (jest-runner.ts) feeds it
// the events and writes the file's data for the reporter (jest.ts) at the end.
//
// jest-circus only reports events, so there is no async context to run a phase in: the open
// structure spans form a stack, and its top is where spans no async context places hang. A run of
// hooks of one kind is one span, as under Vitest: setup files can register a dozen per test.
//
// https://github.com/jestjs/jest/blob/main/packages/jest-circus/src/run.ts

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCollector, realNow, type CollectedFile, type OpenSpan } from "./collector.ts";

/** The fields of jest-circus's events and its describe blocks, tests and hooks this reads. */
interface CircusBlock {
  name: string;
  parent?: CircusBlock;
}
interface CircusTest extends CircusBlock {
  errors: unknown[];
}
interface CircusHook {
  type: string;
  /** Where the hook was registered. */
  asyncError?: { stack?: string };
}
interface CircusEvent {
  name: string;
  describeBlock?: CircusBlock;
  test?: CircusTest;
  hook?: CircusHook;
  error?: unknown;
}

/** Jest's own per-test hook (resetModules, clearMocks, resetMocks): registered by jest-circus itself. */
const isJestsOwn = (hook: CircusHook): boolean => /[\\/]jest-circus[\\/]/.test(hook.asyncError?.stack?.split("\n")[1] ?? "");

export interface JestCollector {
  handleTestEvent(event: CircusEvent): void | Promise<void>;
  /** Stop collecting and write the file's data (the end of the test file). */
  finish(): void;
}

/** What the runner writes per test file. */
export interface JestFileData {
  testPath: string;
  collected: CollectedFile;
}

/** Where a test file's data goes in the reporter's directory. */
export function jestDataFile(dir: string, testPath: string): string {
  return join(dir, `${createHash("sha1").update(testPath).digest("hex")}.json`);
}

/** describe blocks and the test, joined with " > " (the root describe block has no name of its own). */
export function circusTestName(test: CircusBlock): string {
  const names = [test.name];
  for (let block = test.parent; block?.parent !== undefined; block = block.parent) names.unshift(block.name);
  return names.join(" > ");
}

export function createJestCollector(options: { dir: string; testPath: string; getDocument: () => unknown }): JestCollector {
  const collector = createCollector();
  const stack: OpenSpan[] = [];
  const skipped = new WeakSet<CircusHook>();
  const push = (span: OpenSpan) => {
    stack.push(span);
    collector.enter(span);
  };
  const pop = (failed = false) => {
    const span = stack.pop();
    if (span !== undefined) collector.close(span, failed);
    collector.enter(stack.at(-1) ?? null);
  };
  /** The hooks running now, all of one kind: their span ends with the last of them. */
  let phase: { type: string; open: OpenSpan; hooks: number; failed: boolean; end: number } | null = null;
  const endPhase = () => {
    if (phase === null) return;
    const { open, hooks, failed, end } = phase;
    phase = null;
    open.span.data.hooks = hooks;
    pop(failed);
    if (end > 0) open.span.timestamp = end;
  };
  return {
    async handleTestEvent(event) {
      if (!event.name.startsWith("hook_")) endPhase();
      switch (event.name) {
        // From the environment's globals to the test file's import: setupFilesAfterEnv and the file.
        case "setup":
          push(collector.open("test.collect", "collect"));
          break;
        case "run_start":
          pop();
          break;
        case "run_describe_start":
          if (event.describeBlock?.parent !== undefined) push(collector.open("test.suite", circusTestName(event.describeBlock)));
          break;
        case "run_describe_finish":
          if (event.describeBlock?.parent !== undefined) pop();
          break;
        case "test_start": {
          const name = circusTestName(event.test!);
          const test = collector.test(name);
          const span = collector.open("test.case", name, test.spanIds.length > 0 ? { "test.retry": test.spanIds.length } : {}, test);
          test.spanIds.push(span.span.span_id);
          push(span);
          break;
        }
        case "test_done":
          pop(event.test!.errors.length > 0);
          break;
        case "hook_start": {
          const hook = event.hook!;
          if (isJestsOwn(hook)) {
            skipped.add(hook);
            break;
          }
          if (phase?.type !== hook.type) {
            endPhase();
            phase = { type: hook.type, open: collector.open("test.hook", hook.type), hooks: 0, failed: false, end: 0 };
            push(phase.open);
          }
          phase.hooks++;
          break;
        }
        case "hook_success":
          if (phase !== null && !skipped.has(event.hook!)) phase.end = realNow();
          break;
        case "hook_failure":
          if (phase !== null && !skipped.has(event.hook!)) {
            phase.failed = true;
            phase.end = realNow();
          }
          if (event.test !== undefined && event.hook?.type === "beforeEach") await capture(event.test, event.error);
          break;
        case "test_fn_start":
          push(collector.open("test.fn", event.test!.name));
          break;
        case "test_fn_success":
          pop();
          break;
        case "test_fn_failure":
          pop(true);
          await capture(event.test!, event.error);
          break;
      }
    },
    finish() {
      const collected = collector.finish();
      collector.stop();
      const data: JestFileData = { testPath: options.testPath, collected };
      // Reporting must never fail a test file: without the data, the reporter sends the results alone.
      try {
        mkdirSync(options.dir, { recursive: true });
        writeFileSync(jestDataFile(options.dir, options.testPath), JSON.stringify(data));
      } catch {}
    },
  };

  function capture(test: CircusTest, error: unknown): Promise<void> {
    const name = circusTestName(test);
    return collector.captureFailure(collector.test(name), name, error, options.getDocument());
  }
}
