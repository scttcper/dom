/**
 * Downstream repro (Sentry: 29 spec files, e.g. searchQueryBuilder/index.spec.tsx "keyboard
 * interactions" — 36 tests in that file alone):
 *
 *   // jsdom does not support clipboard API
 *   Object.assign(navigator, {clipboard: {writeText: jest.fn()}});
 *
 * jsdom has no `navigator.clipboard`, so the [[Set]] creates an own data property. @ctrl/dom
 * implements `clipboard` as a getter-only accessor on Navigator.prototype, so the assignment
 * throws "Cannot set property clipboard of [object Object] which has only a getter" in strict
 * mode (all ESM/TS test code). Browsers also throw here, but drop-in jsdom compatibility needs
 * the idiom to keep working: e.g. make `clipboard` a [Replaceable]-style accessor (setter that
 * defines an own data property), recorded in docs/deviations.md.
 *
 * Spec: https://w3c.github.io/clipboard-apis/#navigator-interface ([SecureContext, SameObject]
 *       readonly attribute) — the deviation would be deliberate.
 * Owner: window (Navigator).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("Object.assign(navigator, {clipboard}) in strict mode", (make) => {
  test("replaces navigator.clipboard", () => {
    "use strict";
    const window = make();
    const stub = { writeText: async () => {} };
    expect(() => Object.assign(window.navigator, { clipboard: stub })).not.toThrow();
    expect(window.navigator.clipboard).toBe(stub);
  });
});
