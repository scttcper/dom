/**
 * Downstream repro — worker memory leak (Sentry components preset with a forced GC per file:
 * Jest worker heap grows 7.2 MiB per test file on rtd-dom vs 0.26 MiB on jsdom; ~1 GiB retained
 * per worker after ~120 files; with GC sampling the rtd run takes 88 s vs 49 s).
 *
 * jsdom's window owns its timers: `window.setTimeout` is per-window and `window.close()` (called
 * by jest-environment-jsdom's teardown) clears every pending timer, so a test file's module
 * registry becomes garbage as soon as the file ends. @rtd/dom's `window.setTimeout` /
 * `setInterval` are the host's (window/Window.ts HOST_DELEGATES) and `close()` leaves them
 * pending. Long timers that app code routinely leaves behind (TanStack Query cache GC timers,
 * 5 min; debounces; polling intervals) keep their closures — and through them the whole vm
 * context and module graph of the finished test file — alive until they fire.
 * downstream/sentry measured it directly: 30 files that each leave
 * `setTimeout(() => big, 300_000)` grow a worker by 14 MiB per file on rtd, 0 on jsdom.
 *
 * Fix options: per-window timer bookkeeping cleared by `close()` (jsdom parity; must keep fake
 * timers working since they replace the global functions), or jest-environment-rtd wrapping
 * the vm global's timer functions and clearing what is still pending at teardown.
 * Spec: https://html.spec.whatwg.org/#timers (the map of active timers belongs to the global);
 *       https://html.spec.whatwg.org/#close-a-browsing-context
 * Owner: window (timers) + jest-environment (teardown).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("window timers after window.close()", (make) => {
  test("pending setTimeout/setInterval callbacks never run once the window is closed", async () => {
    const window = make();
    let fired = 0;
    window.setTimeout(() => fired++, 10);
    window.setInterval(() => fired++, 10);
    window.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fired).toBe(0);
  });
});
