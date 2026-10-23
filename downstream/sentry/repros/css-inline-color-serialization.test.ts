/**
 * Downstream repro (Sentry: ansiText.spec.tsx "resolves 256-color and truecolor codes to their
 * RGB values"; AnsiText writes `style.color = "color-mix(in srgb, #ff8700 80%, currentColor)"`
 * and the test reads back `segment.style.color` expecting "rgb(255, 135, 0)").
 *
 * Reading a declaration from `element.style` serializes the *specified* value: hex colors
 * serialize as `rgb()`/`rgba()` and keywords are lower-cased (`currentcolor`), including inside
 * color functions such as color-mix(). jsdom (cssstyle) does this; @rtd/dom returns the author
 * text unchanged. (docs/deviations.md keeps author colors for getComputedStyle only.)
 *
 * Spec: https://drafts.csswg.org/cssom/#serialize-a-css-value
 *       https://drafts.csswg.org/css-color-4/#serializing-sRGB-values
 *       https://drafts.csswg.org/css-color-5/#serial-color-mix
 * Owner: css.
 */
import { expect, test } from "vitest";
import { differential } from "./engines.ts";

differential("element.style color serialization", (make) => {
  test("hex inside color-mix() reads back as rgb()", () => {
    const window = make();
    const el = window.document.createElement("span");
    el.style.color = "color-mix(in srgb, #ff8700 80%, currentColor)";
    expect(el.style.color).toContain("rgb(255, 135, 0)");
    expect(el.style.color).toBe("color-mix(in srgb, rgb(255, 135, 0) 80%, currentcolor)");
  });
});
