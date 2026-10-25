/**
 * Downstream repro (Base UI TabsList "moves the tab stop off a hidden successor": roving
 * tabindex lands on a `hidden` tab).
 *
 * Base UI's visibility helper prefers `element.checkVisibility()` when it exists (jsdom does not
 * implement it, so the baseline falls back to getComputedStyle). @ctrl/dom implements
 * checkVisibility but returns true for an element with the `hidden` attribute, whose computed
 * display is "none" (getComputedStyle agrees). checkVisibility must return false when the
 * element has no associated box (display: none on it or an ancestor).
 *
 * Spec: https://drafts.csswg.org/cssom-view/#dom-element-checkvisibility (step 1)
 *       https://html.spec.whatwg.org/#hidden-elements ([hidden] { display: none })
 * Owner: css (or html-elements, wherever Element.checkVisibility lives).
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("checkVisibility() is false for display:none", (make) => {
  test("[hidden] element and child of a display:none parent", () => {
    const window = make();
    window.document.body.innerHTML = '<button hidden>x</button><div style="display:none"><span>y</span></div>';
    const button = window.document.querySelector("button");
    const span = window.document.querySelector("span");
    expect(window.getComputedStyle(button).display).toBe("none");
    // jsdom has no checkVisibility (Base UI then uses getComputedStyle); if implemented it must agree.
    if (typeof button.checkVisibility === "function") {
      expect(button.checkVisibility()).toBe(false);
      expect(span.checkVisibility()).toBe(false);
    }
  });
});
