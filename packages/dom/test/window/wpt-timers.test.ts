/**
 * Timers — web-platform-tests html/webappapis/timers, run unmodified through test/wpt/harness.ts.
 *
 * Spec: HTML Standard §8.6 "Timers" — https://html.spec.whatwg.org/#timers
 *   - setTimeout / setInterval: https://html.spec.whatwg.org/#dom-settimeout
 *   - Timer initialization steps: https://html.spec.whatwg.org/#timer-initialisation-steps
 * Original tests: https://github.com/web-platform-tests/wpt/tree/master/html/webappapis/timers
 *
 * window.setTimeout & co. are the host's (Node's, or the fake clock's) timers, looked up at call
 * time so Vitest/Jest fake timers control them (docs/deviations.md). Known gaps that follow
 * from that design: handles are Node Timeout objects, not integers; string callbacks are not
 * compiled (no script execution: errors, evil-spec-example); exceptions thrown by callbacks
 * reach the host as uncaught exceptions instead of window `error` events (errors,
 * *-cross-realm-callback-report-exception). clearinterval-from-callback passes but takes 1.25 s;
 * timer-nesting-not-inherited-in-microtask passes but asserts a < 4 ms delay (flaky under load).
 */
import { describe } from "vitest";
import { defineWPT } from "../wpt/harness.ts";

const T = "html/webappapis/timers";

describe("Timers — https://html.spec.whatwg.org/#timers", () => {
  defineWPT(`${T}/arguments.html`);
  for (const name of [
    "cleartimeout-clearinterval",
    "missing-timeout-setinterval",
    "negative-setinterval",
    "negative-settimeout",
    "setinterval-settimeout-clamping",
    "type-long-setinterval",
    "type-long-settimeout",
  ]) {
    defineWPT(`${T}/${name}.any.js`);
  }
  defineWPT(`${T}/settimeout-setinterval-handles.html`, "handles are the host's Timeout objects so fake timers keep working (deviation)");
});
