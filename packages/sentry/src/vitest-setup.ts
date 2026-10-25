// Vitest setup file the ctrlDom() plugin adds with its `sentry` option: collects each test's spans
// (collector.ts) and, when a test fails, the page before Testing Library's cleanup unmounts it,
// and leaves them on the test's meta, where the reporter (vitest.ts) reads them in the main
// process.
//
// Capturing before cleanup works as in vitest-environment's failure-snapshot.ts: Vitest runs
// afterEach hooks in reverse registration order and `onTestFailed` after all of them, so Testing
// Library's auto-cleanup (registered by the test file, after this file) would run first. Hooks
// registered through the global afterEach are wrapped to capture before they run; the plain
// afterEach below covers cleanup registered by earlier setup files; onTestFailed is the fallback.

import { afterAll, afterEach, beforeEach } from "vitest";
import { startCollecting, type CollectedTest } from "./collector.ts";

declare const document: unknown;

declare module "vitest" {
  interface TaskMeta {
    /** What @ctrl/dom/sentry collected for the test (the last attempt's spans, every attempt's failures). */
    ctrlDomSentry?: CollectedTest;
  }
}

// Stacks long enough to reach the test's own frame: Testing Library's query wrappers and the
// tracing channel's frames can use up V8's default of 10 first (the Jest environment sets 100).
if (Error.stackTraceLimit < 50) Error.stackTraceLimit = 50;

const collector = startCollecting();
afterAll(() => collector.stop());

let task: { result?: { state?: string; errors?: unknown[] } } | null = null;
let captured = false;

const capture = (): void => {
  if (captured || task?.result?.state !== "fail") return;
  captured = true;
  collector.captureFailure(typeof document === "undefined" ? undefined : document, task.result.errors?.[0]);
};

beforeEach((context) => {
  task = context.task;
  captured = false;
  collector.beginTest(context.task.meta.ctrlDomSentry);
  context.onTestFailed(capture);
  context.onTestFinished(() => {
    const collected = collector.endTest();
    if (collected !== null) context.task.meta.ctrlDomSentry = collected;
    task = null;
  });
});

afterEach(capture);

// Only argument-less callbacks are wrapped: Vitest reads a hook's first parameter to set up
// fixtures, which a wrapper would hide.
const global = globalThis as { afterEach?: (fn: unknown, timeout?: number) => unknown };
const original = global.afterEach;
if (typeof original === "function") {
  global.afterEach = function afterEach(this: unknown, fn: unknown, timeout?: number): unknown {
    if (typeof fn !== "function" || fn.length !== 0) return original.call(this, fn, timeout);
    const hook = fn as (this: unknown, ...args: unknown[]) => unknown;
    return original.call(
      this,
      function (this: unknown) {
        capture();
        return hook.apply(this, arguments as unknown as unknown[]);
      },
      timeout,
    );
  };
}
