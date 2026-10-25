/**
 * Downstream repro (Radix Primitives: 2 `packages/core/primitive/src/aria-hidden.test.tsx`
 * failures in both ctrl-dom modes: "inert > supports in jsdom" and the suppressOthers shadow-DOM
 * snapshot).
 *
 * Radix's `supportsInert()` is `HTMLElement.prototype.hasOwnProperty('inert')`, and
 * `suppressOthers` uses `inert` when supported, `aria-hidden` otherwise. jsdom 29 does not
 * implement the `inert` IDL attribute; @ctrl/dom does (spec-correct), so `suppressOthers` writes
 * `inert="true"` where the jsdom-recorded inline snapshot expects `aria-hidden="true"`, and the
 * test that literally asserts "not yet supported in jsdom" fails. This is a jsdom fixture
 * assumption, not a spec bug (same category as Base UI's visualViewport parity cluster).
 *
 * Spec: https://html.spec.whatwg.org/#dom-inert ([Reflect] boolean attribute on HTMLElement)
 * Owner: html-elements (decision: keep the spec attribute and record it as a known difference
 * from jsdom in docs/deviations.md, or hide it for jsdom parity).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("HTMLElement inert parity with jsdom", (make) => {
  test("HTMLElement.prototype has no own `inert` (jsdom), so Radix falls back to aria-hidden", () => {
    const window = make();
    expect(Object.prototype.hasOwnProperty.call(window.HTMLElement.prototype, "inert")).toBe(false);
  });
});
