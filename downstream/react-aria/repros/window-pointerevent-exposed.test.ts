/**
 * Downstream note-repro (React Aria: ~41 ctrl-dom failures, e.g. useOverlay "should hide the overlay
 * when clicking outside" (Mouse/Touch Events), RAC Menu "closes the menu on click outside").
 * `run.ts --triage no-pointer-event` (delete the global PointerEvent) makes them pass.
 *
 * React Aria feature-detects `typeof PointerEvent !== 'undefined'` (useInteractOutside, usePress,
 * useMove, ...) and then listens for pointer events only. Upstream's suite targets jsdom 26,
 * which has no PointerEvent: its "Mouse Events" / "Touch Events" variants fire only mouse/touch
 * events, and the "Pointer Events" variant installs a fake PointerEvent first. @ctrl/dom exposes
 * PointerEvent (like browsers and jsdom >= 27), so React Aria ignores those mouse events.
 *
 * Not a DOM bug: an assumption of the upstream suite about jsdom. The jsdom case below uses upstream's
 * own jsdom (26) from the checkout to show the baseline. Owner: window/events (decision: keep
 * spec-correct PointerEvent; listed in TRIAGE.md as a jsdom assumption).
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { hasCheckout, windows } from "./engines.ts";

const jsdom26 = () => {
  const require = createRequire(fileURLToPath(new URL("../checkout/package.json", import.meta.url)));
  const { JSDOM } = require("jsdom");
  return new JSDOM("").window;
};

describe("PointerEvent global (what React Aria feature-detects)", () => {
  test.skipIf(!hasCheckout)("upstream's jsdom 26 baseline has no PointerEvent", () => {
    expect(typeof jsdom26().PointerEvent).toBe("undefined");
  });
  test("@ctrl/dom exposes PointerEvent (spec-correct; upstream mouse-only tests then take React Aria's pointer path)", () => {
    expect(typeof windows["ctrl-dom"]().PointerEvent).toBe("function");
  });
});
