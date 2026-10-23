/**
 * Downstream repro (Base UI: getViewportRect "falls back to the document element without a
 * visual viewport" + 3 NavigationMenu `prop: side` tests; 4 failures in both rtd modes).
 *
 * jsdom has no `window.visualViewport`; Floating UI then uses the document element's client
 * box (0x0 without layout) for collision detection. @rtd/dom exposes a VisualViewport sized
 * 1024x768, so with zero-sized triggers/popups Floating UI flips sides differently and the
 * jsdom-only assertions (`expect(window.visualViewport).toBe(undefined)`) fail. This is a jsdom
 * fixture assumption rather than a spec bug (the same finding as ~/gh/vibedom).
 *
 * Spec: https://drafts.csswg.org/cssom-view/#the-visualviewport-interface
 * Owner: window (decide: omit visualViewport by default / make it opt-in, or accept as a known
 * difference).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("window.visualViewport parity with jsdom", (make) => {
  test("visualViewport is undefined (jsdom) so libraries fall back to documentElement", () => {
    expect(make().visualViewport).toBe(undefined);
  });
});
