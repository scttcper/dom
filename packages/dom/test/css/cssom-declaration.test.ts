/**
 * CSSStyleDeclaration algorithms and the shorthands `toHaveStyle` compares.
 *
 * Specs:
 *   CSSOM §6.6 The CSSStyleDeclaration interface — https://drafts.csswg.org/cssom/#the-cssstyledeclaration-interface
 *   CSSOM §6.5 CSS declaration blocks — https://drafts.csswg.org/cssom/#css-declaration-blocks
 *   CSSOM §6.6.1 CSS property to IDL attribute — https://drafts.csswg.org/cssom/#css-property-to-idl-attribute
 *   CSSOM shorthands preferred order — https://drafts.csswg.org/cssom/#concept-shorthands-preferred-order
 *   CSS Cascade 5 §1.2 shorthand properties — https://drafts.csswg.org/css-cascade-5/#shorthand
 *   Flexbox §7.1 flex, §5.3 flex-flow — https://drafts.csswg.org/css-flexbox-1/#flex-property, #flex-flow-property
 *   Box Alignment §8.4 gap — https://drafts.csswg.org/css-align-3/#gap-shorthand
 *   Positioning §3.1 inset — https://drafts.csswg.org/css-position-3/#inset-shorthands
 *   Lists §3 list-style — https://drafts.csswg.org/css-lists-3/#list-style-property
 *   Overflow §3 overflow — https://drafts.csswg.org/css-overflow-3/#propdef-overflow
 *   UI 4 §3.1 outline — https://drafts.csswg.org/css-ui-4/#outline
 *
 * Where jsdom (cssstyle) agrees with the spec the same steps are asserted on it too
 * (`onJsdom`), since suites were written against it.
 */
import { beforeEach, describe, expect, test } from "vitest";
import { JSDOM } from "jsdom";
import { createWindow, type Document, type Window } from "@ctrl/dom";

/* eslint-disable @typescript-eslint/no-explicit-any */
let window: Window;
let document: Document;
beforeEach(() => {
  window = createWindow();
  document = window.document;
});

function style(): any {
  return (document.body!.appendChild(document.createElement("div")) as any).style;
}

const jsdomDoc = new JSDOM("<!doctype html><body></body>").window.document;
/** Runs `fn` on a fresh inline style of ours and of jsdom; returns both results. */
function onBoth<R>(fn: (s: any) => R): { "ctrl-dom": R; jsdom: R } {
  const theirs = jsdomDoc.body.appendChild(jsdomDoc.createElement("div")).style;
  return { "ctrl-dom": fn(style()), jsdom: fn(theirs) };
}

describe("cssText — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-csstext", () => {
  test("setter: parses a declaration block, replacing every existing declaration (https://drafts.csswg.org/cssom/#parse-a-css-declaration-block)", () => {
    expect(
      onBoth((s) => {
        s.color = "red";
        s.cssText = "width: 10px; height: 5px";
        return [s.color, s.width, s.height, s.length];
      }),
    ).toEqual({ "ctrl-dom": ["", "10px", "5px", 2], jsdom: ["", "10px", "5px", 2] });
  });

  test("setter: invalid declarations and unknown properties are dropped; the last valid one of a property wins", () => {
    expect(onBoth((s) => ((s.cssText = "color: nope; foo: bar; width: 1px; width: 2px"), s.cssText))).toEqual({
      "ctrl-dom": "width: 2px;",
      jsdom: "width: 2px;",
    });
  });

  test("getter: serializes declarations as `name: value;` joined by a space, !important kept (https://drafts.csswg.org/cssom/#serialize-a-css-declaration-block)", () => {
    expect(onBoth((s) => ((s.cssText = "color:red  !IMPORTANT;width:1px"), s.cssText))).toEqual({
      "ctrl-dom": "color: red !important; width: 1px;",
      jsdom: "color: red !important; width: 1px;",
    });
  });

  test("getter: longhands that complete a shorthand serialize as the shorthand (preferred order)", () => {
    expect(
      onBoth((s) => ((s.cssText = "margin-top:1px;margin-right:2px;margin-bottom:1px;margin-left:2px"), s.cssText)),
    ).toEqual({
      "ctrl-dom": "margin: 1px 2px;",
      jsdom: "margin: 1px 2px;",
    });
  });

  test("getter: a shorthand is not used when its longhands differ in importance", () => {
    const s = style();
    s.cssText = "margin: 1px; margin-top: 2px !important";
    expect(s.getPropertyValue("margin")).toBe("");
    expect(s.cssText).toContain("margin-top: 2px !important;");
  });

  test("computed declarations serialize cssText as the empty string", () => {
    document.body!.innerHTML = `<p style="color: red">x</p>`;
    expect(window.getComputedStyle(document.querySelector("p")!).cssText).toBe("");
  });
});

