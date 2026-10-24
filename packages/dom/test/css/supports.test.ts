/**
 * CSS.supports() and @supports conditions.
 *
 * Specs:
 *   CSS Conditional 3 §6.1 @supports grammar — https://drafts.csswg.org/css-conditional-3/#at-supports
 *   CSS Conditional 3 §8.1 CSS.supports() — https://drafts.csswg.org/css-conditional-3/#dom-css-supports
 *     and the conditionText form — https://drafts.csswg.org/css-conditional-3/#dom-css-supports-conditiontext
 *   CSS Conditional 4 §2 selector() — https://drafts.csswg.org/css-conditional-4/#at-supports-ext
 *   CSS Conditional 5 font-tech()/font-format() — https://drafts.csswg.org/css-conditional-5/#at-supports-ext
 */
import { describe, expect, test } from "vitest";
import { createWindow, CSS } from "@rtd/dom";

createWindow();

describe("CSS.supports(property, value) — https://drafts.csswg.org/css-conditional-3/#dom-css-supports", () => {
  test("true when the value parses for a supported property; property names are ASCII case-insensitive", () => {
    expect([CSS.supports("display", "grid"), CSS.supports("DISPLAY", "flex"), CSS.supports("display", "nope"), CSS.supports("not-a-prop", "1")]).toEqual([true, true, false, false]);
  });

  test("a value with !important is not a value (false)", () => {
    expect(CSS.supports("color", "red !important")).toBe(false);
  });

  test("custom properties accept any value (and keep case)", () => {
    expect([CSS.supports("--Any", "{ not: css }"), CSS.supports("--x", "1px")]).toEqual([true, true]);
  });
});

describe("CSS.supports(conditionText) — https://drafts.csswg.org/css-conditional-3/#dom-css-supports-conditiontext", () => {
  test("parenthesized declarations, with an optional !important", () => {
    expect([CSS.supports("(display: grid)"), CSS.supports("(color: red !important)"), CSS.supports("(color: nope)")]).toEqual([true, true, false]);
  });

  test("not / and / or with parentheses", () => {
    expect([
      CSS.supports("not (color: nope)"),
      CSS.supports("(display: grid) and (color: red)"),
      CSS.supports("(display: nope) or (color: red)"),
      CSS.supports("(display: grid) and ((color: nope) or (gap: 1px))"),
    ]).toEqual([true, true, true, true]);
  });

  test("mixing and/or without parentheses, or a bare not, is a syntax error (false)", () => {
    expect([CSS.supports("(color: red) and (gap: 1px) or (display: grid)"), CSS.supports("not not (color: red)")]).toEqual([false, false]);
  });

  test("a bare declaration without parentheses is accepted (browser compat)", () => {
    expect(CSS.supports("display: flex")).toBe(true);
  });

  test("<general-enclosed> (unknown functions) evaluates to false", () => {
    expect([CSS.supports("whatever(x)"), CSS.supports("(color: red) or whatever(x)")]).toEqual([false, true]);
  });
});

describe("selector() — https://drafts.csswg.org/css-conditional-4/#at-supports-ext", () => {
  test("true for selectors the engine parses, false for invalid or unsupported ones", () => {
    expect([CSS.supports("selector(:has(> img))"), CSS.supports("selector(a > b)"), CSS.supports("selector(:bogus)"), CSS.supports("not selector(:bogus)")]).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });

  test("forgiving lists are not forgiving inside selector() (:is(:bogus) is unsupported)", () => {
    expect(CSS.supports("selector(:is(:bogus))")).toBe(false);
  });
});

describe("font-tech() / font-format() — https://drafts.csswg.org/css-conditional-5/#at-supports-ext", () => {
  test("parse, and evaluate to false (no font loading)", () => {
    expect([CSS.supports("font-format(woff2)"), CSS.supports("not font-tech(color-COLRv1)")]).toEqual([false, true]);
  });
});
