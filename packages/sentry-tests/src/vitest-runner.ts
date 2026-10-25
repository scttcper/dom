// Vitest's test runner, recording each test file as spans. Vitest calls its runner's
// `trace(name, attributes, fn)` around every phase of a file (@vitest/runner's run.ts:
// "collect_spec", "run.suite", "run.test", "test.beforeEach", "test.callback", "test.afterEach",
// "suite.beforeAll", ...), so wrapping it puts each describe block, test, hook and test function in a
// span (collector.ts), with the spans libraries publish nested inside them. The file's spans and
// failures reach the main process on the file task's meta (vitest.ts reads them).
//
// The sentryTests() plugin makes this the project's `runner`. A project with a runner of its own
// builds it on withSentry():
//
//   export default withSentry(MyRunner);

import { relative } from "node:path";
import { TestRunner, type RunnerTask, type RunnerTestCase, type RunnerTestFile, type RunnerTestSuite, type TestTryOptions, type VitestTestRunner } from "vitest";
import { createCollector, realNow, type CollectedFile, type CollectedSpan, type Collector, type OpenSpan } from "./collector.ts";

declare module "vitest" {
  interface TaskMeta {
    /** The file's spans and failures, on the file task (@ctrl/sentry-tests). */
    sentryTests?: CollectedFile;
  }
}

// Stacks long enough to reach the test's own frame through library wrappers (V8's default is 10).
if (Error.stackTraceLimit < 50) Error.stackTraceLimit = 50;

type Trace = <T>(name: string, attributes: Record<string, unknown> | (() => T), cb?: () => T) => T;
type RunnerClass = new (...args: any[]) => TestRunner;
type HookName = "beforeEach" | "afterEach" | "beforeAll" | "afterAll";

/** Vitest's hook phases: the span's description, and which hooks to look for (none for cleanups). */
const HOOK_PHASES: Record<string, [description: string, hooks: HookName | null]> = {
  "test.beforeEach": ["beforeEach", "beforeEach"],
  "test.afterEach": ["afterEach", "afterEach"],
  "test.cleanup": ["beforeEach cleanup", null],
  "suite.beforeAll": ["beforeAll", "beforeAll"],
  "suite.afterAll": ["afterAll", "afterAll"],
  "suite.cleanup": ["beforeAll cleanup", null],
};

/** A cleanup phase this short ran no cleanups (seconds). */
const EMPTY_PHASE_S = 0.0001;