describe("setProperty — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-setproperty", () => {
  test("step 1: a computed (readonly) declaration throws NoModificationAllowedError", () => {
    document.body!.innerHTML = `<p>x</p>`;
    const cs = window.getComputedStyle(document.querySelector("p")!) as any;
    expect(() => cs.setProperty("color", "red")).toThrow(
      expect.objectContaining({ name: "NoModificationAllowedError" }),
    );
  });

  test("step 2: property names are ASCII lower-cased unless custom properties", () => {
    const s = style();
    s.setProperty("COLOR", "red");
    s.setProperty("--MyVar", "1");
    expect([s.color, s.getPropertyValue("--MyVar"), s.getPropertyValue("--myvar")]).toEqual(["red", "1", ""]);
  });

  test("step 4: an empty value removes the property", () => {
    expect(onBoth((s) => (s.setProperty("color", "red"), s.setProperty("color", ""), [s.color, s.length]))).toEqual({
      "ctrl-dom": ["", 0],
      jsdom: ["", 0],
    });
  });

  test('step 5: a priority other than "important" (ASCII case-insensitive) or "" makes the call a no-op', () => {
    // jsdom (cssstyle) differs: it rejects "IMPORTANT" and stores the value for any other priority.
    const s = style();
    s.setProperty("color", "red", "IMPORTANT");
    s.setProperty("width", "1px", "high");
    expect([s.getPropertyPriority("color"), s.width]).toEqual(["important", ""]);
  });

  test("step 6: an unparsable value is ignored and keeps the old value", () => {
    expect(onBoth((s) => (s.setProperty("width", "1px"), s.setProperty("width", "wide"), s.width))).toEqual({
      "ctrl-dom": "1px",
      jsdom: "1px",
    });
  });

  test("step 8: a shorthand sets each longhand with the priority", () => {
    const s = style();
    s.setProperty("padding", "1px 2px", "important");
    expect([s.paddingLeft, s.getPropertyPriority("padding-left"), s.getPropertyPriority("padding")]).toEqual([
      "2px",
      "important",
      "important",
    ]);
  });

  test("step 9: setting the same value does not rewrite the style attribute (no mutation record)", () => {
    const el = document.body!.appendChild(document.createElement("div")) as any;
    el.style.color = "red";
    const records: unknown[] = [];
    const mo = new (window as any).MutationObserver((r: unknown[]) => records.push(...r));
    mo.observe(el, { attributes: true });
    el.style.setProperty("color", "red");
    expect(mo.takeRecords()).toHaveLength(0);
  });
});

describe("removeProperty — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-removeproperty", () => {
  test('returns the old value; removing a missing property returns ""', () => {
    expect(onBoth((s) => ((s.color = "red"), [s.removeProperty("color"), s.removeProperty("color")]))).toEqual({
      "ctrl-dom": ["red", ""],
      jsdom: ["red", ""],
    });
  });

  test("step 5: removing a shorthand removes all of its longhands and returns its serialization", () => {
    // jsdom (cssstyle) differs: it removes the shorthand entry and keeps the longhands.
    const s = style();
    s.cssText = "margin: 1px 2px; color: red";
    expect([s.removeProperty("margin"), s.cssText]).toEqual(["1px 2px", "color: red;"]);
  });

  test("removing one longhand of a shorthand leaves the others (shorthand no longer serializes)", () => {
    const s = style();
    s.margin = "1px";
    s.removeProperty("margin-top");
    expect([s.margin, s.marginLeft, s.length]).toEqual(["", "1px", 3]);
  });
});

