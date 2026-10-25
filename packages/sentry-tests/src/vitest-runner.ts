// Vitest's test runner, recording each test file as spans. Vitest calls its runner's
// `trace(name, attributes, fn)` around every phase of a file (@vitest/runner's run.ts:
// "collect_spec", "run.spec", "run.suite", "run.test", "test.beforeEach", "test.callback", ...), so
// wrapping it puts each describe block, test, hook and test function in a span (collector.ts),
// with the spans libraries publish nested inside them. The file's spans and failures reach the
// main process on the file task's meta (vitest.ts reads them).
//
// The sentryTests() plugin makes this the project's `runner`. A project with a runner of its own
// builds it on withSentry():
//
//   export default withSentry(MyRunner);

import { relative } from "node:path";
import { TestRunner, type RunnerTask, type RunnerTestCase, type RunnerTestFile, type RunnerTestSuite, type TestTryOptions, type VitestTestRunner } from "vitest";
import { createCollector, realNow, type CollectedFile, type CollectedSpan, type OpenSpan } from "./collector.ts";

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
type Hooks = Record<"beforeEach" | "afterEach" | "beforeAll" | "afterAll", unknown[]>;

/**
 * The hook phases that get a span when they run hooks. Vitest also enters "test.cleanup" and
 * "suite.cleanup" whenever hooks ran, whether or not one returned a cleanup, so those get none.
 */
const HOOK_PHASES: Record<string, keyof Hooks> = {
  "test.beforeEach": "beforeEach",
  "test.afterEach": "afterEach",
  "suite.beforeAll": "beforeAll",
  "suite.afterAll": "afterAll",
};

/** `Base` (Vitest's TestRunner or a subclass of it), recording spans. */
export function withSentry<T extends RunnerClass>(Base: T): T {
  const getHooks = (Base as unknown as typeof TestRunner).getSuiteHooks as (suite: RunnerTestSuite) => Hooks;
  const base = Base.prototype as VitestTestRunner;

  return class SentryTestRunner extends Base {
    #collector = createCollector();
    #files = new Map<string, RunnerTestFile>();
    #tasks = new Map<string, RunnerTask>();
    /** The task behind each describe block's and test's span. */
    #taskOf = new WeakMap<OpenSpan, RunnerTask>();
    /** Each file's collect span: a batch of files is collected before any of them runs. */
    #collected = new Map<string, CollectedSpan>();
    #file: RunnerTestFile | undefined;
    #retry = 0;

    constructor(...args: any[]) {
      super(...args);
      const trace = this.trace as Trace;
      this.trace = ((name: string, attributes: Record<string, unknown> | (() => unknown), cb?: () => unknown) => this.#trace(trace, name, attributes, cb)) as Trace;
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
      if (suite === this.#file) {
        const collected = this.#collector.finish();
        const collect = this.#collected.get(this.#file.filepath);
        if (collect !== undefined) collected.spans.push(collect);
        suite.meta.sentryTests = collected;
      }
      return super.onAfterRunSuite(suite);
    }

    #trace(trace: Trace, name: string, attributes: Record<string, unknown> | (() => unknown), cb?: () => unknown): unknown {
      const call = () => trace(name, attributes as never, cb as never);
      const attrs = typeof attributes === "function" ? {} : attributes;
      const c = this.#collector;
      switch (name) {
        case "collect_spec": {
          const path = String(attrs["code.file.path"]);
          const span = c.open("test.collect", `collect ${relative(this.config.root, path)}`);
          return this.#settle(span, call, () => false, () => this.#collected.set(path, span.span));
        }
        case "run.spec":
          this.#file = this.#files.get(String(attrs["code.file.path"]));
          return call();
        case "run.suite":
        case "run.test": {
          const task = this.#tasks.get(String(attrs[name === "run.suite" ? "vitest.suite.id" : "vitest.test.id"]))!;
          // Skipped and todo tests (and describe blocks) pass through here too, without running.
          if (task.mode === "skip" || task.mode === "todo") return call();
          const line = attrs["code.line.number"];
          const data: Record<string, number> = typeof line === "number" ? { "code.lineno": line } : {};
          const test = name === "run.test" ? c.test(task.id) : undefined;
          const span = c.open(name === "run.test" ? "test.case" : "test.suite", fullName(task), data, test);
          test?.spanIds.push(span.span.span_id);
          this.#taskOf.set(span, task);
          return this.#settle(span, call, () => task.result?.state === "fail");
        }
        case "test.callback": {
          const span = c.open("test.fn", this.#taskOf.get(c.current()!)!.name, this.#retry > 0 ? { "test.retry": this.#retry } : {});
          return this.#settle(span, call, () => false);
        }
      }
      const hook = HOOK_PHASES[name];
      if (hook === undefined) return call();
      // Vitest enters every hook phase, hooks or not.
      const hooks = this.#hookCount(hook);
      if (hooks === 0) return call();
      const data: Record<string, number> = { hooks };
      if (this.#retry > 0 && (hook === "beforeEach" || hook === "afterEach")) data["test.retry"] = this.#retry;
      return this.#settle(c.open("test.hook", hook, data), call, () => false);
    }

    /**
     * How many `hook`s the phase about to start runs. A test's beforeEach/afterEach run its describe
     * blocks' and its file's too, walked as Vitest's callSuiteHook does: a top-level test or describe
     * block has no `suite`, only `file`.
     */
    #hookCount(hook: keyof Hooks): number {
      const current = this.#collector.current();
      if (hook === "beforeAll" || hook === "afterAll") {
        const suite = current === null ? this.#file! : (this.#taskOf.get(current) as RunnerTestSuite);
        return getHooks(suite)[hook].length;
      }
      const test = this.#taskOf.get(current!) as RunnerTestCase;
      let count = 0;
      for (let suite: RunnerTestSuite | undefined = test.suite ?? test.file; suite !== undefined; suite = "filepath" in suite ? undefined : (suite.suite ?? suite.file)) count += getHooks(suite)[hook].length;
      return count;
    }

    /** Run `fn` in `span` and end it when `fn` returns or settles; failed when it throws or `failed()` says so. */
    #settle<R>(span: OpenSpan, fn: () => R, failed: () => boolean, keep?: () => void): R {
      const c = this.#collector;
      const end = (error: boolean) => {
        if (keep === undefined) return c.close(span, error);
        span.span.timestamp = realNow();
        if (error) span.span.status = "internal_error";
        keep();
      };
      let result: R;
      try {
        result = c.run(span, fn);
      } catch (error) {
        end(true);
        throw error;
      }
      if (!(result instanceof Promise)) {
        end(failed());
        return result;
      }
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
  };
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
