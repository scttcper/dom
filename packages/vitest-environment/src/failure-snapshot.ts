// Vitest setup file for agent debug mode's failure snapshots (docs/agent-debugging.md), published as
// `@ctrl/dom/vitest-environment/failure-snapshot`. The ctrlDom() plugin adds it when `debug` (or
// CTRL_DOM_DEBUG) is set; with the bare environment:
//
//   test: { setupFiles: ["@ctrl/dom/vitest-environment/failure-snapshot"] }
//
// With CTRL_DOM_DEBUG set, every failing test's first error gets one budgeted aria snapshot of
// `document.body` appended, plus what changed since the last snapshot the test took. Unset, this
// file registers nothing.
//
// The snapshot has to be taken before Testing Library's cleanup unmounts the tree. Vitest runs
// `onTestFailed` callbacks after the afterEach hooks, and afterEach hooks in reverse registration
// order, so Testing Library's auto-cleanup (registered by the test file, after this file) runs
// before any hook registered here. So the snapshot is taken by the first afterEach hook to run
// after a failure: hooks registered through the global `afterEach` (Testing Library's
// auto-cleanup, with `globals: true`) are wrapped to take it first, the plain afterEach below covers
// cleanup registered by earlier setup files, and `onTestFailed` falls back to the DOM as it is.

import { afterEach, beforeEach } from "vitest";
import {
  appendToErrorMessage,
  captureFailureSnapshot,
  envDebugFormat,
  formatFailureSnapshot,
  resetFailureSnapshot,
  type FailureSnapshot,
} from "@ctrl/dom/testing-library/agent";

declare const document: unknown;

if (envDebugFormat() !== null) installFailureSnapshots();

function currentDocument(): any {
  return typeof document === "undefined" ? undefined : document;
}

function installFailureSnapshots(): void {
  let state: { result?: { state?: string } } | null = null;
  let captured: FailureSnapshot | null = null;

  const capture = (): void => {
    if (captured === null && state?.result?.state === "fail") captured = captureFailureSnapshot(currentDocument());
  };

  beforeEach((context) => {
    state = context.task;
    captured = null;
    resetFailureSnapshot(currentDocument());
    context.onTestFailed(() => {
      capture();
      const snapshot = captured;
      captured = null;
      state = null;
      const error = context.task.result?.errors?.[0];
      if (snapshot === null || error === undefined) return;
      appendToErrorMessage(
        error,
        formatFailureSnapshot(snapshot, typeof error.message === "string" ? error.message : ""),
      );
    });
  });

  afterEach(capture);

  // Hooks registered through the global afterEach (`globals: true`) from now on take the snapshot
  // before they run. Only argument-less callbacks are wrapped: Vitest reads a hook's first
  // parameter to set up fixtures, which a wrapper would hide.
  const global = globalThis as { afterEach?: (fn: unknown, timeout?: number) => unknown };
  const original = global.afterEach;
  if (typeof original === "function") {
    global.afterEach = function afterEach(this: unknown, fn: unknown, timeout?: number): unknown {
      if (typeof fn !== "function" || fn.length !== 0) return original.call(this, fn, timeout);
      const hook = fn as (this: unknown, ...args: unknown[]) => unknown;
      // No declared parameters (not even `...args`, which Vitest rejects in fixture-aware hooks).
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
}