describe("getPropertyValue / getPropertyPriority — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-getpropertypriority", () => {
  test("a shorthand is important only if every longhand is", () => {
    const s = style();
    s.cssText = "margin: 1px !important";
    expect(s.getPropertyPriority("margin")).toBe("important");
    s.setProperty("margin-top", "2px");
    expect([s.getPropertyPriority("margin"), s.getPropertyPriority("margin-left")]).toEqual(["", "important"]);
  });

  test('unknown properties return ""', () => {
    const s = style();
    expect([s.getPropertyValue("nope"), s.getPropertyPriority("nope")]).toEqual(["", ""]);
  });
});

describe("length / item — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-item", () => {
  test('shorthands count as their longhands; item() out of range returns ""', () => {
    // jsdom (cssstyle) differs: it also lists the shorthand itself as an item.
    const s = style();
    s.cssText = "padding: 1px; color: red";
    expect([s.length, s.item(0), s.item(4), s.item(5), s.item(-1)]).toEqual([5, "padding-top", "color", "", ""]);
  });

  test("indexed properties follow additions, removals and style attribute changes; a value-only update keeps them", () => {
    const el = document.createElement("div") as any;
    const s = el.style;
    s.color = "red";
    s.width = "1px";
    expect([s[0], s[1], s[2]]).toEqual(["color", "width", undefined]);
    s.color = "blue";
    expect([s[0], s[1], s.length]).toEqual(["color", "width", 2]);
    s.removeProperty("color");
    expect([s[0], s[1], s.length]).toEqual(["width", undefined, 1]);
    el.setAttribute("style", "top: 1px; left: 2px");
    expect([s[0], s[1], s[2]]).toEqual(["top", "left", undefined]);
  });
});

describe("parentRule — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-parentrule", () => {
  test("null for inline styles; the rule for rule styles", () => {
    document.head!.innerHTML = `<style>p { color: red }</style>`;
    const rule = (document as any).styleSheets[0].cssRules[0];
    expect(rule.style.parentRule).toBe(rule);
    expect(style().parentRule).toBeNull();
  });
});

describe("cssFloat and named attributes — https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-cssfloat", () => {
  test("cssFloat reads and writes float", () => {
    expect(onBoth((s) => ((s.cssFloat = "left"), [s.getPropertyValue("float"), s.cssFloat]))).toEqual({
      "ctrl-dom": ["left", "left"],
      jsdom: ["left", "left"],
    });
  });

  test("CSS property to IDL attribute: dashes followed by a letter become upper-case; -webkit- gets both webkit* and Webkit* (https://drafts.csswg.org/cssom/#css-property-to-idl-attribute)", () => {
    const s = style();
    s.borderTopLeftRadius = "2px";
    s.webkitLineClamp = "2";
    expect([s.getPropertyValue("border-top-left-radius"), s["border-top-left-radius"], s.WebkitLineClamp]).toEqual([
      "2px",
      "2px",
      "2",
    ]);
  });
});

