/**
 * @ctrl/dom/jest-dom divergence from upstream toHaveStyle: a single expected color matches the
 * same color in any legacy sRGB serialization (named / hex / rgb() / hsl()), so tests pass
 * whether the DOM serializes colors as authored or as rgb(). Failure messages are upstream's.
 * Colors: https://drafts.csswg.org/css-color-4/#color-syntax
 */
import { describe, expect, test } from "vitest";

// @ctrl/dom/jest-dom-only behavior: skipped when the suite runs the stock implementation.
const describeCtrlDom = process.env.JEST_DOM_IMPL === "stock" ? describe.skip : describe;
import { canonicalColor, sameColor } from "../src/color.ts";
import * as matchers from "../src/matchers.ts";

declare const document: any;

describeCtrlDom("canonicalColor — https://drafts.csswg.org/css-color-4/#color-syntax", () => {
  test("named, hex, rgb() and hsl() forms of one color share a key", () => {
    const forms = [
      "red",
      "RED",
      "#f00",
      "#ff0000",
      "#ff0000ff",
      "rgb(255, 0, 0)",
      "rgba(255,0,0,1)",
      "rgb(255 0 0 / 100%)",
      "hsl(0, 100%, 50%)",
      "hsl(0deg 100% 50%)",
    ];
    for (const form of forms) expect(canonicalColor(form), form).toBe(canonicalColor("red"));
  });

  test("alpha and transparent are part of the key", () => {
    expect(sameColor("transparent", "rgba(0, 0, 0, 0)")).toBe(true);
    expect(sameColor("rgba(255, 0, 0, 0.5)", "red")).toBe(false);
    expect(sameColor("#ff000080", "rgba(255, 0, 0, 0.502)")).toBe(true);
  });

  test("non-colors and multi-token values never match", () => {
    expect(canonicalColor("1px solid red")).toBeNull();
    expect(canonicalColor("currentcolor")).toBeNull();
    expect(canonicalColor("12px")).toBeNull();
    expect(sameColor("", "")).toBe(false);
  });
});

describeCtrlDom("toHaveStyle color serialization independence", () => {
  const ctx = {
    isNot: false,
    equals: Object.is,
    utils: { matcherHint: (n: string) => `expect(element)${n}()`, diff: (a: string, b: string) => `- ${a}\n+ ${b}` },
  };

  test("named expectation vs rgb() computed value and vice versa", () => {
    const el = document.body.appendChild(document.createElement("div"));
    el.style.color = "rgb(255, 0, 0)";
    el.style.backgroundColor = "blue";
    expect(el).toHaveStyle({ color: "red" });
    expect(el).toHaveStyle("color: #f00; background-color: rgb(0, 0, 255)");
    expect(el).not.toHaveStyle({ color: "blue" });
    el.remove();
  });

  test("failure messages print the raw (unconverted) values", () => {
    const el = document.body.appendChild(document.createElement("div"));
    el.style.color = "green";
    const result = (matchers.toHaveStyle as any).call(ctx, el, { color: "red" });
    expect(result.pass).toBe(false);
    expect(result.message()).toContain("color: red;");
    expect(result.message()).not.toContain("255");
    el.remove();
  });
});
