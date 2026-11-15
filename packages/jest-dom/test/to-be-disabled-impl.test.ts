/**
 * @ctrl/dom/jest-dom's toBeDisabled / toBeEnabled walk @ctrl/dom's node records
 * (src/matchers/state.ts `isElementOrAncestorDisabledImpl`). They must answer what stock
 * @testing-library/jest-dom@7.0.1 answers on the same elements: random trees of fieldsets with
 * and without (first) legends, disableable controls, custom elements, and names whose tagName
 * lowercases into a disableable tag without being an HTML control (SVG, prefixed, uppercase).
 *
 * Upstream: https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-be-disabled.js
 * Specs: HTML disabled elements — https://html.spec.whatwg.org/#concept-element-disabled;
 *   fieldset — https://html.spec.whatwg.org/#concept-fieldset-disabled
 */
import { describe, expect, test } from "vitest";
import * as stock from "@testing-library/jest-dom/matchers";
import * as ours from "../src/matchers.ts";

const describeCtrlDom = process.env.JEST_DOM_IMPL === "stock" ? describe.skip : describe;

declare const document: any;

/** mulberry32: a seeded PRNG whose every output bit is usable. */
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

const ctx = { isNot: false, utils: { matcherHint: () => "", printReceived: String } } as any;
const TAGS = [
  "fieldset",
  "legend",
  "legend",
  "input",
  "button",
  "select",
  "option",
  "optgroup",
  "textarea",
  "div",
  "x-el",
  "span",
];

describeCtrlDom("toBeDisabled — https://html.spec.whatwg.org/#concept-element-disabled", () => {
  test("agrees with stock jest-dom on every element of 200 random trees", () => {
    const rnd = mulberry32(11);
    const build = (parent: any, depth: number): void => {
      for (let i = rnd(4); i >= 0; i--) {
        const kind = rnd(20);
        const el =
          kind === 0
            ? document.createElementNS("http://www.w3.org/2000/svg", "input")
            : kind === 1
              ? document.createElementNS("http://www.w3.org/1999/xhtml", "x:fieldset")
              : kind === 2
                ? document.createElementNS("http://www.w3.org/1999/xhtml", "BUTTON")
                : document.createElement(TAGS[rnd(TAGS.length)]!);
        if (rnd(3) === 0) el.setAttribute("disabled", "");
        parent.append(el);
        if (depth < 4) build(el, depth + 1);
      }
    };
    for (let round = 0; round < 200; round++) {
      document.body.innerHTML = "";
      build(document.body, 0);
      for (const el of document.body.querySelectorAll("*")) {
        if (!(el instanceof (globalThis as any).HTMLElement) && !(el instanceof (globalThis as any).SVGElement))
          continue;
        expect([(ours.toBeDisabled as any).call(ctx, el).pass, (ours.toBeEnabled as any).call(ctx, el).pass]).toEqual([
          (stock.toBeDisabled as any).call(ctx, el).pass,
          (stock.toBeEnabled as any).call(ctx, el).pass,
        ]);
      }
    }
  });
});
