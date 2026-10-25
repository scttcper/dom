/**
 * Downstream repro (React Aria `all` preset: "Jest worker encountered 4 child process
 * exceptions, exceeding retry limit" on ctrl-dom/ctrl-dom-full, which fails whichever test files the
 * crashed workers had queued; with --workers 1 the run dies with
 * `ReferenceError: window is not defined` at react-dom-client `schedulerEvent = window.event`).
 *
 * Work a test file leaves scheduled (React's scheduler uses the global's `setImmediate`, which
 * jest-environment-node exposes and the window's close() does not cancel) runs after the
 * environment's teardown. @ctrl/dom-jest-environment's teardown calls installGlobals' uninstall, which
 * deletes `window`, `document`, ... from the vm global, so that late code throws a ReferenceError
 * and the uncaught exception kills the worker. Under jest-environment-jsdom the global IS the
 * window, so `window` stays defined after teardown (and late callbacks are harmless).
 *
 * Owner: jest-environment. Proposed fix: in teardown, close the window but keep the
 * self-references (`window`, `self`, `globalThis.document`) defined — the vm context is discarded
 * with the test file anyway — or stop exposing Node's `setImmediate` (jsdom's environment does not).
 */
import { describe, expect, test } from "vitest";
import { environments } from "./engines.ts";

describe.each(["jsdom", "ctrl-dom"] as const)("jest-environment-%s", (engine) => {
  test("`window` is still defined on the test global after teardown (late React work can read window.event)", async () => {
    const env = await environments[engine]();
    if (env === null) return;
    await env.setup();
    const global = env.global;
    await env.teardown();
    expect(typeof global.window).toBe("object");
    expect(() => global.window.event).not.toThrow();
  });
});
