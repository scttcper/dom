/**
 * Downstream repro (React Aria: ~20 smoke failures, e.g. RAC Menu "Expected the
 * document.activeElement after closing the menu to be the menu trigger but got
 * [object HTMLBodyElement]" / "Expected focus to move to somewhere other than the body"; React
 * Aria's FocusScope restores focus in a requestAnimationFrame callback and the tests flush it
 * with `act(() => jest.runAllTimers())`).
 *
 * Window.requestAnimationFrame batches every callback of a frame into ONE host timer
 * (`this._frameTask`, scheduled with the global's current setTimeout so fake timers apply).
 * When that timer is scheduled while Jest fake timers are installed and the fake clock is then
 * uninstalled (jest.useRealTimers(), afterAll/afterEach resets), it never fires, `_frameTask`
 * stays non-null, and every later requestAnimationFrame in that window joins the dead frame:
 * no animation frame callback runs again for the rest of the test file.
 *
 * Under jest-environment-jsdom this cannot happen because jest.useFakeTimers() fakes
 * requestAnimationFrame itself; under jest-environment-rtd it does not, because
 * jest-environment-node constructs its ModernFakeTimers (which snapshot the global's timer
 * functions via @sinonjs/fake-timers withGlobal) before the window is installed.
 *
 * Owners: window (Window.ts requestAnimationFrame/_task: do not let a lost host timer wedge all
 * later frames, e.g. one host timer per frame request or re-arm when the host setTimeout
 * changed) and jest-environment (recreate `fakeTimersModern` after installGlobals so
 * jest.useFakeTimers() fakes rAF like under jsdom; `run.ts --triage fake-raf` does exactly this
 * and fixes ~20 smoke tests).
 */
import { describe, expect, test } from "vitest";
import { runJestFixture } from "./engines.ts";

describe.each(["jsdom", "rtd"] as const)("jest-environment-%s", (engine) => {
  test("requestAnimationFrame keeps working after a frame was requested under fake timers that were uninstalled", { timeout: 60_000 }, () => {
    const result = runJestFixture("raf-fake-timers.fixture.cjs", engine);
    if (result === null) return; // needs the upstream checkout (pnpm downstream:react-aria --install)
    expect(result.message).toBe("");
    expect(result.failures).toEqual([]);
  });
});