/** `Base` (Vitest's TestRunner or a subclass of it), recording spans. */
export function withSentry<T extends RunnerClass>(Base: T): T {
  const getHooks = ((Base as unknown as typeof TestRunner).getSuiteHooks ?? TestRunner.getSuiteHooks) as (suite: RunnerTestSuite) => Record<HookName, unknown[]>;
  const base = Base.prototype as VitestTestRunner;

  return class SentryTestRunner extends Base {
    #collector: Collector = createCollector();
    #tasks = new Map<string, RunnerTask>();
    #files = new Map<string, RunnerTestFile>();
    /** Each file's collect span: files are collected before any of them runs. */
    #collected = new Map<string, CollectedSpan>();
    #testTasks = new WeakMap<OpenSpan, RunnerTestCase>();
    #suiteTasks = new WeakMap<OpenSpan, RunnerTestSuite>();
    #retry = 0;

    constructor(...args: any[]) {
      super(...args);
      const base = this.trace as Trace;
      this.trace = ((name: string, attributes: Record<string, unknown> | (() => unknown), cb?: () => unknown) => this.#trace(base, name, attributes, cb)) as Trace;
    }

    onCollected(files: RunnerTestFile[]): unknown {
      for (const file of files) {
        this.#files.set(file.filepath, file);
        index(file, this.#tasks);
      }
      return base.onCollected?.call(this, files);
    }

    onBeforeTryTask(test: RunnerTask, options: TestTryOptions): void {
      this.#retry = options.retry;
      return super.onBeforeTryTask(test, options);
    }

    // Vitest calls this after the test function (or a beforeEach hook) failed and before the
    // afterEach hooks, where Testing Library's cleanup empties the page.
    async onTaskFinished(test: RunnerTestCase): Promise<void> {
      if (test.result?.state === "fail") {
        await this.#collector.captureFailure(this.#collector.test(test.id), fullName(test), test.result.errors?.at(-1), (globalThis as { document?: unknown }).document);
      }
      await base.onTaskFinished?.call(this, test);
    }

    async onAfterRunSuite(suite: RunnerTestSuite): Promise<void> {
      if ((suite as RunnerTestFile).filepath !== undefined && suite.file === suite) {
        const collected = this.#collector.finish();
        const collect = this.#collected.get((suite as RunnerTestFile).filepath);
        if (collect !== undefined) collected.spans.push(collect);
        suite.meta.sentryTests = collected;
      }
      return super.onAfterRunSuite(suite);
    }

    #trace(base: Trace, name: string, attributes: Record<string, unknown> | (() => unknown), cb?: () => unknown): unknown {
      const call = () => base(name, attributes as never, cb as never);
      const attrs = typeof attributes === "function" ? {} : attributes;
      const c = this.#collector;
      if (name === "collect_spec") {
        const path = String(attrs["code.file.path"]);
        const span = c.open("test.collect", `collect ${relative(this.config.root, path)}`);
        return settle(c, span, () => c.run(span, call), () => false, (s) => this.#collected.set(path, s.span));
      }
      if (name === "run.suite" || name === "run.test") {
        const task = this.#tasks.get(String(attrs[name === "run.suite" ? "vitest.suite.id" : "vitest.test.id"]));
        // Skipped and todo tests (and describe blocks) pass through here too, without running.
        if (task === undefined || task.mode === "skip" || task.mode === "todo") return call();
        const line = attrs["code.line.number"];
        const data: Record<string, number> = typeof line === "number" ? { "code.lineno": line } : {};
        if (name === "run.suite") {
          const span = c.open("test.suite", fullName(task), data);
          this.#suiteTasks.set(span, task as RunnerTestSuite);
          return settle(c, span, () => c.run(span, call), () => task.result?.state === "fail");
        }
        const test = c.test(task.id);
        const span = c.open("test.case", fullName(task), data, test);
        test.spanIds.push(span.span.span_id);
        this.#testTasks.set(span, task as RunnerTestCase);
        return settle(c, span, () => c.run(span, call), () => task.result?.state === "fail");
      }
      if (name === "test.callback") {
        const task = this.#testTasks.get(c.current()!);
        const span = c.open("test.fn", task?.name ?? "test", this.#retry > 0 ? { "test.retry": this.#retry } : {});
        return settle(c, span, () => c.run(span, call), () => false);
      }
      const phase = HOOK_PHASES[name];
      if (phase === undefined) return call();
      const [description, hooks] = phase;
      // Vitest enters every hook phase, hooks or not: only phases with hooks get a span.
      const count = hooks === null ? 0 : this.#hookCount(c.current(), hooks);
      if (hooks !== null && count === 0) return call();
      const data: Record<string, number> = hooks !== null ? { hooks: count } : {};
      if (this.#retry > 0 && name.startsWith("test.")) data["test.retry"] = this.#retry;
      const span = c.open("test.hook", description, data);
      // Vitest enters a cleanup phase whenever its hooks ran, cleanups or not: an empty one is dropped.
      const keep = hooks === null ? (s: OpenSpan) => (s.span.status !== "ok" || s.span.timestamp - s.span.start_timestamp >= EMPTY_PHASE_S) && c.close(s) : undefined;
      return settle(c, span, () => c.run(span, call), () => false, keep);
    }

    /** How many `hooks` the phase about to start runs: a test's run its suites' too. */
    #hookCount(current: OpenSpan | null, hooks: HookName): number {
      if (hooks === "beforeEach" || hooks === "afterEach") {
        let count = 0;
        const test = current === null ? undefined : this.#testTasks.get(current);
        for (let suite: RunnerTestSuite | undefined = test?.suite ?? test?.file; suite !== undefined; suite = suite.suite) count += getHooks(suite)[hooks]?.length ?? 0;
        return test === undefined ? 1 : count;
      }
      const suite = current === null ? [...this.#files.values()].find((f) => f.result?.state === "run") : this.#suiteTasks.get(current);
      return suite === undefined ? 1 : (getHooks(suite)[hooks]?.length ?? 0);
    }
  };
}

/** Close `span` when `run` returns or settles; failed when it throws or `failed()` says so. */
function settle<R>(c: Collector, span: OpenSpan, run: () => R, failed: () => boolean, keep?: (span: OpenSpan) => unknown): R {
  const end = (error: boolean) => {
    if (keep === undefined) return c.close(span, error);
    span.span.timestamp = realNow();
    if (error) span.span.status = "internal_error";
    keep(span);
  };
  let result: R;
  try {
    result = run();
  } catch (error) {
    end(true);
    throw error;
  }
  if (result instanceof Promise) {
    return result.then(
      (value) => {
        end(failed());
        return value;
      },
      (error) => {
        end(true);
        throw error;
      },
    ) as R;
  }
  end(failed());
  return result;
}

function index(suite: RunnerTestSuite, tasks: Map<string, RunnerTask>): void {
  for (const task of suite.tasks) {
    tasks.set(task.id, task);
    if (task.type === "suite") index(task, tasks);
  }
}

/** Describe blocks and the task, joined with " > " (TestCase.fullName in Vitest's reporter API). */
function fullName(task: RunnerTask): string {
  const names = [task.name];
  for (let suite = task.suite; suite !== undefined && suite !== task.file; suite = suite.suite) names.unshift(suite.name);
  return names.join(" > ");
}

export default withSentry(TestRunner);