describe("cascade-only shorthands — https://drafts.csswg.org/css-cascade-5/#shorthand", () => {
  function computed(decl: string, ...props: string[]): string[] {
    document.body!.innerHTML = `<div style="${decl}"></div>`;
    const cs = window.getComputedStyle(document.querySelector("div")!) as any;
    return props.map((p) => cs.getPropertyValue(p));
  }

  test("overflow: <'overflow-block'>{1,2} sets overflow-x and overflow-y (https://drafts.csswg.org/css-overflow-3/#propdef-overflow)", () => {
    expect(computed("overflow: hidden", "overflow-x", "overflow-y", "overflow")).toEqual([
      "hidden",
      "hidden",
      "hidden",
    ]);
    expect(computed("overflow: hidden auto", "overflow-x", "overflow-y", "overflow")).toEqual([
      "hidden",
      "auto",
      "hidden auto",
    ]);
  });

  test("gap: <'row-gap'> <'column-gap'>? (https://drafts.csswg.org/css-align-3/#gap-shorthand)", () => {
    expect(computed("gap: 4px", "row-gap", "column-gap")).toEqual(["4px", "4px"]);
    expect(computed("gap: 4px 8px", "row-gap", "column-gap", "gap")).toEqual(["4px", "8px", "4px 8px"]);
  });

  test("inset: <'top'>{1,4} with box expansion (https://drafts.csswg.org/css-position-3/#inset-shorthands)", () => {
    expect(computed("inset: 1px 2px 3px", "top", "right", "bottom", "left")).toEqual(["1px", "2px", "3px", "2px"]);
  });

  test("flex-flow: <'flex-direction'> || <'flex-wrap'>, in any order (https://drafts.csswg.org/css-flexbox-1/#flex-flow-property)", () => {
    expect(computed("flex-flow: wrap column", "flex-direction", "flex-wrap")).toEqual(["column", "wrap"]);
    expect(computed("flex-flow: row-reverse", "flex-direction", "flex-wrap")).toEqual(["row-reverse", "nowrap"]);
  });

  test("list-style: none sets whichever of image/type is not otherwise set (https://drafts.csswg.org/css-lists-3/#list-style-property)", () => {
    expect(computed("list-style: inside none", "list-style-position", "list-style-image", "list-style-type")).toEqual([
      "inside",
      "none",
      "none",
    ]);
    expect(computed("list-style: square", "list-style-position", "list-style-image", "list-style-type")).toEqual([
      "outside",
      "none",
      "square",
    ]);
  });

  test("outline: <outline-color> || <outline-line-style> || <outline-line-width> (https://drafts.csswg.org/css-ui-4/#outline)", () => {
    expect(computed("outline: dashed 2px", "outline-style", "outline-width")).toEqual(["dashed", "2px"]);
  });

  test("the declaration block keeps the shorthand as written (jsdom-compatible style.overflow)", () => {
    expect(onBoth((s) => ((s.overflow = "hidden"), s.cssText))).toEqual({
      "ctrl-dom": "overflow: hidden;",
      jsdom: "overflow: hidden;",
    });
  });
});

describe("expanded shorthands — https://drafts.csswg.org/cssom/#concept-shorthands-preferred-order", () => {
  test("flex: single number → <grow> 1 0% (https://drafts.csswg.org/css-flexbox-1/#flex-property)", () => {
    expect(onBoth((s) => ((s.flex = "2"), [s.flexGrow, s.flexShrink, s.flexBasis]))).toEqual({
      "ctrl-dom": ["2", "1", "0%"],
      jsdom: ["2", "1", "0%"],
    });
  });

  test("flex: none → 0 0 auto; auto → 1 1 auto", () => {
    const s = style();
    s.flex = "none";
    expect([s.flexGrow, s.flexShrink, s.flexBasis]).toEqual(["0", "0", "auto"]);
    s.flex = "auto";
    expect([s.flexGrow, s.flexShrink, s.flexBasis]).toEqual(["1", "1", "auto"]);
  });

  test("border: sets width/style/color on four sides and resets border-image", () => {
    expect(
      onBoth(
        (s) => ((s.border = "1px solid red"), [s.borderLeftWidth, s.borderTopStyle, s.borderBottomColor, s.border]),
      ),
    ).toEqual({
      "ctrl-dom": ["1px", "solid", "red", "1px solid red"],
      jsdom: ["1px", "solid", "red", "1px solid red"],
    });
  });

  test("margin with one to four values expands per the box model", () => {
    expect(
      onBoth((s) => ((s.margin = "1px 2px 3px"), [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft])),
    ).toEqual({
      "ctrl-dom": ["1px", "2px", "3px", "2px"],
      jsdom: ["1px", "2px", "3px", "2px"],
    });
  });

  test("CSS-wide keywords on a shorthand set every longhand; mixed keywords do not serialize", () => {
    const s = style();
    s.margin = "inherit";
    expect([s.marginTop, s.margin]).toEqual(["inherit", "inherit"]);
    s.marginTop = "initial";
    expect(s.margin).toBe("");
  });
});
