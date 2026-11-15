/**
 * @ctrl/dom/jest-dom's toBeVisible walks @ctrl/dom's node records when the window's own
 * getComputedStyle is in place (src/matchers/style.ts `isElementVisibleImpl`), and upstream's walk
 * over the wrappers otherwise. Both must answer alike for every element: the oracle here is the
 * wrapper walk, forced by a pass-through replacement of `window.getComputedStyle`.
 *
 * Upstream: https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-visible.js
 * Specs: CSSOM getComputedStyle — https://drafts.csswg.org/cssom/#dom-window-getcomputedstyle;
 *   HTML hidden — https://html.spec.whatwg.org/#the-hidden-attribute;
 *   HTML details — https://html.spec.whatwg.org/#the-details-element
 */
import { afterEach, describe, expect, test } from "vitest";
import * as matchers from "../src/matchers.ts";

/** mulberry32: a seeded PRNG whose every output bit is usable (an LCG's low bits cycle). */
function mulberry32(seed: number): (n: number) => number {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n) | 0;
  };
}

const describeCtrlDom = process.env.JEST_DOM_IMPL === "stock" ? describe.skip : describe;

declare const document: any;
declare const window: any;

const ctx = { isNot: false, utils: { matcherHint: () => "", printReceived: String } } as any;
const visible = (el: unknown): boolean => (matchers.toBeVisible as any).call(ctx, el).pass;

const original = window.getComputedStyle;
afterEach(() => {
  window.getComputedStyle = original;
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

const STYLE = `<style>.n{display:none}.h{visibility:hidden}.c{visibility:collapse}.v{visibility:visible}.o{opacity:0}.p{opacity:.5}</style>`;
const CLASSES = ["", "", "", "n", "h", "c", "v", "o", "p"];
const INLINE = ["", "", "", "display:none", "visibility:hidden", "visibility:visible", "opacity:0", "display:contents"];

describeCtrlDom("toBeVisible — https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-visible.js", () => {
  test("the NodeImpl walk agrees with upstream's wrapper walk on every element of 150 random trees", () => {
    const rnd = mulberry32(3);
    const node = (depth: number): string => {
      const tag = ["div", "span", "details", "summary", "section", "p"][rnd(6)]!;
      const attrs =
        ` class="${CLASSES[rnd(CLASSES.length)]}" style="${INLINE[rnd(INLINE.length)]}"` +
        (rnd(8) === 0 ? " hidden" : "") +
        (tag === "details" && rnd(2) === 0 ? " open" : "");
      let kids = "";
      if (depth < 4) for (let i = rnd(3); i >= 0; i--) kids += node(depth + 1);
      return `<${tag}${attrs}>t${kids}</${tag}>`;
    };
    for (let round = 0; round < 150; round++) {
      document.head.innerHTML = STYLE;
      document.body.innerHTML = node(0) + node(0);
      // An SVG element whose nodeName is "DETAILS" without being an HTML details element.
      document.body.append(document.createElementNS("http://www.w3.org/2000/svg", "DETAILS"));
      const all = [...document.body.querySelectorAll("*")];
      window.getComputedStyle = original;
      const fast = all.map(visible);
      window.getComputedStyle = (...args: unknown[]) => original(...args);
      const upstream = all.map(visible);
      expect(fast).toEqual(upstream);
    }
  });

  test("a replaced getComputedStyle is read through, as upstream does", () => {
    document.head.innerHTML = STYLE;
    document.body.innerHTML = `<div class="n"><span id="x">x</span></div>`;
    const x = document.getElementById("x");
    expect(visible(x)).toBe(false);
    // Sentry's Jest setup: inline styles only.
    window.getComputedStyle = (el: any) => el.style;
    expect(visible(x)).toBe(true);
  });
});
