/**
 * Downstream repro (Base UI SelectRoot "typeahead" closed-trigger tests: 5-6 failures in
 * ctrl-dom-full, order/timing dependent; they pass with stock user-event on the same stack).
 *
 * Upstream user-event awaits `setTimeout(resolve, delay)` (delay 0) at the end of every API
 * call, so a `setTimeout(cb, 0)` scheduled by a handler during the action has run when
 * `await user.keyboard()` resolves. Base UI relies on this: its test setup turns
 * requestAnimationFrame into `setTimeout(cb, 0)` under jsdom-like user agents.
 *
 * @ctrl/dom/user-event's `yieldBetweenActions()` (utils/misc/wait.ts, docs/deviations.md
 * "user-event `delay: 0`") only waits for a timeout when the process-wide number of active
 * Timeout resources grew during the action; otherwise it yields with setImmediate. If the
 * handler schedules one timer and clears another (debounce/restart patterns, useTimeout
 * restarts, a previous test's timer), the count is unchanged, the 0 ms callback has not run yet
 * and the assertion after `await user.keyboard()` sees stale state.
 *
 * Owner: user-event. Both cases run on @ctrl/dom; the oracle is stock user-event 14.6.8.
 */
import { afterEach, describe, expect, test } from "vitest";
import { createWindow, installGlobals } from "../../../packages/dom/src/index.ts";
import { requireFromReact } from "./engines.ts";

const implementations = {
  stock: () => (requireFromReact("@testing-library/user-event") as { default: any }).default,
  "ctrl-dom": async () => (await import("../../../packages/user-event/src/index.ts")).default as any,
};

let uninstall: (() => void) | null = null;
afterEach(() => {
  uninstall?.();
  uninstall = null;
});

describe.each(Object.keys(implementations) as Array<keyof typeof implementations>)("user-event %s on @ctrl/dom", (impl) => {
  test("a setTimeout(cb, 0) scheduled during keyboard() has run when the call resolves, even if the handler also cleared a timer", async () => {
    const window = createWindow({ url: "http://localhost/" });
    uninstall = installGlobals(window, globalThis as never);
    const userEvent = await implementations[impl]();
    const button = document.createElement("button");
    document.body.append(button);
    let pending: ReturnType<typeof setTimeout> | undefined;
    let committed = "";
    button.addEventListener("keydown", (event: any) => {
      clearTimeout(pending); // restart a timer: clear one ...
      setTimeout(() => (committed = event.key), 0); // ... and schedule the "rAF" commit
    });
    button.focus();
    const user = userEvent.setup();
    // Timing dependent (the 1 ms timer races setImmediate), so sample it.
    let stale = 0;
    for (let i = 0; i < 50; i++) {
      committed = "";
      pending = setTimeout(() => {}, 10_000); // e.g. a typeahead reset timer
      await user.keyboard("a");
      if (committed !== "a") stale++;
    }
    clearTimeout(pending);
    expect(stale).toBe(0);
  });
});
