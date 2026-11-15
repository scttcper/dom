/**
 * @ctrl/dom/jest-dom's toHaveStyle remembers the normalized expectation of a style object
 * (src/matchers/style.ts `normalized`). Repeated calls must answer as the first does and as stock
 * @testing-library/jest-dom@7.0.1 does, including sequences whose read-back depends on order (a
 * shorthand then an invalid longhand reads back the shorthand's value).
 *
 * Upstream: https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-style.js
 * Specs: CSSOM setting a property — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-setproperty
 */
import { describe, expect, test } from "vitest";
import * as stock from "@testing-library/jest-dom/matchers";
import * as ours from "../src/matchers.ts";

const describeCtrlDom = process.env.JEST_DOM_IMPL === "stock" ? describe.skip : describe;

declare const document: any;

const ctx = {
  isNot: false,
  utils: { matcherHint: () => "", diff: () => "", printReceived: String, RECEIVED_COLOR: String },
} as any;

const CASES: Record<string, unknown>[] = [
  { display: "none" },
  { display: "block" },
  { margin: "1px", marginTop: "bogus" },
  // Kebab-case: an expected "" does not match through getPropertyValue(camelCase) here.
  { margin: "1px", "margin-top": "bogus" },
  // The same entries in the other order read back differently (the key keeps the order).
  { "margin-top": "bogus", margin: "1px" },
  { "margin-top": "bogus" },
  { marginTop: "bogus" },
  { marginTop: "1px" },
  { opacity: 0.5 },
  { opacity: "0.5" },
  { color: "RED" },
  { backgroundColor: "rgb(0, 0, 255)", background: "red" },
  { "--custom": "1" },
  { width: 120 },
];

describeCtrlDom("toHaveStyle — https://github.com/testing-library/jest-dom/blob/v7.0.1/src/to-have-style.js", () => {
  test("repeated calls answer as the first and as stock jest-dom", () => {
    document.body.innerHTML = `<div style="display:block;margin:1px;opacity:0.5;color:red;--custom:1;width:120px;background:red"></div>`;
    const el = document.body.firstChild;
    for (let round = 0; round < 3; round++) {
      for (const css of CASES) {
        expect([JSON.stringify(css), (ours.toHaveStyle as any).call(ctx, el, css).pass]).toEqual([
          JSON.stringify(css),
          (stock.toHaveStyle as any).call(ctx, el, css).pass,
        ]);
      }
    }
  });

  test("a value the setter would convert with user code is not remembered", () => {
    document.body.innerHTML = `<div style="width:1px"></div>`;
    const el = document.body.firstChild;
    let calls = 0;
    const width = { toString: () => (++calls, "1px") };
    (ours.toHaveStyle as any).call(ctx, el, { width });
    (ours.toHaveStyle as any).call(ctx, el, { width });
    expect(calls).toBe(2);
  });
});
